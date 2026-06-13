/**
 * Service entry — composition root for the closed playtest.
 *
 * Required environment (never hardcode, never commit — CLAUDE.md):
 *   TELEGRAM_BOT_TOKEN   @HoldfastGM bot token
 *   ANNOUNCE_CHAT_ID     channel/chat that receives the war report
 *   RPC_URL              Base Sepolia RPC
 *   SETTLEMENT_ADDRESS   deployed HoldfastSettlement
 *   OPERATOR_PK          tick-driver wallet key
 *   PROVIDER_PK          randomness-provider wallet key (testnet EOA)
 *   REGION_ID            region to drive (default 0)
 *   KEYSTORE_PATH        custodial player keys (outside the repo!)
 *   STATE_DIR            tick state + published bundles
 *   TICK_INTERVAL_MS     tick close interval (default: daily)
 *   AGENT_API_PORT       public agent API port (0/unset = closed)
 *   OWNER_PK             owner key — enables POST /faucet (testnet enroll)
 *   FAUCET_FLUX          starting escrow per faucet (whole Flux, default 200)
 *   COMPUTE_FLUX_PER_1K_TOKENS  GM-compute sink price (default 0.5 Flux/1k tok)
 *
 * Run: npx tsx src/index.ts
 */

import { randomBytes } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { startAgentApi } from "./agentApi.js";
import { AgentIntentPool } from "./agentPool.js";
import { HoldfastBot, HttpTelegramTransport } from "./bot.js";
import { ComputeMeter } from "./computeMeter.js";
import {
  loadArtifact, makeEscrowReader, makeTickSummaryReader, makeWorldReader,
  ViemChainOps,
} from "./chain.js";
import { TickDriver } from "./driver.js";
import {
  HeuristicFactionAgent, HermesFactionAgent,
  type Archetype, type FactionMemory,
} from "./faction.js";
import { hermesFromEnv } from "./hermes.js";
import { IntentPool } from "./intentPool.js";
import { HermesNarrator, TemplateNarrator, type Narrator } from "./narrator.js";
import { HermesParser, RuleBasedParser } from "./parser.js";
import { TickScheduler, type FactionSeat } from "./scheduler.js";
import { CustodialSigner, WAD } from "./signer.js";
import type { Address, NLIntentParser } from "./types.js";

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`missing env: ${name}`);
  return v;
}

async function main(): Promise<void> {
  const rpc = env("RPC_URL");
  const settlement = env("SETTLEMENT_ADDRESS") as Address;
  const regionId = BigInt(env("REGION_ID", "0"));
  const { abi } = loadArtifact("HoldfastSettlement");

  const publicClient = createPublicClient({
    chain: baseSepolia, transport: http(rpc),
  });
  const wallet = (pk: string) =>
    createWalletClient({
      account: privateKeyToAccount(pk as `0x${string}`),
      chain: baseSepolia,
      transport: http(rpc),
    });

  const ops = new ViemChainOps(
    publicClient,
    wallet(env("OPERATOR_PK")),
    wallet(env("PROVIDER_PK")),
    settlement,
    abi,
  );
  // testnet randomness: provider EOA draws from the OS csprng AFTER the
  // batch commitment (the contract enforces the ordering). Production:
  // replace with the VRF adapter (AUDIT.md M-2).
  const wordProvider = async (): Promise<bigint> =>
    BigInt(`0x${randomBytes(32).toString("hex")}`);

  const pool = new IntentPool();
  const signer = new CustodialSigner(env("KEYSTORE_PATH"));
  const transport = new HttpTelegramTransport(env("TELEGRAM_BOT_TOKEN"));

  // Hermes is the brain behind the three non-deterministic jobs. When the
  // HERMES_* env is set it drives them (each with a deterministic fallback);
  // unset, the GM runs fully on the rule-based/template/heuristic stand-ins.
  // Meter GM compute as a Flux sink (CLAUDE.md). Every Hermes call routes its
  // token usage through meter.record via the onUsage hook; the scheduler reads
  // the per-tick cost and guards emission≤sink.
  const meter = new ComputeMeter(Number(env("COMPUTE_FLUX_PER_1K_TOKENS", "0.5")));
  const hermes = hermesFromEnv(process.env, (t) => meter.record(t));
  console.log(hermes
    ? "Hermes Agent connected — driving intent, narration, and factions"
    : "Hermes not configured — running on deterministic stand-ins");

  const parser: NLIntentParser = hermes
    ? new HermesParser(hermes, new RuleBasedParser())
    : new RuleBasedParser();
  const narrator: Narrator = hermes
    ? new HermesNarrator(hermes, new TemplateNarrator())
    : new TemplateNarrator();
  const bot = new HoldfastBot(transport, parser, pool, signer);

  // AI factions (the world moves while you sleep). FACTIONS env, e.g.
  // "ashen:Ashen Horde:raider,iron:Iron Pact:turtle". With Hermes each gets
  // a HermesFactionAgent (heuristic fallback); without, the heuristic itself.
  const factions: FactionSeat[] = (env("FACTIONS", "")
    .split(",").map((s) => s.trim()).filter(Boolean)).map((spec) => {
    const [key, display, archetype] = spec.split(":");
    const arch = (archetype ?? "raider") as Archetype;
    const heuristic = new HeuristicFactionAgent(arch, 0.8, display);
    return {
      handle: `faction:${key}`,
      display,
      agent: hermes ? new HermesFactionAgent(display, hermes, heuristic) : heuristic,
      memory: { ticks: [], notes: {} } as FactionMemory,
    };
  });
  if (factions.length) {
    console.log(`factions in play: ${factions.map((f) => f.display).join(", ")}`);
  }

  const readWorld = makeWorldReader(publicClient, settlement, abi);

  // Public agent arena (docs/AGENT_PROTOCOL.md): when AGENT_API_PORT is set,
  // any self-custody agent can POST a signed move. The pool holds those
  // pre-signed contests; the scheduler merges them into the same batch.
  // Unset, the door is simply closed — nothing else changes.
  const agentApiPort = Number(env("AGENT_API_PORT", "0"));
  const agentPool = agentApiPort > 0 ? new AgentIntentPool() : undefined;
  let stopAgentApi: (() => void) | undefined;
  if (agentPool) {
    // Testnet faucet: with OWNER_PK set, the door can enroll a fresh agent
    // address with starting escrow (owner-only enroll mints the backing Flux).
    // No OWNER_PK -> POST /faucet is closed; agents must be enrolled out-of-band.
    const ownerPk = process.env.OWNER_PK;
    const faucet = ownerPk
      ? {
          amountWad:
            (BigInt(Math.round(Number(env("FAUCET_FLUX", "200")) * 10)) * WAD) / 10n,
          enroll: async (addr: Address, amountWad: bigint): Promise<string> => {
            const hash = await wallet(ownerPk).writeContract({
              address: settlement, abi, functionName: "enroll",
              args: [[addr], amountWad],
            });
            await publicClient.waitForTransactionReceipt({ hash });
            return hash;
          },
        }
      : undefined;
    stopAgentApi = startAgentApi({
      port: agentApiPort,
      regionId,
      chainId: baseSepolia.id,
      settlement,
      abi,
      publicClient,
      pool: agentPool,
      readWorld,
      faucet,
    });
    console.log(`agent API listening on :${agentApiPort} ` +
      `(POST /intent${faucet ? ", POST /faucet" : ""})`);
  }

  const scheduler = new TickScheduler({
    regionId,
    chainId: baseSepolia.id,
    settlement,
    pool,
    agentPool,
    signer,
    driver: new TickDriver(ops, wordProvider, env("STATE_DIR", "./state")),
    ops,
    readSummary: makeTickSummaryReader(
      publicClient, settlement, abi, BigInt(env("FROM_BLOCK", "0"))),
    narrator,
    announce: (text) => transport.send(env("ANNOUNCE_CHAT_ID"), text),
    meter,
    factions: factions.length ? factions : undefined,
    readWorld,
    readEscrow: makeEscrowReader(publicClient, settlement, abi),
  });

  // TICK_INTERVAL_MS <= 0 disables auto-ticking — the bot only LISTENS and
  // queues orders; ticks are driven manually (scripts/live-tick.ts) until
  // the playtest is scheduled. setInterval silently breaks past its 32-bit
  // ceiling (a huge value wraps to ~1ms and hammers the chain), so clamp.
  const SETINTERVAL_MAX = 2_147_483_647;
  const intervalMs = Number(env("TICK_INTERVAL_MS", String(24 * 3600 * 1000)));
  let timer: ReturnType<typeof setInterval> | undefined;
  if (intervalMs > 0) {
    const clamped = Math.min(intervalMs, SETINTERVAL_MAX);
    if (clamped !== intervalMs) {
      console.warn(`TICK_INTERVAL_MS clamped to ${clamped}ms ` +
        `(setInterval ceiling); use a cron for longer cadences`);
    }
    timer = setInterval(() => {
      scheduler.runOnce().catch((err) => {
        // the driver resumes on the next fire; log loudly, never crash the bot
        console.error("tick failed (will resume next fire):", err);
      });
    }, clamped);
  }

  // Manual tick trigger: when TICK_TRIGGER_FILE appears, drain the bot's
  // OWN in-memory pool and settle one tick, then remove the file. Lets the
  // operator fire a tick from outside the process (e.g. `touch <file>`)
  // without an admin command or a network endpoint — the order flows from
  // the live bot, not a side script. A run in progress blocks re-entry.
  const triggerFile = env("TICK_TRIGGER_FILE", "");
  if (triggerFile) {
    let running = false;
    setInterval(async () => {
      if (running || !existsSync(triggerFile)) return;
      running = true;
      try {
        rmSync(triggerFile, { force: true });
        console.log("manual tick triggered");
        await scheduler.runOnce();
      } catch (err) {
        console.error("manual tick failed:", err);
      } finally {
        running = false;
      }
    }, 4000);
  }

  process.on("SIGINT", () => {
    if (timer) clearInterval(timer);
    stopAgentApi?.();
    transport.stop();
  });

  console.log(`@HoldfastGM up — region ${regionId}, ` +
    (timer ? `tick every ${intervalMs}ms` : "auto-tick disabled (manual)"));
  await transport.poll((msg) => bot.onMessage(msg));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
