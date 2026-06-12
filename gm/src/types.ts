/**
 * Holdfast GM service — shared types.
 *
 * GM proposes, chain disposes: nothing in this service ever decides an
 * outcome. It translates language into signed intents, drives the tick,
 * and (later) narrates what the chain already decided.
 */

export type Address = `0x${string}`;

/** A player's structured intent — the only thing the GM extracts from NL. */
export interface AttackIntent {
  kind: "attack";
  tileId: number;
  /** whole Flux tokens (converted to WAD at signing time) */
  committed: number;
}

export interface UnknownIntent {
  kind: "unknown";
  /** why the command could not be understood — surfaced back to the player */
  reason: string;
}

export type ParsedCommand = AttackIntent | UnknownIntent;

/** What the settlement contract consumes (mirrors ContestInput). */
export interface SignedContest {
  tileId: bigint;
  attacker: Address;
  committed: bigint;
  attackerMod: bigint;
  sigV: number;
  sigR: `0x${string}`;
  sigS: `0x${string}`;
}

/**
 * Translation layer interface. The production implementation calls the
 * Hermes Agent; tests use the rule-based parser. Swapping one for the
 * other must never change anything downstream — both produce the same
 * structured intents, and only the chain decides what they're worth.
 */
export interface NLIntentParser {
  parse(text: string): Promise<ParsedCommand>;
}
