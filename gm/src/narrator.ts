/**
 * Narration — Bucket 3. The narrator consumes ONLY settled outcomes (chain
 * events) and rephrases them. It can be replaced by the Hermes Agent for
 * voice and memory, but no narrator implementation may assert anything the
 * chain didn't produce — the input type is the guardrail: outcomes in,
 * prose out.
 */

export interface SettledOutcome {
  tileId: number;
  attacker: string;   // display name
  defender: string;   // display name ("the wilds" for address(0))
  attackerWon: boolean;
  pPercent: number;   // theoretical win chance, 0-100
  rollPercent: number;
  burned: number;     // whole Flux, rounded for prose
}

export interface TickSummary {
  tick: number;
  outcomes: SettledOutcome[];
  minted: number;
  burned: number;
  skipped: Array<{ attacker: string; tileId: number; reason: string }>;
}

export interface Narrator {
  narrate(summary: TickSummary): string | Promise<string>;
}

/** deterministic war report — the testable baseline voice */
export class TemplateNarrator implements Narrator {
  narrate(s: TickSummary): string {
    const lines: string[] = [`⚔ Tick ${s.tick} — The Sundered Isles`];
    if (s.outcomes.length === 0) {
      lines.push("A quiet day. The isles hold their breath.");
    }
    for (const o of s.outcomes) {
      lines.push(
        o.attackerWon
          ? `• ${o.attacker} stormed tile ${o.tileId} and TOOK it from ` +
            `${o.defender} (chance ${o.pPercent.toFixed(1)}%, ` +
            `roll ${o.rollPercent.toFixed(1)}%).`
          : `• ${o.attacker} broke against tile ${o.tileId} — ` +
            `${o.defender} holds (chance ${o.pPercent.toFixed(1)}%, ` +
            `roll ${o.rollPercent.toFixed(1)}%). ` +
            `${o.burned.toFixed(1)} Flux burned in the surf.`,
      );
    }
    for (const sk of s.skipped) {
      lines.push(
        `• ${sk.attacker}'s order on tile ${sk.tileId} was set aside ` +
          `(${sk.reason}).`,
      );
    }
    lines.push(
      `The Herald's ledger: ${s.minted.toFixed(1)} Flux minted, ` +
        `${s.burned.toFixed(1)} burned.`,
    );
    return lines.join("\n");
  }
}

/**
 * Hermes Agent narrator — the Herald's voice. Takes the SAME TickSummary
 * (facts only) and rephrases it with character and memory. Two guards keep
 * it honest: (1) the deterministic ledger line is always appended verbatim,
 * so the exact numbers can never drift; (2) on any failure it falls back to
 * the TemplateNarrator. Narration is Bucket 3 — flavor, never an outcome;
 * the chain/companion remains authoritative, so prose can never grant what
 * wasn't won.
 */
export class HermesNarrator implements Narrator {
  constructor(
    private readonly client: import("./hermes.js").HermesClient,
    private readonly fallback: Narrator = new TemplateNarrator(),
  ) {}

  async narrate(s: TickSummary): Promise<string> {
    try {
      const facts = JSON.stringify({
        tick: s.tick,
        outcomes: s.outcomes.map((o) => ({
          isle: o.tileId, attacker: o.attacker, defender: o.defender,
          result: o.attackerWon ? "taken" : "held",
          chance: Math.round(o.pPercent),
        })),
        skipped: s.skipped,
      });
      const prose = await this.client.chat([
        {
          role: "system",
          content: [
            "You are the Herald of Holdfast — a measured, classical war",
            "chronicler. Narrate the tick's results in 1-3 short sentences,",
            "in character, drawing tension from what happened. Use ONLY the",
            "facts given; never invent an outcome, winner, or number. No",
            "markdown, no preamble.",
          ].join("\n"),
        },
        { role: "user", content: facts },
      ], { temperature: 0.85, maxTokens: 220 });
      // ground truth always appended, regardless of the prose
      return `⚔ Tick ${s.tick} — The Sundered Isles\n${prose.trim()}\n` +
        `The Herald's ledger: ${s.minted.toFixed(1)} Flux minted, ` +
        `${s.burned.toFixed(1)} burned.`;
    } catch (err) {
      console.warn("Hermes narrate fell back to template:", (err as Error).message);
      return this.fallback.narrate(s);
    }
  }
}
