"""
Living World — Simulasi multi-tick.

Membangun di atas resolver.py (yang sudah teruji). Tujuannya BUKAN matematika
contest lagi — itu sudah terbukti. Tujuannya: apakah DUNIA terasa hidup ketika
beberapa tick berjalan berturut, dengan:
  - resource generation (tile menghasilkan Flux/tick -> emisi)
  - tick offline (faksi AI bergerak tanpa pemain)
  - saldo pemain yang naik-turun (afford check: tak bisa commit > saldo)
  - peristiwa dunia yang muncul dari state, bukan dari narasi

Yang DISIMULASIKAN di sini hanyalah Bucket 1 + Bucket 2 (state mekanik).
GM/Hermes (narasi, Bucket 3) sengaja TIDAK ada — kita uji apakah kerangka
mekaniknya menarik bahkan tanpa cerita. Kalau membosankan tanpa narasi,
narasi cuma menambal; kalau sudah menarik, narasi melipatgandakan.

Jalankan: python3 world_sim.py
"""

from __future__ import annotations
import random
from dataclasses import dataclass, field, replace
from resolver import (
    Tile, Intent, resolve_tick, power, win_probability,
    ALPHA, DEFENDER_ADVANTAGE,
)

# ---------------------------------------------------------------------------
# Parameter dunia
# ---------------------------------------------------------------------------
YIELD_PER_TILE = 12.0     # Flux yang dihasilkan tile untuk pemiliknya tiap tick
GARRISON_REGEN = 4.0      # garrison tumbuh sedikit tiap tick (sampai cap)
GARRISON_CAP = 200.0
STARTING_BALANCE = 250.0
NATURE = "nature"         # tile netral, dijaga faksi AI


@dataclass
class Player:
    name: str
    balance: float
    is_ai: bool = False
    # "kepribadian" sederhana untuk faksi AI / bot pemain
    aggression: float = 0.5   # 0..1, seberapa besar porsi saldo dipakai menyerang


@dataclass
class World:
    tick: int
    tiles: dict
    players: dict
    total_burned: float = 0.0
    log: list = field(default_factory=list)

    def owned_by(self, name):
        return [t for t in self.tiles.values() if t.owner == name]


# ---------------------------------------------------------------------------
# Fase 1: resource generation (emisi) — pemilik tile dapat yield
# ---------------------------------------------------------------------------
def phase_generate(world: World):
    for t in world.tiles.values():
        if t.owner != NATURE and t.owner in world.players:
            world.players[t.owner].balance += YIELD_PER_TILE
        # garrison regen menuju cap
        new_g = min(GARRISON_CAP, t.garrison + GARRISON_REGEN)
        world.tiles[t.tile_id] = replace(t, garrison=new_g)


# ---------------------------------------------------------------------------
# Fase 2: keputusan AI (faksi + bot pemain) — dunia bergerak saat offline
# AI menyerang tetangga terlemah yang bukan miliknya, sesuai aggression & saldo.
# ---------------------------------------------------------------------------
def ai_decide(world: World, rng: random.Random):
    intents = []
    for p in world.players.values():
        if not p.is_ai:
            continue
        budget = p.balance * p.aggression
        if budget < 20:
            continue
        # pilih target: tile termurah-untuk-direbut yang bukan milik sendiri
        candidates = [t for t in world.tiles.values() if t.owner != p.name]
        if not candidates:
            continue
        # heuristik: target dengan garrison terendah, sedikit acak
        candidates.sort(key=lambda t: t.garrison + rng.uniform(0, 20))
        target = candidates[0]
        commit = min(budget, p.balance)
        if commit >= 20:
            intents.append(Intent(p.name, target.tile_id, committed=round(commit, 1)))
            p.balance -= commit  # Flux dikunci saat commit
    return intents


# ---------------------------------------------------------------------------
# Fase 3: terapkan intent pemain manusia (di sini di-scripted untuk demo)
# Afford check: tak bisa commit melebihi saldo.
# ---------------------------------------------------------------------------
def apply_human_intents(world: World, human_intents):
    valid = []
    for it in human_intents:
        p = world.players.get(it.player)
        if p is None:
            continue
        if it.committed > p.balance:
            world.log.append(f"  [!] {it.player} coba commit {it.committed} "
                             f"tapi saldo cuma {p.balance:.0f} — ditolak")
            continue
        p.balance -= it.committed
        valid.append(it)
    return valid


# ---------------------------------------------------------------------------
# Fase 4: resolusi (pakai resolver teruji) + distribusi hasil ke saldo
# ---------------------------------------------------------------------------
def phase_resolve(world: World, intents, seed: str):
    res = resolve_tick(intents, world.tiles, seed)
    # terapkan perubahan tile + bagikan flux ke saldo pemain
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
# Peristiwa dunia yang EMERGENT dari state (bukan dari narasi GM)
# ---------------------------------------------------------------------------
def detect_events(world: World, prev_owners: dict):
    events = []
    # 1. tile berpindah tangan
    for tid, t in world.tiles.items():
        if prev_owners.get(tid) != t.owner:
            events.append(f"⚔  {tid} direbut {t.owner} dari {prev_owners.get(tid)}")
    # 2. dominasi: ada pemain menguasai >=50% tile non-nature
    non_nature = [t for t in world.tiles.values() if t.owner != NATURE]
    if non_nature:
        from collections import Counter
        c = Counter(t.owner for t in non_nature)
        top, n = c.most_common(1)[0]
        if n / len(world.tiles) >= 0.5:
            events.append(f"👑 {top} menguasai {n}/{len(world.tiles)} tile — hegemoni!")
    # 3. kebangkrutan
    for p in world.players.values():
        if p.balance < 20 and not p.is_ai:
            events.append(f"💸 {p.name} hampir bangkrut (saldo {p.balance:.0f})")
    return events


# ---------------------------------------------------------------------------
# Loop dunia
# ---------------------------------------------------------------------------
def run_tick(world: World, human_intents, rng: random.Random):
    prev_owners = {tid: t.owner for tid, t in world.tiles.items()}
    world.tick += 1
    seed = f"tick_{world.tick}_seed"

    phase_generate(world)
    ai_intents = ai_decide(world, rng)
    human_valid = apply_human_intents(world, human_intents)
    all_intents = human_valid + ai_intents
    res = phase_resolve(world, all_intents, seed)
    events = detect_events(world, prev_owners)
    return res, events, len(human_valid), len(ai_intents)


def snapshot(world: World):
    print(f"\n  Saldo: " + "  ".join(
        f"{p.name}={p.balance:.0f}{'*' if p.is_ai else ''}"
        for p in world.players.values()))
    holdings = {}
    for t in world.tiles.values():
        holdings[t.owner] = holdings.get(t.owner, 0) + 1
    print(f"  Tile : " + "  ".join(f"{k}={v}" for k, v in sorted(holdings.items())))


def build_world():
    players = {
        "anggara": Player("anggara", STARTING_BALANCE),
        "budi":    Player("budi", STARTING_BALANCE),
        "south":   Player("south", STARTING_BALANCE, is_ai=True, aggression=0.6),
        "raiders": Player("raiders", STARTING_BALANCE, is_ai=True, aggression=0.8),
    }
    tiles = {}
    layout = [
        ("tile_01", "anggara"), ("tile_02", "anggara"), ("tile_03", NATURE),
        ("tile_04", "budi"),    ("tile_05", NATURE),    ("tile_06", "south"),
        ("tile_07", NATURE),    ("tile_08", "raiders"), ("tile_09", NATURE),
    ]
    for tid, owner in layout:
        g = 100.0 if owner != NATURE else 60.0  # netral lebih lemah, mengundang ekspansi
        tiles[tid] = Tile(tid, owner=owner, garrison=g)
    return World(tick=0, tiles=tiles, players=players)


if __name__ == "__main__":
    rng = random.Random(7)  # deterministik untuk reproduksibilitas demo
    world = build_world()

    print("=" * 64)
    print("LIVING WORLD — SIMULASI 6 TICK")
    print(f"(* = faksi AI · yield {YIELD_PER_TILE}/tile · alpha={ALPHA})")
    print("=" * 64)
    print("\nTICK 0 (kondisi awal):")
    snapshot(world)

    # Skenario pemain manusia per tick (intent yang di-scripted untuk demo).
    # Di game nyata ini datang dari NL pemain via Hermes.
    human_plan = {
        1: [Intent("anggara", "tile_03", committed=120)],   # ambil netral
        2: [Intent("anggara", "tile_05", committed=160)],   # ekspansi
        3: [Intent("budi", "tile_06", committed=200)],      # budi serang south (AI)
        4: [Intent("anggara", "tile_06", committed=140)],   # rebutan tile_06
        5: [Intent("budi", "tile_05", committed=180)],      # budi tantang anggara
        6: [Intent("anggara", "tile_08", committed=220)],   # serbu markas raiders
    }

    for tick_no in range(1, 7):
        plan = human_plan.get(tick_no, [])
        res, events, n_human, n_ai = run_tick(world, plan, rng)
        print(f"\n{'─'*64}\nTICK {world.tick}  "
              f"({n_human} aksi manusia, {n_ai} aksi AI):")
        for r in res.results:
            tag = "MENANG" if r.attacker_won else "kalah "
            ai = "*" if world.players[r.attacker].is_ai else " "
            print(f"  {r.attacker:>8}{ai}-> {r.target} | p={r.p:>5.1%} "
                  f"roll={r.roll:.3f} | {tag} | burn={r.flux_burned:>5.1f}")
        if events:
            print("  Peristiwa:")
            for e in events:
                print(f"    {e}")
        for l in world.log:
            print(l)
        world.log.clear()
        snapshot(world)

    print(f"\n{'='*64}")
    print(f"Total Flux dibakar selama 6 tick: {world.total_burned:.1f}")
    # ringkasan emisi vs sink
    total_yield_est = sum(
        1 for t in world.tiles.values() if t.owner != NATURE) * YIELD_PER_TILE * 6
    print(f"Estimasi emisi kasar (yield)    : ~{total_yield_est:.0f}")
    verdict = "deflationary (sehat)" if world.total_burned > total_yield_est \
        else "inflationary (perlu sink tambahan)"
    print(f"Arah ekonomi selama run ini      : {verdict}")
    print("=" * 64)
    print("\nPertanyaan untuk DIRASAKAN, bukan dihitung:")
    print("  - Apakah peta berpindah tangan dengan cara yang bikin penasaran?")
    print("  - Apakah faksi AID terasa 'punya niat', atau cuma random?")
    print("  - Apakah ada momen 'oh, semalam duniaku berubah'?")
    print("  Kalau YA tanpa narasi — narasi GM nanti akan melipatgandakannya.")
