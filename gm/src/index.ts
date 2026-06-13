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
 *
 * Run: npx tsx src/index.ts
 */

import { randomBytes } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { HoldfastBot, HttpTelegramTransport } from "./bot.js";
import { loadArtifact, makeTickSummaryReader, ViemChainOps } from "./chain.js";
import { TickDriver } from "./driver.js";
import { IntentPool } from "./intentPool.js";
import { TemplateNarrator } from "./narrator.js";
import { RuleBasedParser } from "./parser.js";
import { TickScheduler } from "./scheduler.js";
import { CustodialSigner } from "./signer.js";
import type { Address } from "./types.js";

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
  const bot = new HoldfastBot(transport, new RuleBasedParser(), pool, signer);

  const scheduler = new TickScheduler({
    regionId,
    chainId: baseSepolia.id,
    settlement,
    pool,
    signer,
    driver: new TickDriver(ops, wordProvider, env("STATE_DIR", "./state")),
    ops,
    readSummary: makeTickSummaryReader(
      publicClient, settlement, abi, BigInt(env("FROM_BLOCK", "0"))),
    narrator: new TemplateNarrator(),
    announce: (text) => transport.send(env("ANNOUNCE_CHAT_ID"), text),
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
