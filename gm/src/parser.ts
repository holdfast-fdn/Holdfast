/**
 * NL -> intent parsing.
 *
 * RuleBasedParser: deterministic regex grammar used in tests and as a
 * fallback. HermesParser: adapter slot for the Hermes Agent — the real
 * Phase-3 integration point. Both satisfy NLIntentParser; the test set in
 * test/parser.test.ts is the acceptance bar ANY implementation must pass
 * (run the same set against Hermes once wired).
 */

import type { ChatMessage, HermesClient } from "./hermes.js";
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
 * Hermes Agent NL->intent adapter. Sends the player's text with a strict
 * schema, validates the returned JSON, and falls back to RuleBasedParser on
 * timeout/garbage (never block a tick on the LLM). Hermes may INTERPRET; it
 * can only ever produce a structured intent — the chain decides the outcome.
 * Must pass the same acceptance set as the rule-based parser before use.
 */
export class HermesParser implements NLIntentParser {
  constructor(
    private readonly client: HermesClient,
    private readonly fallback: NLIntentParser = new RuleBasedParser(),
  ) {}

  async parse(text: string): Promise<ParsedCommand> {
    try {
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: [
            "You translate a Holdfast player's message into a structured",
            "order. The only action is attacking an isle by committing Flux.",
            "Respond with ONLY a JSON object, no prose. Either:",
            '  {"kind":"attack","tileId":<int>,"committed":<number Flux>}',
            "or, if the message is not a clear attack order:",
            '  {"kind":"unknown","reason":"<short reason>"}',
            "Do not invent a tile or amount; if either is missing or unclear,",
            "return unknown. committed must be a positive number.",
          ].join("\n"),
        },
        { role: "user", content: text.slice(0, 500) },
      ];
      return await this.client.chatJson(messages, validateParsed,
        { temperature: 0, maxTokens: 120 });
    } catch (err) {
      console.warn("Hermes parse fell back to rules:", (err as Error).message);
      return this.fallback.parse(text);
    }
  }
}

function validateParsed(raw: unknown): ParsedCommand {
  if (typeof raw !== "object" || raw === null) throw new Error("not an object");
  const r = raw as Record<string, unknown>;
  if (r.kind === "attack") {
    const tileId = Number(r.tileId);
    const committed = Number(r.committed);
    if (!Number.isInteger(tileId) || tileId < 0) throw new Error("bad tileId");
    if (!Number.isFinite(committed) || committed <= 0) throw new Error("bad committed");
    return { kind: "attack", tileId, committed };
  }
  if (r.kind === "unknown") {
    return { kind: "unknown", reason: typeof r.reason === "string" ? r.reason
      : "could not read an order — try: 'attack tile 5 with 120 flux'" };
  }
  throw new Error("unrecognized kind");
}
