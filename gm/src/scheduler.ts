/**
 * TickScheduler — closes the loop once per tick:
 *
 *   drain the intent pool -> sign each order (custodial EIP-712) ->
 *   commit Bucket-2 root -> drive the chain (commit/word/settle) ->
 *   read the SETTLED outcomes back from chain events -> narrate.
 *
 * Narration happens strictly after settlement and strictly from events:
 * the narrator structurally cannot announce anything the chain didn't do.
 * Designed to be fired by any cron; duplicate or missed fires are safe
 * because the driver resumes and the pool drains atomically.
 */

import type { AgentIntentPool } from "./agentPool.js";
import { bucket2Root, type Bucket2State } from "./bucket2.js";
import type { ComputeMeter, ComputeSink } from "./computeMeter.js";
import type { ChainOps, TickDriver, TickRecord } from "./driver.js";
import type { FactionAgent, FactionMemory, WorldView } from "./faction.js";
import type { IntentPool } from "./intentPool.js";
import type { Narrator, SettledOutcome, TickSummary } from "./narrator.js";
import { WAD, type CustodialSigner } from "./signer.js";
import type { Address, SignedContest } from "./types.js";

export interface RawOutcome {
  tileId: bigint;
  attacker: Address;
  defender: Address;
  attackerWon: boolean;
  pWad: bigint;
  roll: bigint;
  burned: bigint;
}

export interface RawTickSummary {
  outcomes: RawOutcome[];
  minted: bigint;
  burned: bigint;
  skipped: Array<{ attacker: Address; tileId: bigint; reason: number }>;
}

export type TickSummaryReader = (
  regionId: bigint,
  tick: bigint,
) => Promise<RawTickSummary>;

const SKIP_REASONS = [
  "they already hold that tile",
  "a duplicate order was set aside",
  "their war chest could not cover the commit",
];

const ZERO = "0x0000000000000000000000000000000000000000";

/** an autonomous faction seat at the table (Hermes, or a heuristic stand-in) */
export interface FactionSeat {
  handle: string;      // custodial keystore handle, e.g. "faction:ashen"
  display: string;     // "Ashen Horde"
  agent: FactionAgent;
  memory: FactionMemory;
}

export interface SchedulerDeps {
  regionId: bigint;
  chainId: number;
  settlement: Address;
  pool: IntentPool;
  /** optional pool of pre-signed moves from external self-custody agents
   *  (docs/AGENT_PROTOCOL.md) — merged into the same batch, never re-signed */
  agentPool?: AgentIntentPool;
  signer: CustodialSigner;
  driver: TickDriver;
  ops: ChainOps;
  readSummary: TickSummaryReader;
  narrator: Narrator;
  /** where the war report goes (the game channel) */
  announce: (text: string) => Promise<void>;
  /** optional GM-compute meter — prices Hermes usage in Flux and guards
   *  emission≤sink each tick (CLAUDE.md). Absent on the deterministic path. */
  meter?: ComputeMeter;
  /** optional on-chain sink — burns the metered compute Flux from the operator
   *  treasury so supply actually drops. Best-effort, after settlement. */
  sink?: ComputeSink;
  /** optional AI factions that move every tick (the world moves while you
   *  sleep). Needs readWorld + readEscrow to give each agent its view. */
  factions?: FactionSeat[];
  readWorld?: (regionId: bigint) => Promise<WorldView>;
  readEscrow?: (addr: Address) => Promise<number>;
}

export class TickScheduler {
  constructor(private readonly d: SchedulerDeps) {}

  /** one tick close; safe under duplicate fires */
  async runOnce(): Promise<TickRecord> {
    const d = this.d;
    const tick = (await d.ops.lastSettledTick(d.regionId)) + 1n;

    d.meter?.reset(); // start this tick's GM-compute window

    const orders = d.pool.drain();
    const names = new Map<string, string>();
    const contests: SignedContest[] = [];
    for (const o of orders) {
      const contest = await d.signer.signContest(
        o.handle,
        d.chainId,
        d.settlement,
        {
          regionId: d.regionId,
          tick,
          tileId: BigInt(o.intent.tileId),
          // whole-token NL amounts -> WAD (0.1-Flux precision)
          committed:
            (BigInt(Math.round(o.intent.committed * 10)) * WAD) / 10n,
        },
      );
      names.set(contest.attacker.toLowerCase(), o.display);
      contests.push(contest);
    }

    // External agents (public arena): their moves arrive ALREADY EIP-712
    // -signed by their own keys. We merge them as-is — the service never holds
    // their keys, so it cannot forge. An intent signed for a tick that has
    // since closed is dropped (the on-chain signature check would reject it).
    if (d.agentPool) {
      for (const e of d.agentPool.drain()) {
        if (e.tick !== tick) {
          console.warn(
            `dropping stale agent intent: signed tick ${e.tick}, settling ${tick}`);
          continue;
        }
        names.set(e.contest.attacker.toLowerCase(), e.display);
        contests.push(e.contest);
      }
    }

    // The world moves while you sleep: each AI faction issues a signed
    // intent from its own wallet, exactly like a human. Its move is chosen
    // by intelligence (Hermes, or a heuristic); its OUTCOME is the chain's.
    if (d.factions?.length && d.readWorld && d.readEscrow) {
      const world = await d.readWorld(d.regionId);
      for (const seat of d.factions) {
        const address = d.signer.wallet(seat.handle).address as Address;
        const escrow = await d.readEscrow(address);
        let move = null;
        try {
          move = await seat.agent.decide({
            faction: { handle: seat.handle, display: seat.display, address, escrow },
            world,
            memory: seat.memory,
          });
        } catch (err) {
          console.error(`faction ${seat.display} failed to decide:`, err);
        }
        if (!move) {
          seat.memory.ticks.push({ tick: Number(tick), note: "held" });
          continue;
        }
        const contest = await d.signer.signContest(
          seat.handle, d.chainId, d.settlement,
          {
            regionId: d.regionId, tick, tileId: BigInt(move.tileId),
            committed: (BigInt(Math.round(move.committed * 10)) * WAD) / 10n,
          },
        );
        names.set(address.toLowerCase(), seat.display);
        contests.push(contest);
        seat.memory.ticks.push({
          tick: Number(tick),
          note: move.reasoning ?? `committed ${move.committed} on isle ${move.tileId}`,
        });
      }
    }

    // Bucket-2 commitment. v1: no GM-driven modifiers exist yet, so the
    // committed state is explicitly empty — the moment GM memory starts
    // shaping a modifier, it enters HERE or it doesn't enter at all.
    const bucket2: Bucket2State = {
      regionId: d.regionId.toString(),
      tick: tick.toString(),
      attackerMods: {},
      tileMods: {},
    };
    const rec = await d.driver.runTick(
      d.regionId, tick, contests, bucket2Root(bucket2));

    const raw = await d.readSummary(d.regionId, tick);
    const summary = this.toSummary(Number(tick), raw, names);

    // The tick is SETTLED on-chain. Narration is best-effort prose and is
    // decoupled from resolution: a slow or failed Hermes (its reliability is
    // known-flaky) must never reject a settled tick or trigger a re-run. Chain
    // disposes; only then do we talk, and we talk even if the talking breaks.
    try {
      await d.announce(await d.narrator.narrate(summary));
    } catch (err) {
      console.error(`narration failed (tick ${tick} already settled):`, err);
    }

    // Meter GM compute as a Flux sink and guard emission≤sink (CLAUDE.md: do
    // not let emission exceed sink — slow ponzi). Metering + the guard come
    // first; realising the sink on-chain (burning it) is the next boundary.
    if (d.meter) {
      const compute = d.meter.tickFlux();
      const sink = summary.burned + compute;
      console.log(
        `tick ${tick}: emission ${summary.minted.toFixed(2)} Flux | ` +
        `sink ${sink.toFixed(2)} (burn ${summary.burned.toFixed(2)} + ` +
        `compute ${compute.toFixed(2)}, ${d.meter.tickTokensUsed()} tok)`);
      if (summary.minted > sink) {
        console.warn(
          `⚠ emission > sink (${summary.minted.toFixed(2)} > ${sink.toFixed(2)}) ` +
          `— re-check balance in sim/world_sim.py before scaling`);
      }

      // Realise the sink on-chain: burn the metered Flux from the treasury so
      // supply genuinely drops. Best-effort — the tick is already settled, so
      // a failed/underfunded burn is logged, never fatal. The sink is "owed"
      // until realised; an empty treasury leaves it visibly unrealised.
      if (d.sink && compute > 0) {
        const wad = BigInt(Math.round(compute * 1e6)) * 10n ** 12n;
        try {
          const r = await d.sink.burn(wad);
          if (r) {
            console.log(`  sink realised: burned ${(Number(r.burned) / 1e18).toFixed(2)} ` +
              `Flux for compute (tx ${r.hash})`);
          } else {
            console.warn(`  ⚠ compute sink ${compute.toFixed(2)} Flux UNREALISED ` +
              `(treasury empty — fund it to burn)`);
          }
        } catch (err) {
          console.error(`compute-sink burn failed (tick ${tick} already settled):`, err);
        }
      }
    }
    return rec;
  }

  private toSummary(
    tick: number,
    raw: RawTickSummary,
    names: Map<string, string>,
  ): TickSummary {
    const nameOf = (a: Address): string =>
      a.toLowerCase() === ZERO
        ? "the wilds"
        : names.get(a.toLowerCase()) ?? `${a.slice(0, 8)}…`;
    const flux = (x: bigint): number => Number(x) / Number(WAD);
    const pct = (x: bigint): number => (Number(x) / Number(WAD)) * 100;

    const outcomes: SettledOutcome[] = raw.outcomes.map((o) => ({
      tileId: Number(o.tileId),
      attacker: nameOf(o.attacker),
      defender: nameOf(o.defender),
      attackerWon: o.attackerWon,
      pPercent: pct(o.pWad),
      rollPercent: pct(o.roll),
      burned: flux(o.burned),
    }));
    return {
      tick,
      outcomes,
      minted: flux(raw.minted),
      burned: flux(raw.burned),
      skipped: raw.skipped.map((s) => ({
        attacker: nameOf(s.attacker),
        tileId: Number(s.tileId),
        reason: SKIP_REASONS[s.reason] ?? `reason ${s.reason}`,
      })),
    };
  }
}
