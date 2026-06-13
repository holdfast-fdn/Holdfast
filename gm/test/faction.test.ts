/**
 * Faction agents: the heuristic stand-in for Hermes makes sane moves, and
 * the scheduler folds a faction's signed intent into the tick batch — proof
 * that the AI seat is just another wallet issuing signed intents.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { HeuristicFactionAgent, HermesFactionAgent } from "../src/faction.js";
import type { FactionContext, FactionMemory, WorldView } from "../src/faction.js";
import { TickDriver, type ChainOps } from "../src/driver.js";
import { IntentPool } from "../src/intentPool.js";
import { TemplateNarrator } from "../src/narrator.js";
import { TickScheduler, type RawTickSummary } from "../src/scheduler.js";
import { CustodialSigner, WAD } from "../src/signer.js";
import type { Address, SignedContest } from "../src/types.js";

const WILDS = "0x0000000000000000000000000000000000000000" as Address;
const ME = "0x00000000000000000000000000000000000ace01" as Address;

function world(tiles: Array<[number, Address, number]>): WorldView {
  return {
    regionId: 0n, tick: 1n, alpha: 0.5, delta: 1.3, minCommit: 20,
    tiles: tiles.map(([tileId, owner, garrison]) => ({
      tileId, owner, ownerIsWilds: owner === WILDS, garrison, mod: 1,
    })),
  };
}
function ctx(agent: Address, escrow: number, w: WorldView): FactionContext {
  return {
    faction: { handle: "faction:x", display: "Test Horde", address: agent, escrow },
    world: w,
    memory: { ticks: [], notes: {} },
  };
}

describe("HeuristicFactionAgent", () => {
  it("raider takes the cheapest tile it does not own", async () => {
    const w = world([[0, ME, 100], [1, WILDS, 90], [2, WILDS, 50]]);
    const move = await new HeuristicFactionAgent("raider", 0.8).decide(ctx(ME, 250, w));
    expect(move?.tileId).toBe(2); // garrison 50 is cheapest
    expect(move?.committed).toBe(200); // 0.8 * 250
    expect(move?.reasoning).toContain("isle 2");
  });

  it("holds when its war chest cannot cover the min commit", async () => {
    const w = world([[0, WILDS, 50]]);
    const move = await new HeuristicFactionAgent("raider", 0.7).decide(ctx(ME, 10, w));
    expect(move).toBeNull();
  });

  it("turtle stops attacking once it owns two footholds", async () => {
    const w = world([[0, ME, 100], [1, ME, 100], [2, WILDS, 50]]);
    const move = await new HeuristicFactionAgent("turtle").decide(ctx(ME, 250, w));
    expect(move).toBeNull();
  });

  it("opportunist holds when the odds are poor", async () => {
    // one heavily-garrisoned tile; small budget -> low odds -> hold
    const w = world([[0, WILDS, 5000]]);
    const move = await new HeuristicFactionAgent("opportunist", 0.5).decide(ctx(ME, 60, w));
    expect(move).toBeNull();
  });

  it("balancer strikes the leader when someone holds >=40%", async () => {
    const leader = "0x00000000000000000000000000000000000b0550" as Address;
    const w = world([
      [0, leader, 80], [1, leader, 60], [2, leader, 70], [3, leader, 90],
      [4, WILDS, 40],
    ]); // leader holds 4/5 = 80%
    const move = await new HeuristicFactionAgent("balancer").decide(ctx(ME, 300, w));
    // should hit the leader's weakest tile (1, garrison 60), not the wild
    expect(move?.tileId).toBe(1);
  });

  it("HermesFactionAgent falls back to its heuristic when the LLM fails", async () => {
    const brokenClient = {
      chat: async () => { throw new Error("network down"); },
      chatJson: async () => { throw new Error("network down"); },
    } as unknown as import("../src/hermes.js").HermesClient;
    const fallback = new HeuristicFactionAgent("raider", 0.8);
    const agent = new HermesFactionAgent("Ashen Horde", brokenClient, fallback);
    const w = world([[0, ME, 100], [1, WILDS, 40]]);
    const move = await agent.decide(ctx(ME, 250, w));
    expect(move?.tileId).toBe(1); // heuristic backstop chose the cheap wild
  });
});

// --- scheduler folds a faction move into the batch -------------------------
class MockOps implements ChainOps {
  settledTick = 0n;
  lastBatch: SignedContest[] = [];
  async openTick() { return "0xopen"; }
  async fulfillWord() { return "0xword"; }
  async settleTick(_r: bigint, _t: bigint, _root: `0x${string}`, cs: SignedContest[]) {
    this.lastBatch = cs; this.settledTick += 1n; return "0xsettle";
  }
  async lastSettledTick() { return this.settledTick; }
}

describe("TickScheduler with an AI faction", () => {
  let dir: string;
  let signer: CustodialSigner;
  let ops: MockOps;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "holdfast-faction-"));
    signer = new CustodialSigner(join(dir, "keys.json"));
    ops = new MockOps();
  });

  it("a faction's move becomes a signed contest in the tick", async () => {
    const seat = {
      handle: "faction:ashen", display: "Ashen Horde",
      agent: new HeuristicFactionAgent("raider", 0.7, "Ashen Horde"),
      memory: { ticks: [], notes: {} } as FactionMemory,
    };
    const factionAddr = signer.wallet(seat.handle).address.toLowerCase();
    const summary: RawTickSummary = { outcomes: [], minted: 0n, burned: 0n, skipped: [] };

    const scheduler = new TickScheduler({
      regionId: 0n, chainId: 31337,
      settlement: "0x0000000000000000000000000000000000facade" as Address,
      pool: new IntentPool(), signer,
      driver: new TickDriver(ops, async () => 7n, join(dir, "state"),
        { maxAttempts: 1, retryDelayMs: 1 }),
      ops,
      readSummary: async () => summary,
      narrator: new TemplateNarrator(),
      announce: async () => {},
      factions: [seat],
      readWorld: async () => world([[5, WILDS, 60], [6, WILDS, 80]]),
      readEscrow: async () => 250,
    });

    await scheduler.runOnce();
    // the faction signed a real contest (cheapest tile 5, 0.7*250 = 175)
    expect(ops.lastBatch).toHaveLength(1);
    expect(ops.lastBatch[0].attacker.toLowerCase()).toBe(factionAddr);
    expect(ops.lastBatch[0].tileId).toBe(5n);
    expect(ops.lastBatch[0].committed).toBe(175n * WAD);
    expect(ops.lastBatch[0].sigR).toMatch(/^0x[0-9a-f]{64}$/); // a genuine signature
    // and it remembered the tick
    expect(seat.memory.ticks).toHaveLength(1);
    expect(seat.memory.ticks[0].note).toContain("isle 5");
  });
});
