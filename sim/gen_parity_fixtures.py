"""
Holdfast — Parity fixture generator (Workstream B).

Computes expected contest outcomes with resolver_fixed.py (THE spec) and
emits a Solidity fixture library. `forge test` then asserts ResolverLib
reproduces every field bit-for-bit — this is the correctness gate from
docs/PLAN.md, written before the settlement contract exists.

Deterministic: fixed RNG seed, no timestamps. Regenerate any time with:
    python3 gen_parity_fixtures.py
"""

from __future__ import annotations
import random

from resolver_fixed import (
    WAD, DELTA_WAD, GAMMA_WAD, BETA_WAD, GAMMA_REC, BETA_REC,
    resolve_contest_fixed, power, win_probability_wad,
)

OUT = "../contracts/test/ResolverParityFixtures.sol"

PARAM_SETS = [
    ("phase0 spec",   DELTA_WAD, GAMMA_WAD, BETA_WAD),
    ("balance rec",   DELTA_WAD, GAMMA_REC, BETA_REC),
    ("no advantage",  WAD,       GAMMA_REC, BETA_REC),
    ("full spoils",   DELTA_WAD, WAD,       0),
    ("full burn",     DELTA_WAD, 0,         0),
]


def random_cases(n: int):
    rng = random.Random(20260611)
    cases = []
    for i in range(n):
        delta, gamma, beta = PARAM_SETS[i % len(PARAM_SETS)][1:]
        committed = rng.randrange(1, 5_000_000 * WAD)
        garrison = rng.randrange(0, 5_000_000 * WAD)
        a_mod = rng.randrange(WAD // 2, 2 * WAD)
        d_mod = rng.randrange(WAD // 2, 2 * WAD)
        word = rng.getrandbits(256)
        cases.append((f"random {i}", committed, a_mod, garrison, d_mod,
                      delta, gamma, beta, word))
    return cases


def edge_cases():
    big = 10**9 * WAD          # 1e9 tokens
    one = 1                    # 1 wei of Flux
    cases = [
        ("empty tile: attacker always wins",
         100 * WAD, WAD, 0, WAD, DELTA_WAD, GAMMA_REC, BETA_REC, 12345),
        ("zero commit vs garrison: defender holds",
         0, WAD, 100 * WAD, WAD, DELTA_WAD, GAMMA_REC, BETA_REC, 0),
        ("both zero: p=0, defender holds",
         0, WAD, 0, WAD, DELTA_WAD, GAMMA_REC, BETA_REC, 999),
        ("1 wei commit vs 1 wei garrison",
         one, WAD, one, WAD, DELTA_WAD, GAMMA_REC, BETA_REC, 7),
        ("whale vs 1 wei", big, WAD, one, WAD, DELTA_WAD, GAMMA_REC, BETA_REC, 3),
        ("perfect squares 4 vs 1",
         4 * WAD, WAD, 1 * WAD, WAD, WAD, GAMMA_REC, BETA_REC, 42),
        ("max modifiers", 250 * WAD, 2 * WAD, 250 * WAD, 2 * WAD,
         DELTA_WAD, GAMMA_REC, BETA_REC, 2**255),
        ("roll = 0 always wins when p>0",
         100 * WAD, WAD, 100 * WAD, WAD, DELTA_WAD, GAMMA_REC, BETA_REC, 0),
        ("randomWord = WAD-1 (roll = WAD-1, loses: p<WAD)",
         100 * WAD, WAD, 100 * WAD, WAD, DELTA_WAD, GAMMA_REC, BETA_REC, WAD - 1),
        ("randomWord = multiple of WAD (roll wraps to 0)",
         100 * WAD, WAD, 100 * WAD, WAD, DELTA_WAD, GAMMA_REC, BETA_REC, 5 * WAD),
    ]
    # boundary: roll == pWad must LOSE (strict <), roll == pWad-1 must WIN
    p = win_probability_wad(
        power(180 * WAD, WAD, WAD), power(120 * WAD, WAD, DELTA_WAD))
    cases.append(("boundary roll == pWad: defender holds",
                  180 * WAD, WAD, 120 * WAD, WAD,
                  DELTA_WAD, GAMMA_REC, BETA_REC, p))
    cases.append(("boundary roll == pWad-1: attacker wins",
                  180 * WAD, WAD, 120 * WAD, WAD,
                  DELTA_WAD, GAMMA_REC, BETA_REC, p - 1))
    return cases


def solidity_case(idx: int, label: str, committed, a_mod, garrison, d_mod,
                  delta, gamma, beta, word) -> str:
    o = resolve_contest_fixed(committed, a_mod, garrison, d_mod,
                              delta, gamma, beta, word)
    return f"""        // {label}
        cs[{idx}] = Case({{
            committed: {committed},
            attackerMod: {a_mod},
            garrison: {garrison},
            defenderMod: {d_mod},
            delta: {delta},
            gamma: {gamma},
            beta: {beta},
            randomWord: {word},
            expWon: {str(o.attacker_won).lower()},
            expPWad: {o.p_wad},
            expRoll: {o.roll},
            expToAttacker: {o.to_attacker},
            expToDefender: {o.to_defender},
            expBurned: {o.burned},
            expNewGarrison: {o.new_garrison}
        }});"""


def main():
    cases = edge_cases() + random_cases(75)
    body = "\n".join(
        solidity_case(i, c[0], *c[1:]) for i, c in enumerate(cases))
    sol = f"""// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice GENERATED FILE — do not edit by hand.
///         Source of truth: sim/resolver_fixed.py (the fixed-point spec).
///         Regenerate: cd sim && python3 gen_parity_fixtures.py
library ResolverParityFixtures {{
    struct Case {{
        uint256 committed;
        uint256 attackerMod;
        uint256 garrison;
        uint256 defenderMod;
        uint256 delta;
        uint256 gamma;
        uint256 beta;
        uint256 randomWord;
        bool expWon;
        uint256 expPWad;
        uint256 expRoll;
        uint256 expToAttacker;
        uint256 expToDefender;
        uint256 expBurned;
        uint256 expNewGarrison;
    }}

    function load() internal pure returns (Case[] memory cs) {{
        cs = new Case[]({len(cases)});
{body}
    }}
}}
"""
    with open(OUT, "w") as f:
        f.write(sol)
    print(f"wrote {OUT}: {len(cases)} cases "
          f"({len(edge_cases())} edge + 75 random across "
          f"{len(PARAM_SETS)} param sets)")


if __name__ == "__main__":
    main()
