/**
 * Read a settled tick's events back from Base Sepolia with the (now
 * poll-hardened) summary reader and narrate it — proves the GM would have
 * told the right story for a tick that already happened on-chain. Zero gas.
 *
 *   cd gm && npx tsx scripts/replay-summary.ts [tick]
 */

import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { loadArtifact, makeTickSummaryReader } from "../src/chain.js";
import { TemplateNarrator } from "../src/narrator.js";
import { WAD } from "../src/signer.js";
import type { Address } from "../src/types.js";
import type { SettledOutcome } from "../src/narrator.js";

const SETTLEMENT = "0x68C2Ef4544aA0071ebC98bD7bdAb958C11C3Af49" as Address;
const RPC = process.env.RPC_URL ?? "https://sepolia.base.org";
const NAMES: Record<string, string> = {
  "0x1fbaeeb098d15a1f1cbc903ede970b4916d5d09e": "alice",
  "0xc0a50c35b5c580ddc9ffbf502473fab318a7f422": "bob",
};

async function main() {
  const tick = BigInt(process.argv[2] ?? "1");
  const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const { abi } = loadArtifact("HoldfastSettlement");
  const read = makeTickSummaryReader(pub, SETTLEMENT, abi, 0n);

  const raw = await read(0n, tick);
  const name = (a: Address) => {
    const k = a.toLowerCase();
    return /^0x0+$/.test(k) ? "the wilds" : NAMES[k] ?? `${a.slice(0, 8)}…`;
  };
  const flux = (x: bigint) => Number(x) / Number(WAD);
  const pct = (x: bigint) => (Number(x) / Number(WAD)) * 100;
  const outcomes: SettledOutcome[] = raw.outcomes.map((o) => ({
    tileId: Number(o.tileId),
    attacker: name(o.attacker),
    defender: name(o.defender),
    attackerWon: o.attackerWon,
    pPercent: pct(o.pWad),
    rollPercent: pct(o.roll),
    burned: flux(o.burned),
  }));

  console.log(new TemplateNarrator().narrate({
    tick: Number(tick),
    outcomes,
    minted: flux(raw.minted),
    burned: flux(raw.burned),
    skipped: raw.skipped.map((s) => ({
      attacker: name(s.attacker), tileId: Number(s.tileId),
      reason: ["already holds it", "duplicate", "insufficient escrow"][s.reason]
        ?? `reason ${s.reason}`,
    })),
  }));
}

main().catch((e) => { console.error(e); process.exit(1); });
