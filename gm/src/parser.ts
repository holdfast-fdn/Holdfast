/**
 * NL -> intent parsing.
 *
 * RuleBasedParser: deterministic regex grammar used in tests and as a
 * fallback. HermesParser: adapter slot for the Hermes Agent — the real
 * Phase-3 integration point. Both satisfy NLIntentParser; the test set in
 * test/parser.test.ts is the acceptance bar ANY implementation must pass
 * (run the same set against Hermes once wired).
 */

import type { NLIntentParser, ParsedCommand } from "./types.js";

/** matches: "attack tile 5 with 120", "raid tile_03, commit 80 flux",
 *  "strike tile 7 using 60.5", "take the wilds at tile 2 with 40" */
const ATTACK_RE =
  /\b(attack|raid|strike|assault|take|storm|hit)\b[^0-9_]*tile[_\s#-]*(\d+)\b.*?\b(?:with|using|commit(?:ting)?|for|at)\s+([0-9]+(?:\.[0-9]+)?)\s*(?:flux)?\b/i;

export class RuleBasedParser implements NLIntentParser {
  async parse(text: string): Promise<ParsedCommand> {
    const m = ATTACK_RE.exec(text);
    if (!m) {
      return {
        kind: "unknown",
        reason:
          "could not read an order — try: 'attack tile 5 with 120 flux'",
      };
    }
    const tileId = Number.parseInt(m[2], 10);
    const committed = Number.parseFloat(m[3]);
    if (!Number.isFinite(committed) || committed <= 0) {
      return { kind: "unknown", reason: "the committed amount must be positive" };
    }
    return { kind: "attack", tileId, committed };
  }
}

/**
 * Hermes Agent adapter — NOT yet wired. When configured, it must:
 *  1. send the player text + a strict JSON schema to the Hermes Agent,
 *  2. validate the returned JSON against the same schema,
 *  3. fall back to RuleBasedParser on timeout/garbage (never block a tick
 *     on the LLM — Hermes reliability note in CLAUDE.md).
 * The GM may interpret; it may never invent an outcome.
 */
export class HermesParser implements NLIntentParser {
  constructor(private readonly endpoint?: string) {}

  async parse(_text: string): Promise<ParsedCommand> {
    throw new Error(
      "HermesParser is not configured yet — wire the Hermes Agent endpoint " +
        "and validate it against the parser test set before use",
    );
  }
}
