"""
Living World — Multi-tick simulation.

Builds on resolver.py (already tested). The goal is NOT contest math anymore —
that is proven. The goal: does the WORLD feel alive when several ticks run
back to back, with:
  - resource generation (tiles emit Flux/tick -> emission)
  - offline ticks (AI factions move without players)
  - player balances rising and falling (afford check: cannot commit > balance)
  - world events emerging from state, not from narrative

Only Bucket 1 + Bucket 2 (mechanical state) are simulated here. The GM/Hermes
(narrative, Bucket 3) is deliberately ABSENT — we test whether the mechanical
skeleton is interesting even without a story. If it is boring without
narrative, narrative only patches it; if it is already interesting, narrative
multiplies it.

Run: python3 world_sim.py
"""

from __future__ import annotations
import random
from dataclasses import dataclass, field, replace
from resolver import (
    Tile, Intent, resolve_tick, power, win_probability,
    ALPHA, DEFENDER_ADVANTAGE, SPOILS_RATIO, DEFEND_REWARD,
)

# ---------------------------------------------------------------------------
# World parameters (historical defaults — used by the demo and SimParams)
# ---------------------------------------------------------------------------
YIELD_PER_TILE = 12.0     # Flux each tile pays its owner per tick
GARRISON_REGEN = 4.0      # garrison grows a little each tick (up to the cap)
GARRISON_CAP = 200.0
STARTING_BALANCE = 250.0
NATURE = "nature"         # neutral tile, held by the wilds


@dataclass(frozen=True)
class SimParams:
    """Every tuning knob as an argument, not a module constant (Workstream A)."""
    alpha: float = ALPHA
    delta: float = DEFENDER_ADVANTAGE
    gamma: float = SPOILS_RATIO
    beta: float = DEFEND_REWARD
    yield_per_tile: float = YIELD_PER_TILE
    garrison_regen: float = GARRISON_REGEN
    garrison_cap: float = GARRISON_CAP
    garrison_decay: float = 0.0   # fraction of garrison lost per tick (0 = off)
    starting_balance: float = STARTING_BALANCE


@dataclass
class Player:
    name: str
    balance: float
    is_ai: bool = False
    # simple "personality" for AI factions / player bots
    aggression: float = 0.5   # 0..1, share of balance spent on attacking
    archetype: str = "raider"  # raider | turtle | opportunist | balancer


@dataclass
class World:
    tick: int
    tiles: dict
    players: dict
    total_burned: float = 0.0
    log: list = field(default_factory=list)
    params: SimParams = field(default_factory=SimParams)
    seed_prefix: str = ""      # distinguishes VRF streams across sweep runs
    total_emitted: float = 0.0

    def owned_by(self, name):
        return [t for t in self.tiles.values() if t.owner == name]


# ---------------------------------------------------------------------------
# Phase 1: resource generation (emission) — tile owners collect yield
# ---------------------------------------------------------------------------
def phase_generate(world: World):
    P = world.params
    for t in world.tiles.values():
        if t.owner != NATURE and t.owner in world.players:
            world.players[t.owner].balance += P.yield_per_tile
            world.total_emitted += P.yield_per_tile
        # garrison decays (optional) then regenerates toward the cap
        new_g = min(P.garrison_cap,
                    t.garrison * (1.0 - P.garrison_decay) + P.garrison_regen)
        world.tiles[t.tile_id] = replace(t, garrison=new_g)


# ---------------------------------------------------------------------------
# Phase 2: AI decisions (factions + player bots) — the world moves while offline
# Four archetypes (Workstream A): raider hits the weakest, turtle only builds
# a foothold then holds, opportunist strikes when odds are good, balancer
# gangs up on the current leader.
# ---------------------------------------------------------------------------
def _decide_raider(world: World, p: Player, rng: random.Random):
    budget = p.balance * p.aggression
    if budget < 20:
        return None
    # pick a target: the cheapest-to-take tile that is not its own
    candidates = [t for t in world.tiles.values() if t.owner != p.name]
    if not candidates:
        return None
    # heuristic: lowest garrison, lightly randomized
    candidates.sort(key=lambda t: t.garrison + rng.uniform(0, 20))
    target = candidates[0]
    commit = min(budget, p.balance)
    if commit >= 20:
        p.balance -= commit  # Flux is locked on commit
        return Intent(p.name, target.tile_id, committed=round(commit, 1))
    return None


def _decide_turtle(world: World, p: Player, rng: random.Random):
    # defensive: only grabs neutral tiles until it owns 2 economic footholds,
    # then never attacks again (hoards balance, relies on garrison)
    if len(world.owned_by(p.name)) >= 2:
        return None
    budget = p.balance * max(p.aggression, 0.4)
    if budget < 20:
        return None
    candidates = [t for t in world.tiles.values() if t.owner == NATURE]
    if not candidates:
        return None
    candidates.sort(key=lambda t: t.garrison + rng.uniform(0, 20))
    target = candidates[0]
    commit = min(budget, p.balance)
    if commit >= 20:
        p.balance -= commit  # Flux is locked on commit
        return Intent(p.name, target.tile_id, committed=round(commit, 1))
    return None


def _decide_opportunist(world: World, p: Player, rng: random.Random):
    # attacks only when the estimated win probability is high enough;
    # otherwise saves (balance grows -> the next strike is stronger)
    P = world.params
    budget = p.balance * p.aggression
    if budget < 20:
        return None
    best, best_p = None, 0.0
    for t in world.tiles.values():
        if t.owner == p.name:
            continue
        p_a = power(budget, 1.0, P.alpha)
        p_d = power(t.garrison, t.modifier, P.alpha, P.delta)
        p_win = win_probability(p_a, p_d)
        if p_win > best_p:
            best, best_p = t, p_win
    if best is None or best_p < 0.55:
        return None
    commit = min(budget, p.balance)
    p.balance -= commit  # Flux is locked on commit
    return Intent(p.name, best.tile_id, committed=round(commit, 1))


def _decide_balancer(world: World, p: Player, rng: random.Random):
    # anti-leader raider: if any player holds >=40% of the tiles, attack that
    # leader's weakest tile (mimics humans ganging up on the front-runner);
    # otherwise behaves like a plain raider
    shares = {}
    for t in world.tiles.values():
        if t.owner != NATURE:
            shares[t.owner] = shares.get(t.owner, 0) + 1
    if shares:
        leader = max(shares, key=shares.get)
        if leader != p.name and shares[leader] / len(world.tiles) >= 0.4:
            budget = p.balance * p.aggression
            if budget < 20:
                return None
            candidates = [t for t in world.tiles.values() if t.owner == leader]
            candidates.sort(key=lambda t: t.garrison + rng.uniform(0, 20))
            target = candidates[0]
            commit = min(budget, p.balance)
            if commit >= 20:
                p.balance -= commit  # Flux is locked on commit
                return Intent(p.name, target.tile_id, committed=round(commit, 1))
            return None
    return _decide_raider(world, p, rng)


ARCHETYPES = {
    "raider": _decide_raider,
    "turtle": _decide_turtle,
    "opportunist": _decide_opportunist,
    "balancer": _decide_balancer,
}


def ai_decide(world: World, rng: random.Random):
    intents = []
    for p in world.players.values():
        if not p.is_ai:
            continue
        it = ARCHETYPES[p.archetype](world, p, rng)
        if it is not None:
            intents.append(it)
    return intents


# ---------------------------------------------------------------------------
# Phase 3: apply human player intents (scripted here for the demo)
# Afford check: cannot commit more than the balance.
# ---------------------------------------------------------------------------
def apply_human_intents(world: World, human_intents):
    valid = []
    for it in human_intents:
        p = world.players.get(it.player)
        if p is None:
            continue
        if it.committed > p.balance:
            world.log.append(f"  [!] {it.player} tried to commit {it.committed} "
                             f"with only {p.balance:.0f} — rejected")
            continue
        p.balance -= it.committed
        valid.append(it)
    return valid


# ---------------------------------------------------------------------------
# Phase 4: resolution (uses the tested resolver) + payout to balances
# ---------------------------------------------------------------------------
def phase_resolve(world: World, intents, seed: str):
    P = world.params
    res = resolve_tick(intents, world.tiles, seed,
                       alpha=P.alpha, delta=P.delta, gamma=P.gamma, beta=P.beta)
    # apply tile changes + distribute flux to player balances
    tiles = dict(world.tiles)
    for r in res.results:
        tiles[r.target] = replace(tiles[r.target], owner=r.new_owner,
                                  garrison=r.new_garrison)
        if r.flux_to_attacker and r.attacker in world.players:
            world.players[r.attacker].balance += r.flux_to_attacker
        if r.flux_to_defender and r.defender in world.players:
            world.players[r.defender].balance += r.flux_to_defender
    world.tiles = tiles
    world.total_burned += res.total_burned
    return res


# ---------------------------------------------------------------------------
# World events EMERGENT from state (not from GM narrative)
# ---------------------------------------------------------------------------
def detect_events(world: World, prev_owners: dict):
    events = []
    # 1. a tile changed hands
    for tid, t in world.tiles.items():
        if prev_owners.get(tid) != t.owner:
            events.append(f"⚔  {tid} taken by {t.owner} from {prev_owners.get(tid)}")
    # 2. dominance: a player holds >=50% of non-nature tiles
    non_nature = [t for t in world.tiles.values() if t.owner != NATURE]
    if non_nature:
        from collections import Counter
        c = Counter(t.owner for t in non_nature)
        top, n = c.most_common(1)[0]
        if n / len(world.tiles) >= 0.5:
            events.append(f"👑 {top} holds {n}/{len(world.tiles)} tiles — hegemony!")
    # 3. near-bankruptcy
    for p in world.players.values():
        if p.balance < 20 and not p.is_ai:
            events.append(f"💸 {p.name} is nearly bankrupt (balance {p.balance:.0f})")
    return events


# ---------------------------------------------------------------------------
# World loop
# ---------------------------------------------------------------------------
def run_tick(world: World, human_intents, rng: random.Random):
    prev_owners = {tid: t.owner for tid, t in world.tiles.items()}
    world.tick += 1
    seed = f"{world.seed_prefix}tick_{world.tick}_seed"

    phase_generate(world)
    ai_intents = ai_decide(world, rng)
    human_valid = apply_human_intents(world, human_intents)
    all_intents = human_valid + ai_intents
    res = phase_resolve(world, all_intents, seed)
    events = detect_events(world, prev_owners)
    return res, events, len(human_valid), len(ai_intents)


def snapshot(world: World):
    print(f"\n  Balance: " + "  ".join(
        f"{p.name}={p.balance:.0f}{'*' if p.is_ai else ''}"
        for p in world.players.values()))
    holdings = {}
    for t in world.tiles.values():
        holdings[t.owner] = holdings.get(t.owner, 0) + 1
    print(f"  Tiles  : " + "  ".join(f"{k}={v}" for k, v in sorted(holdings.items())))


def build_world(params: SimParams | None = None):
    params = params if params is not None else SimParams()
    sb = params.starting_balance
    players = {
        "alice":   Player("alice", sb),
        "bob":     Player("bob", sb),
        "south":   Player("south", sb, is_ai=True, aggression=0.6),
        "raiders": Player("raiders", sb, is_ai=True, aggression=0.8),
    }
    tiles = {}
    layout = [
        ("tile_01", "alice"), ("tile_02", "alice"),   ("tile_03", NATURE),
        ("tile_04", "bob"),   ("tile_05", NATURE),    ("tile_06", "south"),
        ("tile_07", NATURE),  ("tile_08", "raiders"), ("tile_09", NATURE),
    ]
    for tid, owner in layout:
        g = 100.0 if owner != NATURE else 60.0  # neutrals are weaker, inviting expansion
        tiles[tid] = Tile(tid, owner=owner, garrison=g)
    return World(tick=0, tiles=tiles, players=players, params=params)


if __name__ == "__main__":
    rng = random.Random(7)  # deterministic, for demo reproducibility
    world = build_world()

    print("=" * 64)
    print("LIVING WORLD — 6-TICK SIMULATION")
    print(f"(* = AI faction · yield {YIELD_PER_TILE}/tile · alpha={ALPHA})")
    print("=" * 64)
    print("\nTICK 0 (initial state):")
    snapshot(world)

    # Human player scenario per tick (intents scripted for the demo).
    # In the real game these come from player NL via Hermes.
    human_plan = {
        1: [Intent("alice", "tile_03", committed=120)],   # take a neutral
        2: [Intent("alice", "tile_05", committed=160)],   # expand
        3: [Intent("bob", "tile_06", committed=200)],     # bob attacks south (AI)
        4: [Intent("alice", "tile_06", committed=140)],   # fight over tile_06
        5: [Intent("bob", "tile_05", committed=180)],     # bob challenges alice
        6: [Intent("alice", "tile_08", committed=220)],   # storm the raiders' base
    }

    for tick_no in range(1, 7):
        plan = human_plan.get(tick_no, [])
        res, events, n_human, n_ai = run_tick(world, plan, rng)
        print(f"\n{'─'*64}\nTICK {world.tick}  "
              f"({n_human} human actions, {n_ai} AI actions):")
        for r in res.results:
            tag = "WIN " if r.attacker_won else "loss"
            ai = "*" if world.players[r.attacker].is_ai else " "
            print(f"  {r.attacker:>8}{ai}-> {r.target} | p={r.p:>5.1%} "
                  f"roll={r.roll:.3f} | {tag}  | burn={r.flux_burned:>5.1f}")
        if events:
            print("  Events:")
            for e in events:
                print(f"    {e}")
        for l in world.log:
            print(l)
        world.log.clear()
        snapshot(world)

    print(f"\n{'='*64}")
    print(f"Total Flux burned over 6 ticks : {world.total_burned:.1f}")
    # emission vs sink summary
    total_yield_est = sum(
        1 for t in world.tiles.values() if t.owner != NATURE) * YIELD_PER_TILE * 6
    print(f"Rough emission estimate (yield): ~{total_yield_est:.0f}")
    verdict = "deflationary (healthy)" if world.total_burned > total_yield_est \
        else "inflationary (needs more sink)"
    print(f"Economy direction this run     : {verdict}")
    print("=" * 64)
    print("\nQuestions to FEEL, not compute:")
    print("  - Does the map change hands in ways that spark curiosity?")
    print("  - Do the AI factions feel intentional, or just random?")
    print("  - Is there an 'oh, my world changed overnight' moment?")
    print("  If YES without narrative — the GM's narration will multiply it.")
