"""
Holdfast — Fixed-point resolver mirror (the Solidity spec).

resolver.py is the float reference that validated the game design. This file
restates the SAME math in pure-integer WAD (1e18) arithmetic, in the exact
operation order the Solidity library must use. Bit-identical parity is only
achievable integer-vs-integer, so:

    resolver.py (float)  — design reference, tolerance-checked against this
    resolver_fixed.py    — THE SPEC: every intermediate is an integer
    ResolverLib.sol      — must reproduce this file exactly (parity gate)

Precision decision (documented trade-off):
  - alpha is FIXED at 0.5 in v1. x^0.5 = isqrt(x*WAD), exact floor sqrt.
    A general fractional pow (e.g. 0.7) would need exp/ln fixed-point with
    error bounds and a much larger audit surface. BALANCE.md recommends 0.5
    anyway; revisit only if a future balance pass demands another alpha.
  - mulWad(a, b) = a*b // WAD (floor). Operation order is part of the spec:
    power = mulWad(mulWad(powHalf(flux), modifier), advantage).
  - win check: roll = randomWord % WAD;  attacker wins iff roll < pWad.
    randomWord is an opaque uint256 supplied by the VRF layer — the resolver
    itself never hashes, so parity is independent of hash implementations.

Run: python3 resolver_fixed.py   (validates against the float resolver)
"""

from __future__ import annotations
import math
import random
from dataclasses import dataclass

import resolver as float_ref

WAD = 10**18

# Phase-0 spec defaults (resolver.py constants), WAD-scaled
DELTA_WAD = 13 * 10**17   # 1.3
GAMMA_WAD = 5 * 10**17    # 0.5
BETA_WAD = 5 * 10**17     # 0.5
# Phase-1 recommended set (docs/BALANCE.md) uses gamma = beta = 0.3
GAMMA_REC = 3 * 10**17
BETA_REC = 3 * 10**17


def mul_wad(a: int, b: int) -> int:
    return a * b // WAD


def pow_half(x_wad: int) -> int:
    """x^0.5 in WAD: isqrt(x*WAD). Exact floor; matches Solidity sqrt."""
    return math.isqrt(x_wad * WAD)


def power(flux_wad: int, mod_wad: int, adv_wad: int = WAD) -> int:
    return mul_wad(mul_wad(pow_half(flux_wad), mod_wad), adv_wad)


def win_probability_wad(p_a: int, p_d: int) -> int:
    s = p_a + p_d
    if s == 0:
        return 0
    return p_a * WAD // s


@dataclass(frozen=True)
class FixedOutcome:
    p_wad: int
    roll: int
    attacker_won: bool
    to_attacker: int
    to_defender: int
    burned: int
    new_garrison: int


def resolve_contest_fixed(committed: int, attacker_mod: int,
                          garrison: int, defender_mod: int,
                          delta: int, gamma: int, beta: int,
                          random_word: int) -> FixedOutcome:
    """Single contest, all-integer. Mirrors ResolverLib.resolveContest."""
    p_a = power(committed, attacker_mod, WAD)
    p_d = power(garrison, defender_mod, delta)
    p_wad = win_probability_wad(p_a, p_d)
    roll = random_word % WAD
    won = roll < p_wad
    if won:
        to_attacker = mul_wad(gamma, garrison)
        burned = garrison - to_attacker
        return FixedOutcome(p_wad, roll, True, to_attacker, 0, burned, committed)
    to_defender = mul_wad(beta, committed)
    burned = committed - to_defender
    return FixedOutcome(p_wad, roll, False, 0, to_defender, burned, garrison)


# ===========================================================================
# Validation against the float reference
# ===========================================================================
def _check_probability_agreement(n: int = 2000) -> float:
    rng = random.Random(2026)
    worst = 0.0
    for _ in range(n):
        f = rng.uniform(0.01, 5_000_000.0)     # committed, tokens
        g = rng.uniform(0.01, 5_000_000.0)     # garrison, tokens
        am = rng.uniform(0.5, 2.0)             # attacker modifier
        dm = rng.uniform(0.5, 2.0)             # defender modifier
        p_float = float_ref.win_probability(
            float_ref.power(f, am, 0.5),
            float_ref.power(g, dm, 0.5, 1.3))
        p_fixed = win_probability_wad(
            power(int(f * WAD), int(am * WAD), WAD),
            power(int(g * WAD), int(dm * WAD), DELTA_WAD)) / WAD
        worst = max(worst, abs(p_float - p_fixed))
    return worst


def _check_conservation(n: int = 2000):
    rng = random.Random(7)
    for _ in range(n):
        committed = rng.randrange(1, 10**25)
        garrison = rng.randrange(0, 10**25)
        word = rng.getrandbits(256)
        o = resolve_contest_fixed(committed, WAD, garrison, WAD,
                                  DELTA_WAD, GAMMA_REC, BETA_REC, word)
        if o.attacker_won:
            assert o.to_attacker + o.burned == garrison, "win conservation"
            assert o.new_garrison == committed
        else:
            assert o.to_defender + o.burned == committed, "loss conservation"
            assert o.new_garrison == garrison
        assert 0 <= o.p_wad <= WAD


def _check_sqrt_floor(n: int = 2000):
    rng = random.Random(11)
    for _ in range(n):
        x = rng.randrange(0, 10**30)
        r = pow_half(x)
        assert r * r <= x * WAD < (r + 1) * (r + 1), "sqrt floor property"


if __name__ == "__main__":
    print("=" * 64)
    print("FIXED-POINT RESOLVER — validation vs float reference")
    print("=" * 64)

    worst = _check_probability_agreement()
    print(f"max |p_float - p_fixed| over 2000 random contests: {worst:.3e}")
    assert worst < 1e-9, "fixed-point drifted from the float reference"
    print("  within 1e-9 of the design reference ✓")

    _check_conservation()
    print("conservation: spoils+burn==garrison / reward+burn==commit, exact ✓")

    _check_sqrt_floor()
    print("pow_half floor property holds ✓")

    # headline sanity: even fight 100 vs 100 (delta 1.3) ≈ 43.478%
    p = win_probability_wad(
        power(100 * WAD, WAD, WAD), power(100 * WAD, WAD, DELTA_WAD)) / WAD
    print(f"even fight p = {p:.6%} (expected ≈ 43.478261%)")
    assert abs(p - 1 / 2.3) < 1e-12
    print("\nAll fixed-point checks passed. This file is the Solidity spec.")
