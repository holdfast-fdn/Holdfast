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
  const bot = new HoldfastBot(transport, new RuleBasedParser(), pool);

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

  const intervalMs = Number(env("TICK_INTERVAL_MS", String(24 * 3600 * 1000)));
  const timer = setInterval(() => {
    scheduler.runOnce().catch((err) => {
      // the driver resumes on the next fire; log loudly, never crash the bot
      console.error("tick failed (will resume next fire):", err);
    });
  }, intervalMs);

  process.on("SIGINT", () => {
    clearInterval(timer);
    transport.stop();
  });

  console.log(
    `@HoldfastGM up — region ${regionId}, tick every ${intervalMs}ms`);
  await transport.poll((msg) => bot.onMessage(msg));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
