"""
Holdfast — Balance lab (Workstream A / Phase 1).

Menjalankan world_sim berkali-kali (N seed per set parameter) dan mengukur:
  - upset rate     : seberapa sering pihak ber-peluang <50% menang
  - Gini holdings  : ketimpangan kepemilikan tile di akhir run
  - arah ekonomi   : net supply per tick (emisi - burn); negatif = deflationary
  - hegemoni       : apakah satu pemain mengunci >=50% tile di akhir run
  - aktivitas      : contest/tick (deteksi ekuilibrium degeneratif, mis. semua-turtle)
  - cursed tiles   : tile yang diserang berkali-kali tapi tak pernah jatuh

Semua run deterministik: seed integer -> rng AI + seed_prefix VRF.

Jalankan: python3 balance_lab.py [sweep|archetypes|decay|whale|all]
Output mesin untuk docs/BALANCE.md.
"""

from __future__ import annotations
import random
import sys
from dataclasses import dataclass, field

from resolver import Tile
from world_sim import SimParams, Player, World, NATURE, run_tick

TILE_IDS = [f"tile_0{i}" for i in range(1, 10)]
HOME_SLOTS = [0, 3, 5, 7]          # posisi tile awal pemain (pola demo Phase 0)
DEFAULT_TICKS = 30
DEFAULT_SEEDS = 20

# Roster baku: campuran arketipe, saldo setara
MIXED_ROSTER = [
    ("ragnar", "raider", 0.8, 1.0),
    ("rurik",  "raider", 0.6, 1.0),
    ("olga",   "opportunist", 0.7, 1.0),
    ("tora",   "turtle", 0.4, 1.0),
]


def build_lab_world(params: SimParams, roster) -> World:
    """Roster: list (nama, arketipe, aggression, kelipatan saldo awal)."""
    assert len(roster) <= len(HOME_SLOTS), "maksimal 4 pemain di peta 9 tile"
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
# Metrik
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
    flips: int = 0                 # tile berpindah tangan
    gini_final: float = 0.0
    net_per_tick: float = 0.0      # (emisi - burn)/tick; negatif = deflationary
    hegemon: bool = False          # >=50% tile dikunci sepanjang 5 tick terakhir
    late_contests_per_tick: float = 0.0   # aktivitas sepertiga akhir run
    cursed_tiles: int = 0          # >=4 serangan gagal, 0 kali jatuh
    top_share: float = 0.0         # porsi tile pemain teratas di akhir
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
    """param_sets: list (label, SimParams). Mengembalikan list SetReport."""
    roster = roster or MIXED_ROSTER
    return [run_set(label, p, roster, n_seeds, n_ticks) for label, p in param_sets]


# ---------------------------------------------------------------------------
# Pelaporan
# ---------------------------------------------------------------------------
HEADER = (f"{'set':<22} | {'upset':>6} | {'gini':>5} | {'net/tick':>8} | "
          f"{'hegemoni':>8} | {'flips':>5} | {'akhir c/t':>9} | {'cursed':>6}")


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
# Skenario CLI
# ---------------------------------------------------------------------------
def scenario_sweep():
    sets = []
    for a in (0.5, 0.7, 1.0):
        for d in (1.15, 1.3, 1.5):
            sets.append((f"a={a} d={d}", SimParams(alpha=a, delta=d)))
    print_reports("Sweep α × δ (roster campuran, 20 seed × 30 tick)",
                  run_sweep(sets))
    print("Target: upset sehat (~15–35%), hegemoni rendah, net/tick negatif,")
    print("aktivitas akhir > 0 (dunia tidak mati).")


def scenario_archetypes():
    rosters = {
        "semua-turtle": [(f"t{i}", "turtle", 0.4, 1.0) for i in range(4)],
        "semua-raider": [(f"r{i}", "raider", 0.7, 1.0) for i in range(4)],
        "semua-opportunist": [(f"o{i}", "opportunist", 0.7, 1.0) for i in range(4)],
        "campuran": MIXED_ROSTER,
    }
    reports = [run_set(name, SimParams(), roster)
               for name, roster in rosters.items()]
    print_reports("Matriks arketipe (parameter default)", reports)
    print("Cek degenerasi: dunia semua-turtle dengan aktivitas-akhir ~0 = stagnan;")
    print("itu bukan bug resolver tapi sinyal perlunya insentif menyerang.")


def scenario_decay():
    sets = [(f"decay={dc}", SimParams(garrison_decay=dc))
            for dc in (0.0, 0.03, 0.08)]
    print_reports("Garrison decay — efek pada 'cursed tile' & stalemate",
                  run_sweep(sets))
    print("Decay > 0 mengikis benteng yang tidak dirawat -> stalemate pecah,")
    print("tapi terlalu besar membuat bertahan sia-sia (cek hegemoni & flips).")


def scenario_tune():
    """Sweep tahap dua: knob ekonomi, menarget hegemoni & inflasi dari sweep α×δ."""
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
    print_reports("Tuning ekonomi (yield × β/γ × decay)", run_sweep(sets))
    print("Cari: net/tick <= 0, hegemoni minimal, flips & aktivitas tetap hidup.")


REC_PARAMS = SimParams(alpha=0.5, delta=1.3, yield_per_tile=6.0,
                       beta=0.3, gamma=0.3)


def scenario_counter():
    """Uji hipotesis: hegemoni tinggi karena bot tak mengeroyok pemimpin.
    Balancer = raider yang menargetkan pemuncak begitu ia >=40% tile."""
    rosters = {
        "campuran (baseline)": MIXED_ROSTER,
        "2 balancer": [
            ("bjorn", "balancer", 0.7, 1.0),
            ("brida", "balancer", 0.6, 1.0),
            ("olga",  "opportunist", 0.7, 1.0),
            ("ragnar", "raider", 0.8, 1.0),
        ],
        "semua-balancer": [(f"b{i}", "balancer", 0.7, 1.0) for i in range(4)],
        "whale vs 3 balancer": [
            ("whale", "raider", 0.7, 10.0),
            ("bjorn", "balancer", 0.7, 1.0),
            ("brida", "balancer", 0.6, 1.0),
            ("bodil", "balancer", 0.7, 1.0),
        ],
    }
    reports = [run_set(name, REC_PARAMS, roster)
               for name, roster in rosters.items()]
    print_reports("Anti-hegemoni — balancer mengeroyok pemuncak "
                  f"(set rekomendasi: a={REC_PARAMS.alpha} d={REC_PARAMS.delta} "
                  f"y={REC_PARAMS.yield_per_tile:.0f} b={REC_PARAMS.beta} "
                  f"g={REC_PARAMS.gamma})", reports)
    for rep in reports:
        if any(r.top_player == "whale" for r in rep.runs):
            whale_top = sum(1 for r in rep.runs
                            if r.top_player == "whale") / len(rep.runs)
            print(f"  {rep.label}: whale pemilik terbanyak di {whale_top:.0%} run")


def scenario_whale():
    whale_roster = [
        ("whale", "raider", 0.7, 10.0),
        ("rurik", "raider", 0.6, 1.0),
        ("olga",  "opportunist", 0.7, 1.0),
        ("tora",  "turtle", 0.4, 1.0),
    ]
    reports = []
    for a in (0.5, 0.7, 1.0):
        rep = run_set(f"whale10x a={a}", SimParams(alpha=a), whale_roster)
        reports.append(rep)
    print_reports("Whale test — satu pemain modal 10×", reports)
    for rep in reports:
        whale_top = sum(1 for r in rep.runs if r.top_player == "whale") / len(rep.runs)
        print(f"  {rep.label}: whale jadi pemilik terbanyak di {whale_top:.0%} run, "
              f"rata-rata porsi pemuncak {rep.top_share:.1%}")
    print("Lulus jika di α rendah whale unggul tapi TIDAK mengunci hegemoni.")


SCENARIOS = {
    "sweep": scenario_sweep,
    "archetypes": scenario_archetypes,
    "decay": scenario_decay,
    "tune": scenario_tune,
    "counter": scenario_counter,
    "whale": scenario_whale,
}

if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    print("=" * 72)
    print("HOLDFAST — BALANCE LAB (Workstream A)")
    print(f"{DEFAULT_SEEDS} seed/set × {DEFAULT_TICKS} tick · 9 tile · 4 bot")
    print("=" * 72)
    if which == "all":
        for fn in SCENARIOS.values():
            fn()
    elif which in SCENARIOS:
        SCENARIOS[which]()
    else:
        print(f"skenario tak dikenal: {which} (pilihan: "
              f"{', '.join(SCENARIOS)}, all)")
