/**
 * The NL->intent acceptance set. ANY parser implementation (rule-based now,
 * Hermes later) must pass this exact set before it may feed the tick.
 */

import { describe, expect, it } from "vitest";
import { RuleBasedParser } from "../src/parser.js";

const parser = new RuleBasedParser();

const ATTACKS: Array<[string, number, number]> = [
  ["attack tile 5 with 120", 5, 120],
  ["Attack tile_05 with 120 flux!", 5, 120],
  ["raid tile 3, commit 80", 3, 80],
  ["RAID TILE_07 WITH 100 FLUX", 7, 100],
  ["strike tile 7 using 60.5", 7, 60.5],
  ["please assault tile 2 with 45 flux", 2, 45],
  ["take the wilds at tile 8 with 40", 8, 40],
  ["storm tile #4 with 200", 4, 200],
  ["hit tile-6 committing 33 flux", 6, 33],
  ["I want to attack tile 1 with 25", 1, 25],
  ["let's raid tile 9 for 75 flux tonight", 9, 75],
  ["attack tile 12 with 500", 12, 500],
];

const REJECTS: string[] = [
  "hello there",
  "what's my balance?",
  "attack tile five with lots",
  "attack with 100", // no tile
  "defend tile 3 with 50", // not an attack verb (defense is automatic)
  "attack tile 5", // no amount
  "attack tile 5 with 0", // zero commit
  "tell me about the iron pact",
  "withdraw 100 flux",
];

describe("NL -> intent acceptance set", () => {
  for (const [text, tileId, committed] of ATTACKS) {
    it(`parses: "${text}"`, async () => {
      const r = await parser.parse(text);
      expect(r).toEqual({ kind: "attack", tileId, committed });
    });
  }

  for (const text of REJECTS) {
    it(`rejects: "${text}"`, async () => {
      const r = await parser.parse(text);
      expect(r.kind).toBe("unknown");
    });
  }
});
