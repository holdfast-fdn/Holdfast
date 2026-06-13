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
 * Hermes Agent faction player — NOT yet wired. When configured it must:
 *  1. build a prompt from ctx.world + ctx.memory (state + relationships +
 *     past ticks + the faction's persona/goals),
 *  2. ask Hermes for a move as STRICT JSON {tileId, committed, reasoning},
 *  3. validate it against the resolver constraints (tile exists, not its
 *     own, committed in [minCommit, escrow]); on garbage/timeout, fall back
 *     to a HeuristicFactionAgent so a tick never blocks on the LLM,
 *  4. return it — the move is then SIGNED by the faction wallet and submitted
 *     as a normal intent. Hermes brings intelligence and memory; it can
 *     never make the chain rule in its favor.
 */
export class HermesFactionAgent implements FactionAgent {
  readonly persona: string;
  constructor(persona: string, private readonly endpoint?: string) {
    this.persona = persona;
  }
  async decide(_ctx: FactionContext): Promise<FactionMove | null> {
    throw new Error(
      "HermesFactionAgent is not configured yet — wire the Hermes Agent " +
        "endpoint, validate moves against the resolver constraints, and " +
        "fall back to a heuristic on failure before use",
    );
  }
}
