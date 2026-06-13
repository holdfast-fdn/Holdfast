/**
 * Exercise the three Hermes slots against the LIVE endpoint (HERMES_* env).
 * No chain — just proves the brain produces valid, guarded output:
 *   1. HermesParser vs the rule-based acceptance bar
 *   2. HermesFactionAgent — a faction reasons about a real board
 *   3. HermesNarrator — the Herald's voice over fixed facts
 *
 *   cd gm && set -a && source ~/holdfast/gm.env && set +a && npx tsx scripts/hermes-smoke.ts
 */

import { hermesFromEnv } from "../src/hermes.js";
import { HermesParser, RuleBasedParser } from "../src/parser.js";
import {
  HermesFactionAgent, HeuristicFactionAgent, type WorldView,
} from "../src/faction.js";
import { HermesNarrator, TemplateNarrator } from "../src/narrator.js";
import type { Address } from "../src/types.js";

const WILDS = "0x0000000000000000000000000000000000000000" as Address;
const HORDE = "0x000000000000000000000000000000000000a5e0" as Address;

async function main() {
  const hermes = hermesFromEnv();
  if (!hermes) throw new Error("HERMES_* not set — source ~/holdfast/gm.env first");
  console.log("Hermes endpoint configured.\n");

  // 1. parser vs the acceptance bar
  console.log("=== 1. HermesParser vs the rule-based bar ===");
  const rule = new RuleBasedParser();
  const hp = new HermesParser(hermes, rule);
  const cases = [
    "attack tile 5 with 120 flux",
    "raid tile_03, commit 80",
    "I want to take the seventh isle, send 60",
    "hey what's up",
    "throw everything at isle 2",
  ];
  for (const c of cases) {
    const [h, r] = [await hp.parse(c), await rule.parse(c)];
    const agree = JSON.stringify(h) === JSON.stringify(r) ? "≈rules" : "differs";
    console.log(`  "${c}"\n    hermes: ${JSON.stringify(h)}  [${agree}]`);
  }

  // 2. a faction reasons about a board
  console.log("\n=== 2. HermesFactionAgent decides (Ashen Horde) ===");
  const world: WorldView = {
    regionId: 0n, tick: 4n, alpha: 0.5, delta: 1.3, minCommit: 20,
    tiles: [
      { tileId: 0, owner: HORDE, ownerIsWilds: false, garrison: 212, mod: 1 },
      { tileId: 5, owner: "0x00000000000000000000000000000000000ace01" as Address,
        ownerIsWilds: false, garrison: 254, mod: 1 },
      { tileId: 1, owner: WILDS, ownerIsWilds: true, garrison: 66, mod: 1 },
      { tileId: 3, owner: WILDS, ownerIsWilds: true, garrison: 66, mod: 1 },
    ],
  };
  const agent = new HermesFactionAgent("Ashen Horde", hermes,
    new HeuristicFactionAgent("raider", 0.8));
  const move = await agent.decide({
    faction: { handle: "faction:ashen", display: "Ashen Horde", address: HORDE, escrow: 230 },
    world,
    memory: {
      ticks: [{ tick: 3, note: "took isle 0 from the wilds" }],
      notes: { "0xace01 (a human)": "took isle 5, garrison 254 — strong, expanding" },
    },
  });
  console.log("  move:", JSON.stringify(move));

  // 3. the Herald narrates fixed facts
  console.log("\n=== 3. HermesNarrator (the Herald's voice) ===");
  const narr = new HermesNarrator(hermes, new TemplateNarrator());
  const prose = await narr.narrate({
    tick: 4,
    outcomes: [{
      tileId: 1, attacker: "Ashen Horde", defender: "the wilds",
      attackerWon: true, pPercent: 62, rollPercent: 41, burned: 46.2,
    }],
    minted: 20, burned: 46.2, skipped: [],
  });
  console.log(prose);
}

main().catch((e) => { console.error(e); process.exit(1); });
