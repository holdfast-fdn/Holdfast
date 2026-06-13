/**
 * Faction agents — Hermes's seat AT THE TABLE.
 *
 * A faction is an autonomous player: every tick it issues a signed intent
 * from its own wallet, commits real Flux, and CAN LOSE. Its move is chosen
 * by intelligence (a heuristic now, the Hermes Agent later); its outcome is
 * decided by the resolver + VRF, exactly like a human. This is the project's
 * thesis in code — "GM proposes, chain disposes" applied to the GM-as-player:
 * the same trust machinery that stops the operator forging human intents
 * (EIP-712 + commit-then-randomness) means a faction Hermes drives can never
 * win by reasoning, only choose where to commit.
 *
 * The decide() context deliberately carries everything Hermes needs to be
 * Hermes — full world view PLUS persistent memory of past ticks and player
 * behavior — even though the heuristic ignores most of it.
 */

import type { ChatMessage, HermesClient } from "./hermes.js";
import type { Address } from "./types.js";

export interface TileView {
  tileId: number;
  owner: Address;          // address(0) = the wilds
  ownerIsWilds: boolean;
  garrison: number;        // whole Flux
  mod: number;             // terrain modifier (WAD as a float, 1.0 = neutral)
}

export interface WorldView {
  regionId: bigint;
  tick: bigint;
  tiles: TileView[];
  alpha: number;           // diminishing-returns exponent (0.5)
  delta: number;           // defender advantage (1.3)
  minCommit: number;       // whole Flux
}

/** Persistent, cross-tick memory — Bucket 3. The continuity that makes a
 *  faction feel like an actor with intent, not a dice roll. Hermes fills the
 *  notes; the heuristic leaves them empty. */
export interface FactionMemory {
  /** newest-last log of what the faction saw/did each tick */
  ticks: Array<{ tick: number; note: string }>;
  /** free-form relationship/strategy notes keyed by address or theme */
  notes: Record<string, string>;
}

export interface FactionContext {
  faction: { handle: string; display: string; address: Address; escrow: number };
  world: WorldView;
  memory: FactionMemory;
}

export interface FactionMove {
  tileId: number;
  committed: number;       // whole Flux (validated against escrow/minCommit upstream)
  /** Hermes's in-character justification — narration fuel, never an outcome */
  reasoning?: string;
}

export interface FactionAgent {
  /** the faction's personality label, for memory/narration */
  readonly persona: string;
  /** choose a move, or null to hold this tick */
  decide(ctx: FactionContext): Promise<FactionMove | null>;
}

// ---------------------------------------------------------------------------
// math (mirrors ResolverLib / world_sim — used by the heuristic to estimate)
// ---------------------------------------------------------------------------
function winChance(commit: number, ctx: FactionContext, tile: TileView): number {
  const { alpha, delta } = ctx.world;
  const pa = Math.pow(commit, alpha);
  const pd = Math.pow(tile.garrison, alpha) * tile.mod * delta;
  return pa + pd === 0 ? 0 : pa / (pa + pd);
}

// ---------------------------------------------------------------------------
// Heuristic stand-in for Hermes. Faithful to world_sim.py archetypes, reading
// the live world. Deterministic and testable — the seat Hermes will take.
// ---------------------------------------------------------------------------
export type Archetype = "raider" | "turtle" | "opportunist" | "balancer";

export class HeuristicFactionAgent implements FactionAgent {
  readonly persona: string;
  constructor(
    private readonly archetype: Archetype,
    /** share of escrow it is willing to commit (0..1) */
    private readonly aggression = 0.7,
    persona?: string,
  ) {
    this.persona = persona ?? archetype;
  }

  async decide(ctx: FactionContext): Promise<FactionMove | null> {
    const { faction, world } = ctx;
    const budget = Math.floor(faction.escrow * this.aggression);
    if (budget < world.minCommit) return null;
    const me = faction.address.toLowerCase();
    const targets = world.tiles.filter((t) => t.owner.toLowerCase() !== me);
    if (targets.length === 0) return null;

    const owned = world.tiles.filter((t) => t.owner.toLowerCase() === me).length;
    let pick: TileView | undefined;

    switch (this.archetype) {
      case "turtle":
        // only grab cheap wilds until it has two footholds, then hold
        if (owned >= 2) return null;
        pick = targets.filter((t) => t.ownerIsWilds)
          .sort((a, b) => a.garrison - b.garrison)[0];
        break;
      case "opportunist":
        // strike only when the odds are good
        pick = [...targets].sort((a, b) =>
          winChance(budget, ctx, b) - winChance(budget, ctx, a))[0];
        if (!pick || winChance(budget, ctx, pick) < 0.55) return null;
        break;
      case "balancer": {
        // gang up on the leader if anyone holds >=40% of tiles
        const counts: Record<string, number> = {};
        for (const t of world.tiles) if (!t.ownerIsWilds)
          counts[t.owner.toLowerCase()] = (counts[t.owner.toLowerCase()] ?? 0) + 1;
        const leader = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        if (leader && leader[0] !== me && leader[1] / world.tiles.length >= 0.4) {
          pick = targets.filter((t) => t.owner.toLowerCase() === leader[0])
            .sort((a, b) => a.garrison - b.garrison)[0];
        }
        if (!pick) pick = targets.filter((t) => t.ownerIsWilds)
          .sort((a, b) => a.garrison - b.garrison)[0];
        break;
      }
      case "raider":
      default:
        // cheapest tile to take that isn't ours
        pick = [...targets].sort((a, b) => a.garrison - b.garrison)[0];
        break;
    }

    if (!pick) return null;
    const committed = Math.min(budget, faction.escrow);
    if (committed < world.minCommit) return null;
    return {
      tileId: pick.tileId,
      committed,
      reasoning: `${this.persona} moves on isle ${pick.tileId} ` +
        `(garrison ${pick.garrison}, est. ${Math.round(winChance(committed, ctx, pick) * 100)}% to take it).`,
    };
  }
}

/**
 * Hermes Agent faction player. Hermes brings the intelligence and memory;
 * the chain disposes. Its move is a PROPOSAL, validated against the resolver
 * constraints before it becomes a signed intent — a jailbroken Hermes can
 * still only choose where to commit, never win. On timeout / bad JSON /
 * invalid move it falls back to a deterministic stand-in, so a tick never
 * blocks on the LLM.
 */
export class HermesFactionAgent implements FactionAgent {
  readonly persona: string;
  constructor(
    persona: string,
    private readonly client: HermesClient,
    /** deterministic backstop used on any LLM failure */
    private readonly fallback: FactionAgent,
  ) {
    this.persona = persona;
  }

  async decide(ctx: FactionContext): Promise<FactionMove | null> {
    try {
      const messages = buildFactionPrompt(this.persona, ctx);
      // a faction move is a background tick decision, not a chat reply — give
      // the LLM generous room (reasoning models spend tokens thinking before
      // they emit the JSON) before the deterministic fallback takes over
      const raw = await this.client.chatJson(messages, validateRawMove,
        { temperature: 0.8, maxTokens: 1800, timeoutMs: 60_000 });
      // a deliberate "hold this tick" is null — the scheduler records it as
      // held and signs nothing (a sentinel tileId would crash EIP-712 uint64
      // encoding and fail the whole tick).
      if (raw.hold) return null;
      const move = sanitizeMove(raw, ctx);
      if (!move) throw new Error("Hermes proposed an illegal move");
      return move;
    } catch (err) {
      console.warn(`Hermes faction ${this.persona} fell back to heuristic:`,
        (err as Error).message);
      return this.fallback.decide(ctx);
    }
  }
}

interface RawMove {
  hold?: boolean;
  tileId?: number;
  committed?: number;
  reasoning?: string;
}

function validateRawMove(raw: unknown): RawMove {
  if (typeof raw !== "object" || raw === null) throw new Error("move not an object");
  const r = raw as Record<string, unknown>;
  const out: RawMove = {};
  if (typeof r.hold === "boolean") out.hold = r.hold;
  if (typeof r.tileId === "number") out.tileId = r.tileId;
  if (typeof r.committed === "number") out.committed = r.committed;
  if (typeof r.reasoning === "string") out.reasoning = r.reasoning.slice(0, 280);
  return out;
}

/** clamp a proposed move to what the chain will actually accept; null if it
 *  can't be made legal (caller falls back) */
function sanitizeMove(raw: RawMove, ctx: FactionContext): FactionMove | null {
  const { faction, world } = ctx;
  if (typeof raw.tileId !== "number" || typeof raw.committed !== "number") return null;
  const tile = world.tiles.find((t) => t.tileId === raw.tileId);
  if (!tile) return null;
  if (tile.owner.toLowerCase() === faction.address.toLowerCase()) return null; // no self-attack
  let committed = Math.floor(raw.committed);
  if (committed > faction.escrow) committed = Math.floor(faction.escrow);
  if (committed < world.minCommit) return null;
  return {
    tileId: raw.tileId,
    committed,
    reasoning: raw.reasoning ?? `the faction moves on isle ${raw.tileId}`,
  };
}

function buildFactionPrompt(persona: string, ctx: FactionContext): ChatMessage[] {
  const { faction, world, memory } = ctx;
  const tiles = world.tiles.map((t) =>
    `  isle ${t.tileId}: ${t.ownerIsWilds ? "wilds"
      : t.owner.toLowerCase() === faction.address.toLowerCase() ? "YOURS" : t.owner}` +
    `, garrison ${t.garrison}`).join("\n");
  const recent = memory.ticks.slice(-6).map((m) => `  tick ${m.tick}: ${m.note}`).join("\n")
    || "  (no history yet)";
  const notes = Object.entries(memory.notes).map(([k, v]) => `  ${k}: ${v}`).join("\n")
    || "  (none)";

  const system = [
    `You are ${persona}, an AI faction commander in Holdfast, a persistent`,
    `on-chain war for islands. You PROPOSE a move; a deterministic resolver`,
    `and on-chain randomness DECIDE the outcome — you cannot win by reasoning,`,
    `only choose where to commit, and you can lose. Play in character with`,
    `memory and intent.`,
    ``,
    `Rules: each tick you may attack ONE isle you do not own by committing`,
    `Flux from your war chest. Win chance rises with committed Flux but with`,
    `diminishing returns (exponent 0.5); the defender has a ${world.delta}x`,
    `edge. A winning attack takes the isle and your committed Flux becomes its`,
    `garrison. Minimum commit is ${world.minCommit} Flux.`,
    ``,
    `Respond with ONLY a JSON object, no prose. Either:`,
    `  {"tileId": <int>, "committed": <int Flux>, "reasoning": "<one sentence>"}`,
    `or to wait this tick:`,
    `  {"hold": true, "reasoning": "<one sentence>"}`,
  ].join("\n");

  const user = [
    `Your war chest: ${faction.escrow} Flux.`,
    `The isles right now:`,
    tiles,
    ``,
    `Your recent moves:`,
    recent,
    ``,
    `Your standing notes (rivalries, plans):`,
    notes,
    ``,
    `Choose your move.`,
  ].join("\n");

  return [{ role: "system", content: system }, { role: "user", content: user }];
}
