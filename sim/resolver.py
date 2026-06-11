"""
Living World — Resolver prototype (pure functions).

Tujuan: memvalidasi jantung ekonomi & "rasa adil/seru" game SEBELUM
menyentuh Solidity atau Hermes. Semuanya deterministik & reproducible:
input yang sama -> output yang sama. Tidak ada I/O, tidak ada state global.

Jalankan: python3 resolver.py
"""

from __future__ import annotations
import hashlib
from dataclasses import dataclass, replace

# ---------------------------------------------------------------------------
# Parameter ekonomi (knob tuning)
# ---------------------------------------------------------------------------
ALPHA = 0.5             # eksponen diminishing returns (jantung tuning)
DEFENDER_ADVANTAGE = 1.3  # delta: merebut lebih mahal dari mempertahankan
SPOILS_RATIO = 0.5      # gamma: porsi garrison ke attacker saat menang
DEFEND_REWARD = 0.5     # beta: porsi committed ke defender saat attacker kalah


# ---------------------------------------------------------------------------
# VRF tersimulasi — deterministik dari (seed, contest_id), reproducible.
# Di produksi ini diganti VRF on-chain. Di prototipe cukup hash.
# ---------------------------------------------------------------------------
def vrf(seed: str, contest_id: str) -> float:
    h = hashlib.sha256(f"{seed}:{contest_id}".encode()).hexdigest()
    return int(h, 16) / float(1 << 256)  # -> [0, 1)


# ---------------------------------------------------------------------------
# Matematika contest (fungsi murni)
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
    garrison: float          # Flux yang menjaga tile
    modifier: float = 1.0    # terrain dll (Bucket 2)


@dataclass(frozen=True)
class Intent:
    player: str
    target: str              # tile_id
    committed: float         # Flux di-commit attacker
    modifier: float = 1.0    # reputasi/aliansi (Bucket 2)


@dataclass(frozen=True)
class ContestResult:
    contest_id: str
    target: str
    attacker: str
    defender: str
    p: float                 # peluang attacker menang (teoretis)
    roll: float              # hasil VRF
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
    """Selesaikan satu contest secara deterministik. Fungsi murni."""
    contest_id = f"{intent.player}->{intent.target}"
    p_a = power(intent.committed, intent.modifier, alpha)
    p_d = power(tile.garrison, tile.modifier, alpha, delta)
    p = win_probability(p_a, p_d)
    roll = vrf(seed, contest_id)
    won = roll < p

    if won:
        # Attacker rebut tile. Spoils dari garrison; sisa garrison dibakar.
        spoils = gamma * tile.garrison
        burned = tile.garrison - spoils
        return ContestResult(
            contest_id, intent.target, intent.player, tile.owner,
            p, roll, True,
            flux_to_attacker=spoils, flux_to_defender=0.0, flux_burned=burned,
            new_owner=intent.player, new_garrison=intent.committed,
        )
    else:
        # Attacker kalah. Sebagian committed ke defender, sisa dibakar.
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
    Selesaikan semua intent satu tick.
    Aturan tabrakan: jika >1 attacker menyerang tile sama, urutkan by committed
    desc lalu resolusi berurutan (state tile berubah seiring resolusi).
    Mengembalikan hasil + akunting sink/flow. Fungsi murni atas (intents,tiles,seed).
    """
    tiles = dict(tiles)  # salin lokal; jangan mutasi input
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
                continue  # tidak menyerang diri sendiri
            res = resolve_contest(it, tile, seed, alpha, delta, gamma, beta)
            results.append(res)
            total_burned += res.flux_burned
            total_to_players += res.flux_to_attacker + res.flux_to_defender
            tiles[target] = replace(
                tile, owner=res.new_owner, garrison=res.new_garrison
            )

    return TickResult(tuple(results), total_burned, total_to_players)


# ===========================================================================
# SKENARIO UJI — di sinilah kita "merasakan" apakah math-nya benar
# ===========================================================================
def line(c="-"):
    print(c * 64)


def scenario_even_fight():
    print("\n### 1. Even fight (100 vs 100, modifier sama)")
    line()
    p_a = power(100, 1.0, ALPHA)
    p_d = power(100, 1.0, ALPHA, DEFENDER_ADVANTAGE)
    p = win_probability(p_a, p_d)
    print(f"P_a={p_a:.2f}  P_d={p_d:.2f}  ->  peluang attacker menang = {p:.1%}")
    print("Harapan: sedikit di bawah 50% karena defender advantage. ✓"
          if p < 0.5 else "ANOMALI")


def scenario_win_curve():
    print("\n### 2. Kurva peluang menang vs rasio Flux (garrison=100)")
    line()
    print(f"{'commit':>8} | {'rasio':>6} | {'p_menang':>9}")
    line()
    for f in [25, 50, 100, 200, 400, 676, 1000, 2000]:
        p_a = power(f, 1.0, ALPHA)
        p_d = power(100, 1.0, ALPHA, DEFENDER_ADVANTAGE)
        p = win_probability(p_a, p_d)
        print(f"{f:>8} | {f/100:>5.1f}x | {p:>8.1%}")
    print("\nCatatan: ~676 Flux (≈7x) untuk ~67% (2:1). Dominasi mahal -> upset hidup.")


def scenario_whale_split():
    print("\n### 3. Whale split: 1 serangan besar vs banyak serangan kecil")
    line()
    big = power(400, 1.0, ALPHA)
    small_total = 4 * power(100, 1.0, ALPHA)
    print(f"alpha={ALPHA}")
    print(f"  1x 400 Flux -> total power = {big:.2f}")
    print(f"  4x 100 Flux -> total power = {small_total:.2f}")
    print("  Karena alpha<1, memecah memberi total power LEBIH BESAR.")
    print("  => whale menekan KELUASAN (banyak tile), bukan KEDALAMAN.")
    print("  Ini trade-off desain yang DISENGAJA, bukan bug.")


def scenario_reproducibility():
    print("\n### 4. Reproducibility (syarat trustless)")
    line()
    tile = Tile("tile_07", owner="south_faction", garrison=120.0)
    it = Intent(player="anggara", target="tile_07", committed=180.0)
    r1 = resolve_contest(it, tile, seed="tick42_vrf_0xabc")
    r2 = resolve_contest(it, tile, seed="tick42_vrf_0xabc")
    assert r1 == r2, "RESOLVER TIDAK DETERMINISTIK — fatal"
    print(f"roll={r1.roll:.6f}  p={r1.p:.1%}  menang={r1.attacker_won}")
    print("Dua run identik dari input sama. ✓ (siapa pun bisa verifikasi ulang)")


def scenario_montecarlo():
    print("\n### 5. Monte Carlo: apakah win-rate empiris == p teoretis?")
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
    print(f"teoretis p={p_theory:.3f}  |  empiris={emp:.3f}  |  N={N}")
    print("Cocok dalam noise. ✓ VRF tidak bias."
          if abs(emp - p_theory) < 0.02 else "ANOMALI bias VRF")


def scenario_full_tick():
    print("\n### 6. Satu tick penuh — 4 pemain, 9 tile, akunting sink")
    line()
    tiles = {
        f"tile_0{i}": Tile(f"tile_0{i}", owner=("nature" if i > 3 else f"p{i}"),
                           garrison=100.0)
        for i in range(1, 10)
    }
    intents = [
        Intent("anggara", "tile_05", committed=300.0),   # serang netral kuat
        Intent("budi",    "tile_05", committed=150.0),   # tabrakan! tile sama
        Intent("citra",   "tile_01", committed=180.0, modifier=1.2),  # +reputasi
        Intent("dewi",    "tile_06", committed=80.0),    # serangan lemah
    ]
    tick = resolve_tick(intents, tiles, seed="tick_2026_06_11")
    for r in tick.results:
        tag = "MENANG" if r.attacker_won else "kalah"
        print(f"  {r.attacker:>8} -> {r.target} | p={r.p:>5.1%} roll={r.roll:.3f}"
              f" | {tag:>6} | burn={r.flux_burned:>6.1f}")
    line()
    print(f"  Total Flux dibakar tick ini : {tick.total_burned:>8.1f}  (SINK)")
    print(f"  Total Flux ke pemain        : {tick.total_to_players:>8.1f}")
    print("  Settlement ini = 1 transaksi Base (Merkle root), bukan 4.")


def scenario_sink_vs_emission():
    print("\n### 7. Sink vs emission — cek kesehatan ekonomi (10 tick)")
    line()
    # asumsi sederhana: tiap tile menghasilkan 'yield' Flux/tick (emisi),
    # dan rata-rata aktivitas contest membakar sebagian (sink).
    n_tiles = 9
    yield_per_tile = 10.0          # emisi/tile/tick
    contests_per_tick = 4
    avg_committed = 180.0
    # rata-rata burn per contest: campuran menang(~50% garrison) & kalah(~50% commit)
    avg_burn_per_contest = 0.5 * avg_committed
    emission = n_tiles * yield_per_tile
    sink = contests_per_tick * avg_burn_per_contest
    print(f"  Emisi / tick  (yield {n_tiles} tile)   : {emission:>7.1f} Flux")
    print(f"  Sink  / tick  (burn {contests_per_tick} contest) : {sink:>7.1f} Flux")
    net = emission - sink
    verdict = ("DEFLATIONARY ✓ (sink>emisi, sehat)" if net < 0
               else "INFLATIONARY ⚠ (emisi>sink — ponzi pelan)")
    print(f"  Net supply / tick               : {net:>+7.1f} Flux  -> {verdict}")
    print("\n  => Pada parameter ini ekonomi deflationary saat dunia aktif.")
    print("     Jika aktivitas turun, emisi menang -> butuh sink lain (compute fee).")


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
    print("Semua skenario selesai. Resolver deterministik & reproducible.")
    print("=" * 64)
