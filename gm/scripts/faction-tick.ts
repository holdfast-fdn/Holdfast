/**
 * The world moves while you sleep — an AI faction takes its turn on Base
 * Sepolia, autonomously, using the real faction modules. The heuristic agent
 * stands in for Hermes: it reads the live world, chooses a move, signs an
 * intent from the FACTION's own wallet, and settles a tick. The chain decides
 * whether it succeeds — the faction can lose, exactly like a human.
 *
 *   cd gm && npx tsx scripts/faction-tick.ts [archetype]
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import {
  loadArtifact, makeEscrowReader, makeTickSummaryReader, makeWorldReader,
  ViemChainOps,
} from "../src/chain.js";
import { TickDriver } from "../src/driver.js";
import { HeuristicFactionAgent, type Archetype } from "../src/faction.js";
import { IntentPool } from "../src/intentPool.js";
import { TemplateNarrator } from "../src/narrator.js";
import { TickScheduler } from "../src/scheduler.js";
import { CustodialSigner, WAD } from "../src/signer.js";
import type { Address } from "../src/types.js";

const SETTLEMENT = "0x68C2Ef4544aA0071ebC98bD7bdAb958C11C3Af49" as Address;
const RPC = process.env.RPC_URL ?? "https://sepolia.base.org";
const REGION = 0n;
const FACTION = { handle: "faction:ashen", display: "Ashen Horde" };

function env(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(join(homedir(), "holdfast/keys.env"), "utf8").split("\n")) {
    const m = line.match(/^(\w+)=(.+)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

async function main() {
  const archetype = (process.argv[2] ?? "raider") as Archetype;
  const e = env();
  const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const { abi } = loadArtifact("HoldfastSettlement");
  const wallet = (pk: string) => createWalletClient({
    account: privateKeyToAccount(pk as `0x${string}`),
    chain: baseSepolia, transport: http(RPC),
  });
  const owner = wallet(e.OWNER_PK);

  const signer = new CustodialSigner(join(homedir(), "holdfast/players.json"));
  const factionAddr = signer.wallet(FACTION.handle).address as Address;
  console.log(`${FACTION.display} wallet: ${factionAddr}`);

  // arm the faction with a war chest if it has none
  const escrowReader = makeEscrowReader(pub, SETTLEMENT, abi);
  if (await escrowReader(factionAddr) === 0) {
    const hash = await owner.writeContract({
      address: SETTLEMENT, abi, functionName: "enroll",
      args: [[factionAddr], 250n * WAD],
    });
    await pub.waitForTransactionReceipt({ hash });
    console.log(`enrolled ${FACTION.display} with 250 Flux`);
  }

  const ops = new ViemChainOps(
    pub, wallet(e.OPERATOR_PK), wallet(e.PROVIDER_PK), SETTLEMENT, abi);
  const fromBlock = await pub.getBlockNumber();
  const scheduler = new TickScheduler({
    regionId: REGION, chainId: baseSepolia.id, settlement: SETTLEMENT,
    pool: new IntentPool(), signer,
    driver: new TickDriver(ops,
      async () => BigInt(`0x${randomBytes(32).toString("hex")}`),
      join(homedir(), "holdfast/state"), { maxAttempts: 3, retryDelayMs: 3000 }),
    ops,
    readSummary: makeTickSummaryReader(pub, SETTLEMENT, abi, fromBlock - 1n),
    narrator: new TemplateNarrator(),
    announce: async (text) => {
      console.log("\n──────── @HoldfastGM ────────\n" + text + "\n─────────────────────────────");
    },
    factions: [{
      ...FACTION,
      agent: new HeuristicFactionAgent(archetype, 0.85, FACTION.display),
      memory: { ticks: [], notes: {} },
    }],
    readWorld: makeWorldReader(pub, SETTLEMENT, abi),
    readEscrow: escrowReader,
  });

  console.log(`\nthe ${FACTION.display} (${archetype}) takes its turn…`);
  const rec = await scheduler.runOnce();
  console.log("tick", rec.tick, rec.phase, "| settle:", rec.txHashes.settle);
  console.log("basescan: https://sepolia.basescan.org/tx/" + rec.txHashes.settle);
}

main().catch((e) => { console.error(e); process.exit(1); });
