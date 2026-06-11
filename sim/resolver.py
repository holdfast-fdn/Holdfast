"""
Living World — Resolver prototype (pure functions).

Purpose: validate the economic heart and the "fair/exciting feel" of the game
BEFORE touching Solidity or Hermes. Everything is deterministic and
reproducible: same inputs -> same outputs. No I/O, no global state.

Run: python3 resolver.py
"""

from __future__ import annotations
import hashlib
from dataclasses import dataclass, replace

# ---------------------------------------------------------------------------
# Economic parameters (tuning knobs)
# ---------------------------------------------------------------------------
ALPHA = 0.5             # diminishing-returns exponent (the heart of tuning)
DEFENDER_ADVANTAGE = 1.3  # delta: taking a tile costs more than holding it
SPOILS_RATIO = 0.5      # gamma: share of garrison to the attacker on a win
DEFEND_REWARD = 0.5     # beta: share of committed Flux to the defender on a loss


# ---------------------------------------------------------------------------
# Simulated VRF — deterministic from (seed, contest_id), reproducible.
# In production this is replaced by an on-chain VRF. A hash suffices here.
# ---------------------------------------------------------------------------
def vrf(seed: str, contest_id: str) -> float:
    h = hashlib.sha256(f"{seed}:{contest_id}".encode()).hexdigest()
    return int(h, 16) / float(1 << 256)  # -> [0, 1)


# ---------------------------------------------------------------------------
# Contest math (pure functions)
# ---------------------------------------------------------------------------
def power(flux: float, modifier: float, alpha: float, advantage: float = 1.0) -> float:
    return (flux ** alpha) * modifier * advantage


def win_probability(p_a: float, p_d: float) -> float:
    if p_a + p_d == 0:
        return 0.0
    return p_a / (p_a + p_d)


@dataclass(frozen=True)
class Tile:
    tile_id: str
    owner: str
    garrison: float          # Flux guarding the tile
    modifier: float = 1.0    # terrain etc. (Bucket 2)


@dataclass(frozen=True)
class Intent:
    player: str
    target: str              # tile_id
    committed: float         # Flux committed by the attacker
    modifier: float = 1.0    # reputation/alliances (Bucket 2)


@dataclass(frozen=True)
class ContestResult:
    contest_id: str
    target: str
    attacker: str
    defender: str
    p: float                 # attacker's theoretical win probability
    roll: float              # VRF outcome
    attacker_won: bool
    flux_to_attacker: float
    flux_to_defender: float
    flux_burned: float
    new_owner: str
    new_garrison: float


def resolve_contest(intent: Intent, tile: Tile, seed: str,
                    alpha: float = ALPHA,
                    delta: float = DEFENDER_ADVANTAGE,
                    gamma: float = SPOILS_RATIO,
                    beta: float = DEFEND_REWARD) -> ContestResult:
    """Resolve a single contest deterministically. Pure function."""
    contest_id = f"{intent.player}->{intent.target}"
    p_a = power(intent.committed, intent.modifier, alpha)
    p_d = power(tile.garrison, tile.modifier, alpha, delta)
    p = win_probability(p_a, p_d)
    roll = vrf(seed, contest_id)
    won = roll < p

    if won:
        # Attacker takes the tile. Spoils from the garrison; the rest burns.
        spoils = gamma * tile.garrison
        burned = tile.garrison - spoils
        return ContestResult(
            contest_id, intent.target, intent.player, tile.owner,
            p, roll, True,
            flux_to_attacker=spoils, flux_to_defender=0.0, flux_burned=burned,
            new_owner=intent.player, new_garrison=intent.committed,
        )
    else:
        # Attacker loses. Part of the commit goes to the defender; the rest burns.
        reward = beta * intent.committed
        burned = intent.committed - reward
        return ContestResult(
            contest_id, intent.target, intent.player, tile.owner,
            p, roll, False,
            flux_to_attacker=0.0, flux_to_defender=reward, flux_burned=burned,
            new_owner=tile.owner, new_garrison=tile.garrison,
        )


@dataclass(frozen=True)
class TickResult:
    results: tuple
    total_burned: float
    total_to_players: float


def resolve_tick(intents, tiles: dict, seed: str, alpha: float = ALPHA,
                 delta: float = DEFENDER_ADVANTAGE,
                 gamma: float = SPOILS_RATIO,
                 beta: float = DEFEND_REWARD) -> TickResult:
    """
    Resolve every intent of one tick.
    Collision rule: if >1 attacker targets the same tile, sort by committed
    desc and resolve sequentially (the tile's state changes as we go).
    Returns results + sink/flow accounting. Pure function of (intents, tiles, seed).
    """
    tiles = dict(tiles)  # local copy; never mutate the input
    by_target = {}
    for it in intents:
        by_target.setdefault(it.target, []).append(it)

    results = []
    total_burned = 0.0
    total_to_players = 0.0

    for target, group in by_target.items():
        group = sorted(group, key=lambda x: x.committed, reverse=True)
        for it in group:
            tile = tiles[target]
            if it.player == tile.owner:
                continue  # no attacking your own tile
            res = resolve_contest(it, tile, seed, alpha, delta, gamma, beta)
            results.append(res)
            total_burned += res.flux_burned
            total_to_players += res.flux_to_attacker + res.flux_to_defender
            tiles[target] = replace(
                tile, owner=res.new_owner, garrison=res.new_garrison
            )

    return TickResult(tuple(results), total_burned, total_to_players)


# ===========================================================================
# TEST SCENARIOS — where we get a feel for whether the math is right
# ===========================================================================
def line(c="-"):
    print(c * 64)


def scenario_even_fight():
    print("\n### 1. Even fight (100 vs 100, equal modifiers)")
    line()
    p_a = power(100, 1.0, ALPHA)
    p_d = power(100, 1.0, ALPHA, DEFENDER_ADVANTAGE)
    p = win_probability(p_a, p_d)
    print(f"P_a={p_a:.2f}  P_d={p_d:.2f}  ->  attacker win probability = {p:.1%}")
    print("Expected: slightly below 50% due to defender advantage. ✓"
          if p < 0.5 else "ANOMALY")


def scenario_win_curve():
    print("\n### 2. Win-probability curve vs Flux ratio (garrison=100)")
    line()
    print(f"{'commit':>8} | {'ratio':>6} | {'p_win':>9}")
    line()
    for f in [25, 50, 100, 200, 400, 676, 1000, 2000]:
        p_a = power(f, 1.0, ALPHA)
        p_d = power(100, 1.0, ALPHA, DEFENDER_ADVANTAGE)
        p = win_probability(p_a, p_d)
        print(f"{f:>8} | {f/100:>5.1f}x | {p:>8.1%}")
    print("\nNote: ~676 Flux (≈7x) buys ~67% (2:1). Dominance is expensive -> upsets live.")


def scenario_whale_split():
    print("\n### 3. Whale split: one big attack vs many small attacks")
    line()
    big = power(400, 1.0, ALPHA)
    small_total = 4 * power(100, 1.0, ALPHA)
    print(f"alpha={ALPHA}")
    print(f"  1x 400 Flux -> total power = {big:.2f}")
    print(f"  4x 100 Flux -> total power = {small_total:.2f}")
    print("  Because alpha<1, splitting yields MORE total power.")
    print("  => whales are pushed toward BREADTH (many tiles), not DEPTH.")
    print("  This is a deliberate design trade-off, not a bug.")


def scenario_reproducibility():
    print("\n### 4. Reproducibility (the trustless requirement)")
    line()
    tile = Tile("tile_07", owner="south_faction", garrison=120.0)
    it = Intent(player="alice", target="tile_07", committed=180.0)
    r1 = resolve_contest(it, tile, seed="tick42_vrf_0xabc")
    r2 = resolve_contest(it, tile, seed="tick42_vrf_0xabc")
    assert r1 == r2, "RESOLVER IS NOT DETERMINISTIC — fatal"
    print(f"roll={r1.roll:.6f}  p={r1.p:.1%}  won={r1.attacker_won}")
    print("Two identical runs from the same input. ✓ (anyone can re-verify)")


def scenario_montecarlo():
    print("\n### 5. Monte Carlo: does the empirical win rate match theoretical p?")
    line()
    tile = Tile("t", owner="def", garrison=100.0)
    it = Intent(player="atk", target="t", committed=200.0)
    p_theory = win_probability(
        power(200, 1.0, ALPHA), power(100, 1.0, ALPHA, DEFENDER_ADVANTAGE))
    wins = 0
    N = 20000
    for i in range(N):
        r = resolve_contest(it, tile, seed=f"mc_seed_{i}")
        if r.attacker_won:
            wins += 1
    emp = wins / N
    print(f"theoretical p={p_theory:.3f}  |  empirical={emp:.3f}  |  N={N}")
    print("Matches within noise. ✓ VRF is unbiased."
          if abs(emp - p_theory) < 0.02 else "ANOMALY: VRF bias")


def scenario_full_tick():
    print("\n### 6. One full tick — 4 players, 9 tiles, sink accounting")
    line()
    tiles = {
        f"tile_0{i}": Tile(f"tile_0{i}", owner=("nature" if i > 3 else f"p{i}"),
                           garrison=100.0)
        for i in range(1, 10)
    }
    intents = [
        Intent("alice", "tile_05", committed=300.0),   # attack a strong neutral
        Intent("bob",   "tile_05", committed=150.0),   # collision! same tile
        Intent("carol", "tile_01", committed=180.0, modifier=1.2),  # +reputation
        Intent("dave",  "tile_06", committed=80.0),    # weak attack
    ]
    tick = resolve_tick(intents, tiles, seed="tick_2026_06_11")
    for r in tick.results:
        tag = "WIN" if r.attacker_won else "loss"
        print(f"  {r.attacker:>8} -> {r.target} | p={r.p:>5.1%} roll={r.roll:.3f}"
              f" | {tag:>6} | burn={r.flux_burned:>6.1f}")
    line()
    print(f"  Total Flux burned this tick : {tick.total_burned:>8.1f}  (SINK)")
    print(f"  Total Flux to players       : {tick.total_to_players:>8.1f}")
    print("  This settlement = 1 Base transaction (Merkle root), not 4.")


def scenario_sink_vs_emission():
    print("\n### 7. Sink vs emission — economy health check (10 ticks)")
    line()
    # simple assumption: each tile emits 'yield' Flux/tick (emission),
    # and average contest activity burns a share of it (sink).
    n_tiles = 9
    yield_per_tile = 10.0          # emission/tile/tick
    contests_per_tick = 4
    avg_committed = 180.0
    # average burn per contest: mix of wins (~50% garrison) & losses (~50% commit)
    avg_burn_per_contest = 0.5 * avg_committed
    emission = n_tiles * yield_per_tile
    sink = contests_per_tick * avg_burn_per_contest
    print(f"  Emission / tick (yield, {n_tiles} tiles)  : {emission:>7.1f} Flux")
    print(f"  Sink     / tick (burn, {contests_per_tick} contests): {sink:>7.1f} Flux")
    net = emission - sink
    verdict = ("DEFLATIONARY ✓ (sink>emission, healthy)" if net < 0
               else "INFLATIONARY ⚠ (emission>sink — slow ponzi)")
    print(f"  Net supply / tick               : {net:>+7.1f} Flux  -> {verdict}")
    print("\n  => At these parameters the economy is deflationary while active.")
    print("     If activity drops, emission wins -> another sink is needed (compute fee).")


if __name__ == "__main__":
    print("=" * 64)
    print("LIVING WORLD — RESOLVER PROTOTYPE")
    print(f"alpha={ALPHA}  delta={DEFENDER_ADVANTAGE}  "
          f"gamma={SPOILS_RATIO}  beta={DEFEND_REWARD}")
    print("=" * 64)
    scenario_even_fight()
    scenario_win_curve()
    scenario_whale_split()
    scenario_reproducibility()
    scenario_montecarlo()
    scenario_full_tick()
    scenario_sink_vs_emission()
    print("\n" + "=" * 64)
    print("All scenarios complete. Resolver is deterministic & reproducible.")
    print("=" * 64)
