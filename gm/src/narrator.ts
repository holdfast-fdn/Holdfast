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
  narrate(summary: TickSummary): string;
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
 * Hermes Agent adapter — NOT yet wired. When configured it must take the
 * same TickSummary (facts only), may add voice, lore, and memory-driven
 * color, and must never contradict or extend the outcome facts. Validate
 * by diffing extracted facts from its prose against the input summary.
 */
export class HermesNarrator implements Narrator {
  narrate(_s: TickSummary): string {
    throw new Error(
      "HermesNarrator is not configured yet — wire the Hermes Agent and " +
        "fact-check its prose against TickSummary before use",
    );
  }
}
