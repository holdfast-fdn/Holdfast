/**
 * Drive ONE real tick on the deployed Base Sepolia world using the actual
 * GM service modules (no bespoke logic): two players speak in natural
 * language -> RuleBasedParser -> IntentPool -> custodial EIP-712 signatures
 * -> TickScheduler (Bucket-2 root + openTick/fulfillWord/settleTick via the
 * real TickDriver + ViemChainOps) -> read the settled events back ->
 * TemplateNarrator. This is the production code path against the real chain.
 *
 * Reads the deployment + role keys from ~/holdfast/keys.env (outside repo).
 *   cd gm && npx tsx scripts/live-tick.ts
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  createPublicClient, createWalletClient, http, parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { loadArtifact, makeTickSummaryReader, ViemChainOps } from "../src/chain.js";
import { TickDriver } from "../src/driver.js";
import { IntentPool } from "../src/intentPool.js";
import { TemplateNarrator } from "../src/narrator.js";
import { RuleBasedParser } from "../src/parser.js";
import { TickScheduler } from "../src/scheduler.js";
import { CustodialSigner, WAD } from "../src/signer.js";
import type { Address } from "../src/types.js";

const SETTLEMENT = "0x68C2Ef4544aA0071ebC98bD7bdAb958C11C3Af49" as Address;
const FLUX = "0xEf3c26E66c5B8b23EE26C70b78172D086a41d665" as Address;
const RPC = process.env.RPC_URL ?? "https://sepolia.base.org";
const REGION = 0n;

function loadEnv(): Record<string, string> {
  const txt = readFileSync(join(homedir(), "holdfast/keys.env"), "utf8");
  const out: Record<string, string> = {};
  for (const line of txt.split("\n")) {
    const m = line.match(/^(\w+)=(.+)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

async function main() {
  const env = loadEnv();
  const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const { abi } = loadArtifact("HoldfastSettlement");
  const fluxAbi = loadArtifact("FluxToken").abi;
  const wallet = (pk: string) => createWalletClient({
    account: privateKeyToAccount(pk as `0x${string}`),
    chain: baseSepolia, transport: http(RPC),
  });
  const owner = wallet(env.OWNER_PK);

  // 1) custodial session wallets for the two test players
  const signer = new CustodialSigner(join(homedir(), "holdfast/players.json"));
  const players = [
    { handle: "tg:alice", display: "alice", text: "attack tile 5 with 120 flux" },
    { handle: "tg:bob", display: "bob", text: "raid tile 7, commit 100" },
  ];
  const addrs = players.map((p) => signer.wallet(p.handle).address);
  console.log("players:", players.map((p, i) => `${p.display}=${addrs[i]}`).join("  "));

  // 2) owner enrolls anyone not yet funded (mints starting escrow)
  for (let i = 0; i < addrs.length; i++) {
    const esc = await pub.readContract({
      address: SETTLEMENT, abi, functionName: "escrow", args: [addrs[i]],
    }) as bigint;
    if (esc === 0n) {
      const hash = await owner.writeContract({
        address: SETTLEMENT, abi, functionName: "enroll",
        args: [[addrs[i]], 250n * WAD],
      });
      await pub.waitForTransactionReceipt({ hash });
      console.log(`enrolled ${players[i].display} (+250 Flux escrow)`);
    } else {
      console.log(`${players[i].display} already holds ${esc / WAD} Flux escrow`);
    }
  }

  // 3) players speak -> parse -> pool (the real bot path, minus Telegram)
  const parser = new RuleBasedParser();
  const pool = new IntentPool();
  for (const p of players) {
    const parsed = await parser.parse(p.text);
    if (parsed.kind !== "attack") throw new Error(`parse failed: "${p.text}"`);
    pool.add({ handle: p.handle, display: p.display, intent: parsed });
    console.log(`  "${p.text}"  ->  attack tile ${parsed.tileId} with ${parsed.committed}`);
  }

  // 4) wire the real scheduler against the deployed contracts
  const ops = new ViemChainOps(
    pub, wallet(env.OPERATOR_PK), wallet(env.PROVIDER_PK), SETTLEMENT, abi);
  const fromBlock = await pub.getBlockNumber();
  const driver = new TickDriver(
    ops,
    async () => BigInt(`0x${randomBytes(32).toString("hex")}`), // testnet randomness
    join(homedir(), "holdfast/state"),
    { maxAttempts: 3, retryDelayMs: 3000 },
  );
  const scheduler = new TickScheduler({
    regionId: REGION,
    chainId: baseSepolia.id,
    settlement: SETTLEMENT,
    pool,
    signer,
    driver,
    ops,
    readSummary: makeTickSummaryReader(pub, SETTLEMENT, abi, fromBlock - 1n),
    narrator: new TemplateNarrator(),
    announce: async (text) => {
      console.log("\n──────── @HoldfastGM ────────\n" + text + "\n─────────────────────────────");
    },
  });

  console.log("\ndriving the tick on Base Sepolia (commit -> word -> settle)…");
  const rec = await scheduler.runOnce();
  console.log("tick", rec.tick, "phase", rec.phase,
    "| settle tx:", rec.txHashes.settle);

  // 5) show the result straight from chain + the live companion URL
  const flux = await pub.readContract({
    address: FLUX, abi: fluxAbi, functionName: "totalSupply",
  }) as bigint;
  console.log("\nFlux total supply now:", Number(flux) / Number(WAD));
  const url = `http://localhost:4173/ui/holdfast-isles.html`
    + `?rpc=${encodeURIComponent(RPC)}&settlement=${SETTLEMENT}&region=0`
    + `&me=${addrs[0]}&names=${addrs[1]}:bob`;
  console.log("\nlive companion:\n" + url);
  console.log("\nbasescan:\n"
    + `https://sepolia.basescan.org/tx/${rec.txHashes.settle}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
