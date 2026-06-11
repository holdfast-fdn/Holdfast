"""
Holdfast — Balance lab (Workstream A / Phase 1).

Runs world_sim many times (N seeds per parameter set) and measures:
  - upset rate     : how often the side with <50% win probability wins
  - holdings Gini  : inequality of tile ownership at the end of a run
  - economy        : net supply per tick (emission - burn); negative = deflationary
  - hegemony       : whether one player locks >=50% of tiles by the end
  - activity       : contests/tick (detects degenerate equilibria, e.g. all-turtle)
  - cursed tiles   : tiles attacked repeatedly that never fall

Every run is deterministic: integer seed -> AI rng + VRF seed prefix.

Run: python3 balance_lab.py [sweep|archetypes|decay|tune|counter|whale|all]
Machine output for docs/BALANCE.md.
"""

from __future__ import annotations
import random
import sys
from dataclasses import dataclass, field

from resolver import Tile
from world_sim import SimParams, Player, World, NATURE, run_tick

TILE_IDS = [f"tile_0{i}" for i in range(1, 10)]
HOME_SLOTS = [0, 3, 5, 7]          # players' starting tiles (Phase-0 demo layout)
DEFAULT_TICKS = 30
DEFAULT_SEEDS = 20

# Standard roster: mixed archetypes, equal balances
MIXED_ROSTER = [
    ("alice", "raider", 0.8, 1.0),
    ("bob",   "raider", 0.6, 1.0),
    ("carol", "opportunist", 0.7, 1.0),
    ("dave",  "turtle", 0.4, 1.0),
]


def build_lab_world(params: SimParams, roster) -> World:
    """Roster: list of (name, archetype, aggression, starting-balance multiple)."""
    assert len(roster) <= len(HOME_SLOTS), "at most 4 players on a 9-tile map"
    players = {
        name: Player(name, params.starting_balance * mult, is_ai=True,
                     aggression=aggr, archetype=arch)
        for name, arch, aggr, mult in roster
    }
    homes = {TILE_IDS[slot]: roster[i][0]
             for i, slot in enumerate(HOME_SLOTS[:len(roster)])}
    tiles = {}
    for tid in TILE_IDS:
        owner = homes.get(tid, NATURE)
        g = 100.0 if owner != NATURE else 60.0
        tiles[tid] = Tile(tid, owner=owner, garrison=g)
    return World(tick=0, tiles=tiles, players=players, params=params)


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------
def gini(values) -> float:
    xs = sorted(values)
    n, s = len(xs), sum(xs)
    if n == 0 or s == 0:
        return 0.0
    cum = sum((i + 1) * x for i, x in enumerate(xs))
    return (2 * cum) / (n * s) - (n + 1) / n


@dataclass
class RunStats:
    contests: int = 0
    upsets: int = 0
    flips: int = 0                 # tiles changing hands
    gini_final: float = 0.0
    net_per_tick: float = 0.0      # (emission - burn)/tick; negative = deflationary
    hegemon: bool = False          # >=50% of tiles locked through the last 5 ticks
    late_contests_per_tick: float = 0.0   # activity over the final third of the run
    cursed_tiles: int = 0          # >=4 failed attacks, zero ownership changes
    top_share: float = 0.0         # top player's share of tiles at the end
    top_player: str = ""

    @property
    def upset_rate(self) -> float:
        return self.upsets / self.contests if self.contests else 0.0


def run_one(params: SimParams, roster, seed_i: int,
            n_ticks: int = DEFAULT_TICKS) -> RunStats:
    rng = random.Random(seed_i)
    world = build_lab_world(params, roster)
    world.seed_prefix = f"run{seed_i}_"

    stats = RunStats()
    failed_attacks = {tid: 0 for tid in TILE_IDS}
    owner_flips = {tid: 0 for tid in TILE_IDS}
    hegemony_streak = 0
    late_start = n_ticks - max(1, n_ticks // 3)
    late_contests = 0

    for tick_no in range(1, n_ticks + 1):
        prev_owners = {tid: t.owner for tid, t in world.tiles.items()}
        res, _events, _nh, _na = run_tick(world, [], rng)

        for r in res.results:
            stats.contests += 1
            if tick_no > late_start:
                late_contests += 1
            winner_p = r.p if r.attacker_won else 1.0 - r.p
            if winner_p < 0.5:
                stats.upsets += 1
            if not r.attacker_won:
                failed_attacks[r.target] += 1

        for tid, t in world.tiles.items():
            if prev_owners[tid] != t.owner:
                stats.flips += 1
                owner_flips[tid] += 1

        shares = _holdings(world)
        top = max(shares.values()) if shares else 0
        hegemony_streak = hegemony_streak + 1 if top / len(TILE_IDS) >= 0.5 else 0

    shares = _holdings(world)
    stats.gini_final = gini([shares.get(name, 0) for name, *_ in roster])
    stats.net_per_tick = (world.total_emitted - world.total_burned) / n_ticks
    stats.hegemon = hegemony_streak >= 5
    stats.late_contests_per_tick = late_contests / max(1, n_ticks - late_start)
    stats.cursed_tiles = sum(
        1 for tid in TILE_IDS if failed_attacks[tid] >= 4 and owner_flips[tid] == 0)
    if shares:
        stats.top_player = max(shares, key=shares.get)
        stats.top_share = shares[stats.top_player] / len(TILE_IDS)
    return stats


def _holdings(world: World) -> dict:
    out = {}
    for t in world.tiles.values():
        if t.owner != NATURE:
            out[t.owner] = out.get(t.owner, 0) + 1
    return out


@dataclass
class SetReport:
    label: str
    params: SimParams
    runs: list = field(default_factory=list)

    def _avg(self, f):
        return sum(f(r) for r in self.runs) / len(self.runs)

    @property
    def upset_rate(self):       return self._avg(lambda r: r.upset_rate)
    @property
    def gini_final(self):       return self._avg(lambda r: r.gini_final)
    @property
    def net_per_tick(self):     return self._avg(lambda r: r.net_per_tick)
    @property
    def hegemony_rate(self):    return self._avg(lambda r: 1.0 if r.hegemon else 0.0)
    @property
    def flips(self):            return self._avg(lambda r: r.flips)
    @property
    def late_activity(self):    return self._avg(lambda r: r.late_contests_per_tick)
    @property
    def cursed(self):           return self._avg(lambda r: r.cursed_tiles)
    @property
    def top_share(self):        return self._avg(lambda r: r.top_share)


def run_set(label: str, params: SimParams, roster,
            n_seeds: int = DEFAULT_SEEDS, n_ticks: int = DEFAULT_TICKS) -> SetReport:
    rep = SetReport(label, params)
    for i in range(n_seeds):
        rep.runs.append(run_one(params, roster, seed_i=1000 + i, n_ticks=n_ticks))
    return rep


def run_sweep(param_sets, roster=None, n_seeds: int = DEFAULT_SEEDS,
              n_ticks: int = DEFAULT_TICKS):
    """param_sets: list of (label, SimParams). Returns a list of SetReport."""
    roster = roster or MIXED_ROSTER
    return [run_set(label, p, roster, n_seeds, n_ticks) for label, p in param_sets]


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------
HEADER = (f"{'set':<22} | {'upset':>6} | {'gini':>5} | {'net/tick':>8} | "
          f"{'hegemony':>8} | {'flips':>5} | {'late c/t':>9} | {'cursed':>6}")


def print_reports(title: str, reports):
    print(f"\n### {title}")
    print("-" * len(HEADER))
    print(HEADER)
    print("-" * len(HEADER))
    for r in reports:
        eco = "DEF" if r.net_per_tick < 0 else "INF"
        print(f"{r.label:<22} | {r.upset_rate:>6.1%} | {r.gini_final:>5.2f} | "
              f"{r.net_per_tick:>+6.1f} {eco} | {r.hegemony_rate:>8.0%} | "
              f"{r.flips:>5.1f} | {r.late_activity:>9.2f} | {r.cursed:>6.1f}")
    print("-" * len(HEADER))


# ---------------------------------------------------------------------------
# CLI scenarios
# ---------------------------------------------------------------------------
def scenario_sweep():
    sets = []
    for a in (0.5, 0.7, 1.0):
        for d in (1.15, 1.3, 1.5):
            sets.append((f"a={a} d={d}", SimParams(alpha=a, delta=d)))
    print_reports("α × δ sweep (mixed roster, 20 seeds × 30 ticks)",
                  run_sweep(sets))
    print("Targets: healthy upsets (~15-35%), low hegemony, negative net/tick,")
    print("late activity > 0 (the world must not die).")


def scenario_archetypes():
    rosters = {
        "all-turtle": [(f"t{i}", "turtle", 0.4, 1.0) for i in range(4)],
        "all-raider": [(f"r{i}", "raider", 0.7, 1.0) for i in range(4)],
        "all-opportunist": [(f"o{i}", "opportunist", 0.7, 1.0) for i in range(4)],
        "mixed": MIXED_ROSTER,
    }
    reports = [run_set(name, SimParams(), roster)
               for name, roster in rosters.items()]
    print_reports("Archetype matrix (default parameters)", reports)
    print("Degeneracy check: an all-turtle world with late activity ~0 is stagnant;")
    print("that is not a resolver bug but a signal that attacking needs incentives.")


def scenario_decay():
    sets = [(f"decay={dc}", SimParams(garrison_decay=dc))
            for dc in (0.0, 0.03, 0.08)]
    print_reports("Garrison decay — effect on 'cursed tiles' & stalemates",
                  run_sweep(sets))
    print("Decay > 0 erodes untended fortifications -> stalemates break,")
    print("but too much makes defending pointless (watch hegemony & flips).")


def scenario_tune():
    """Second-stage sweep: economy knobs, targeting the hegemony & inflation
    seen in the α×δ sweep."""
    sets = []
    for a, d in ((0.5, 1.15), (0.5, 1.3), (0.7, 1.15)):
        for y in (6.0, 12.0):
            for bg in ((0.5, 0.5), (0.3, 0.3)):
                for dc in (0.0, 0.03):
                    beta, gamma = bg
                    label = (f"a{a} d{d} y{y:.0f} b{beta} g{gamma} dc{dc}")
                    sets.append((label, SimParams(
                        alpha=a, delta=d, yield_per_tile=y,
                        beta=beta, gamma=gamma, garrison_decay=dc)))
    print_reports("Economy tuning (yield × β/γ × decay)", run_sweep(sets))
    print("Looking for: net/tick <= 0, minimal hegemony, flips & activity alive.")


def scenario_regen():
    """Garrison regen is MINTED supply (on-chain: garrisons are escrowed
    Flux), found while porting to Solidity. Re-tune yield x regen with the
    corrected emission accounting."""
    sets = []
    for y in (3.0, 4.0, 6.0):
        for rg in (0.0, 2.0, 4.0):
            sets.append((f"y{y:.0f} regen{rg:.0f}", SimParams(
                alpha=0.5, delta=1.3, yield_per_tile=y,
                beta=0.3, gamma=0.3, garrison_regen=rg)))
    print_reports("Yield × regen (corrected emission accounting)",
                  run_sweep(sets))
    print("Regen mints; looking for net/tick <= 0 with the world still alive.")


# Recommended set rev2: yield 4 + regen 2 after the emission-accounting fix
# (garrison regen mints supply; yield 6 + regen 4 was actually inflationary)
REC_PARAMS = SimParams(alpha=0.5, delta=1.3, yield_per_tile=4.0,
                       beta=0.3, gamma=0.3, garrison_regen=2.0)


def scenario_counter():
    """Hypothesis test: hegemony is high because bots never gang up on the
    leader. Balancer = a raider that targets the leader once it holds >=40%."""
    rosters = {
        "mixed (baseline)": MIXED_ROSTER,
        "2 balancers": [
            ("alice", "balancer", 0.7, 1.0),
            ("bob",   "balancer", 0.6, 1.0),
            ("carol", "opportunist", 0.7, 1.0),
            ("dave",  "raider", 0.8, 1.0),
        ],
        "all-balancer": [(f"b{i}", "balancer", 0.7, 1.0) for i in range(4)],
        "whale vs 3 balancers": [
            ("whale", "raider", 0.7, 10.0),
            ("alice", "balancer", 0.7, 1.0),
            ("bob",   "balancer", 0.6, 1.0),
            ("carol", "balancer", 0.7, 1.0),
        ],
    }
    reports = [run_set(name, REC_PARAMS, roster)
               for name, roster in rosters.items()]
    print_reports("Anti-hegemony — balancers gang up on the leader "
                  f"(recommended set: a={REC_PARAMS.alpha} d={REC_PARAMS.delta} "
                  f"y={REC_PARAMS.yield_per_tile:.0f} b={REC_PARAMS.beta} "
                  f"g={REC_PARAMS.gamma})", reports)
    for rep in reports:
        if any(r.top_player == "whale" for r in rep.runs):
            whale_top = sum(1 for r in rep.runs
                            if r.top_player == "whale") / len(rep.runs)
            print(f"  {rep.label}: whale is top holder in {whale_top:.0%} of runs")


def scenario_whale():
    whale_roster = [
        ("whale", "raider", 0.7, 10.0),
        ("alice", "raider", 0.6, 1.0),
        ("bob",   "opportunist", 0.7, 1.0),
        ("carol", "turtle", 0.4, 1.0),
    ]
    reports = []
    for a in (0.5, 0.7, 1.0):
        rep = run_set(f"whale10x a={a}", SimParams(alpha=a), whale_roster)
        reports.append(rep)
    print_reports("Whale test — one player with 10× capital", reports)
    for rep in reports:
        whale_top = sum(1 for r in rep.runs if r.top_player == "whale") / len(rep.runs)
        print(f"  {rep.label}: whale is top holder in {whale_top:.0%} of runs, "
              f"average top share {rep.top_share:.1%}")
    print("Passes if at low α the whale leads but does NOT lock in hegemony.")


SCENARIOS = {
    "sweep": scenario_sweep,
    "archetypes": scenario_archetypes,
    "decay": scenario_decay,
    "tune": scenario_tune,
    "regen": scenario_regen,
    "counter": scenario_counter,
    "whale": scenario_whale,
}

if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    print("=" * 72)
    print("HOLDFAST — BALANCE LAB (Workstream A)")
    print(f"{DEFAULT_SEEDS} seeds/set × {DEFAULT_TICKS} ticks · 9 tiles · 4 bots")
    print("=" * 72)
    if which == "all":
        for fn in SCENARIOS.values():
            fn()
    elif which in SCENARIOS:
        SCENARIOS[which]()
    else:
        print(f"unknown scenario: {which} (choices: "
              f"{', '.join(SCENARIOS)}, all)")
