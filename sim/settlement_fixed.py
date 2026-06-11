"""
Holdfast — Settlement-level fixed-point mirror (the HoldfastSettlement spec).

Extends the contest-math spec (resolver_fixed.py) to the FULL tick semantics
of contracts/src/HoldfastSettlement.sol:

  - emission phase first: yield to tile owners + garrison regen toward the
    cap, both minted supply
  - then contests, in the normative batch order (ascending tileId,
    descending committed within a tile), resolved sequentially so a tile's
    state changes mid-tick exactly like on-chain
  - per-contest randomness: keccak256(randomWord ‖ regionId ‖ tick ‖ tileId
    ‖ attacker) with the contract's abi.encodePacked layout
    (uint256, uint256, uint64, uint64, address — big-endian, packed)
  - escrow/afford semantics, wilds (owner 0) defend rewards burn,
    monotonic ticks

All integers; any divergence from the contract is a parity bug by
definition. Addresses are modeled as ints (0 = the wilds).

Run: python3 settlement_fixed.py   (self-checks)
"""

from __future__ import annotations
from dataclasses import dataclass, field

from keccak_tiny import keccak256
from resolver_fixed import WAD, resolve_contest_fixed

NATURE = 0  # address(0)


@dataclass(frozen=True)
class RegionParams:
    delta: int
    gamma: int
    beta: int
    yield_per_tile: int
    garrison_regen: int
    garrison_cap: int
    min_commit: int


# BALANCE.md rev2 recommended set, WAD-scaled
REC_PARAMS = RegionParams(
    delta=13 * 10**17, gamma=3 * 10**17, beta=3 * 10**17,
    yield_per_tile=4 * WAD, garrison_regen=2 * WAD,
    garrison_cap=200 * WAD, min_commit=20 * WAD,
)


@dataclass
class TileState:
    owner: int      # address as int; 0 = wilds
    garrison: int   # escrowed Flux
    mod_wad: int    # terrain modifier (Bucket 2)


@dataclass
class Contest:
    tile_id: int
    attacker: int   # address as int, never 0
    committed: int
    attacker_mod: int = WAD


@dataclass
class Settlement:
    region_id: int
    params: RegionParams
    tiles: list            # list[TileState]
    escrow: dict = field(default_factory=dict)   # address int -> amount
    last_tick: int = 0
    total_supply: int = 0   # tracks FluxToken.totalSupply

    @classmethod
    def genesis(cls, region_id: int, params: RegionParams, layout):
        """layout: list of (owner, garrison, mod_wad). Genesis garrisons are
        minted (they are real escrowed tokens the moment they exist)."""
        s = cls(region_id, params, [TileState(o, g, m) for o, g, m in layout])
        s.total_supply += sum(t.garrison for t in s.tiles)
        return s

    def enroll(self, players, starting_escrow: int):
        for p in players:
            assert p != NATURE
            self.escrow[p] = self.escrow.get(p, 0) + starting_escrow
        self.total_supply += len(players) * starting_escrow

    # ------------------------------------------------------------------
    def _contest_word(self, tick: int, tile_id: int, attacker: int) -> int:
        # abi.encodePacked(uint256, uint256, uint64, uint64, address)
        packed = (self._random_word.to_bytes(32, "big")
                  + self.region_id.to_bytes(32, "big")
                  + tick.to_bytes(8, "big")
                  + tile_id.to_bytes(8, "big")
                  + attacker.to_bytes(20, "big"))
        return int.from_bytes(keccak256(packed), "big")

    def settle_tick(self, tick: int, random_word: int, contests):
        """Mirror of HoldfastSettlement.settleTick. Returns (minted, burned)."""
        assert tick == self.last_tick + 1, "WrongTick"
        self.last_tick = tick
        self._random_word = random_word
        p = self.params

        # phase 1: emission (yield + regen, minted)
        minted = 0
        for tile in self.tiles:
            if tile.owner != NATURE:
                self.escrow[tile.owner] = (
                    self.escrow.get(tile.owner, 0) + p.yield_per_tile)
                minted += p.yield_per_tile
            g = tile.garrison
            if g < p.garrison_cap and p.garrison_regen > 0:
                new_g = min(p.garrison_cap, g + p.garrison_regen)
                minted += new_g - g
                tile.garrison = new_g

        # phase 2: contests (normative order enforced)
        burned = 0
        for i, c in enumerate(contests):
            assert 0 <= c.tile_id < len(self.tiles), "BadTileId"
            if i > 0:
                prev = contests[i - 1]
                assert (c.tile_id > prev.tile_id
                        or (c.tile_id == prev.tile_id
                            and c.committed <= prev.committed)), "BatchNotSorted"
            assert c.committed >= p.min_commit, "CommitTooSmall"

            tile = self.tiles[c.tile_id]
            defender = tile.owner
            assert c.attacker != defender, "SelfAttack"
            assert self.escrow.get(c.attacker, 0) >= c.committed, "Insufficient"
            self.escrow[c.attacker] -= c.committed

            word = self._contest_word(tick, c.tile_id, c.attacker)
            o = resolve_contest_fixed(
                c.committed, c.attacker_mod, tile.garrison, tile.mod_wad,
                p.delta, p.gamma, p.beta, word)

            if o.attacker_won:
                self.escrow[c.attacker] += o.to_attacker
                tile.owner = c.attacker
                tile.garrison = o.new_garrison
            elif defender != NATURE:
                self.escrow[defender] = (
                    self.escrow.get(defender, 0) + o.to_defender)
            else:
                burned += o.to_defender  # the wilds collect nothing
            burned += o.burned

        self.total_supply += minted - burned
        return minted, burned

    # ------------------------------------------------------------------
    def assert_solvent(self):
        """flux.balanceOf(settlement) == Σ escrow + Σ garrisons; here the
        contract's token balance is total_supply minus nothing (all minted
        supply in this model lives in the contract)."""
        held = sum(self.escrow.values()) + sum(t.garrison for t in self.tiles)
        assert held == self.total_supply, "insolvent mirror"


# ===========================================================================
# self-checks
# ===========================================================================
def _demo_layout(alice: int, bob: int):
    layout = []
    for i in range(9):
        if i == 0:
            layout.append((alice, 100 * WAD, WAD))
        elif i == 3:
            layout.append((bob, 100 * WAD, WAD))
        else:
            layout.append((NATURE, 60 * WAD, WAD))
    return layout


if __name__ == "__main__":
    ALICE, BOB = 0xA11CE, 0xB0B
    s = Settlement.genesis(0, REC_PARAMS, _demo_layout(ALICE, BOB))
    s.enroll([ALICE, BOB], 250 * WAD)
    s.assert_solvent()

    # tick ordering enforced
    try:
        s.settle_tick(2, 1, [])
        raise SystemExit("monotonic-tick check failed")
    except AssertionError:
        pass

    minted, burned = s.settle_tick(1, 1, [])
    assert minted == (2 * 4 + 9 * 2) * WAD and burned == 0
    assert s.escrow[ALICE] == 254 * WAD
    assert s.tiles[5].garrison == 62 * WAD
    s.assert_solvent()

    # forced win: search a word with roll < p (like the Solidity test helper)
    def roll(word):
        s._random_word = word
        return s._contest_word(2, 5, ALICE) % WAD
    w = 0
    while roll(w) >= WAD // 4:
        w += 1
    minted, burned = s.settle_tick(
        2, w, [Contest(tile_id=5, attacker=ALICE, committed=120 * WAD)])
    assert s.tiles[5].owner == ALICE
    assert s.tiles[5].garrison == 120 * WAD
    s.assert_solvent()

    print("settlement mirror self-checks passed "
          f"(supply={s.total_supply // WAD} Flux, "
          f"alice={s.escrow[ALICE] // WAD}, bob={s.escrow[BOB] // WAD})")
