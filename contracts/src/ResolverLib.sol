// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title ResolverLib — deterministic contest math for Holdfast
/// @notice The chain-side mirror of `sim/resolver_fixed.py` (THE spec).
///         GM proposes, chain disposes: no GM output ever enters these
///         functions — only committed stakes, committed modifiers (Bucket 2),
///         region params, and a VRF word.
/// @dev    All amounts and ratios are WAD (1e18) fixed-point.
///         alpha is fixed at 0.5 in v1: x^0.5 = sqrt(x * WAD), exact floor.
///         Operation order is normative — changing it breaks parity:
///           power = mulWad(mulWad(powHalf(flux), modifier), advantage)
///         Win rule: roll = randomWord % WAD; attacker wins iff roll < pWad
///         (strict: roll == pWad is a defender hold).
///         The library is total: zero commits/garrisons resolve gracefully;
///         input validation (min commit, ownership, ordering of a tick's
///         contest batch by committed desc per tile) is the settlement
///         contract's duty.
library ResolverLib {
    uint256 internal constant WAD = 1e18;

    /// @dev Region economy parameters, WAD-scaled. A region/continent is
    ///      config, not hardcode (ADR-001).
    struct Params {
        uint256 delta; // defender advantage  (spec 1.3e18)
        uint256 gamma; // spoils ratio        (BALANCE.md rec 0.3e18)
        uint256 beta;  // defend reward       (BALANCE.md rec 0.3e18)
    }

    struct Contest {
        uint256 committed;   // attacker Flux at stake
        uint256 attackerMod; // Bucket-2 modifier (reputation/alliances)
        uint256 garrison;    // defender Flux holding the tile
        uint256 defenderMod; // Bucket-2 modifier (terrain etc.)
    }

    struct Outcome {
        bool attackerWon;
        uint256 pWad;        // attacker win probability
        uint256 roll;        // randomWord % WAD
        uint256 toAttacker;  // spoils (win branch)
        uint256 toDefender;  // defend reward (loss branch)
        uint256 burned;      // sink — burned on both branches
        uint256 newGarrison; // garrison after settlement
    }

    /// @dev floor(a * b / WAD); reverts on overflow (0.8 checked math).
    function mulWad(uint256 a, uint256 b) internal pure returns (uint256) {
        return a * b / WAD;
    }

    /// @dev floor(sqrt(a)). Newton's method with a 1-bit-exact seed;
    ///      result satisfies r*r <= a < (r+1)*(r+1) for ALL uint256
    ///      (fuzz-proven in ResolverLib.t.sol) — therefore equal to
    ///      Python's math.isqrt.
    function sqrt(uint256 a) internal pure returns (uint256) {
        unchecked {
            if (a <= 1) return a;
            uint256 aa = a;
            uint256 xn = 1;
            if (aa >= (1 << 128)) { aa >>= 128; xn <<= 64; }
            if (aa >= (1 << 64))  { aa >>= 64;  xn <<= 32; }
            if (aa >= (1 << 32))  { aa >>= 32;  xn <<= 16; }
            if (aa >= (1 << 16))  { aa >>= 16;  xn <<= 8;  }
            if (aa >= (1 << 8))   { aa >>= 8;   xn <<= 4;  }
            if (aa >= (1 << 4))   { aa >>= 4;   xn <<= 2;  }
            if (aa >= (1 << 2))   {             xn <<= 1;  }
            xn = (3 * xn) >> 1;
            xn = (xn + a / xn) >> 1;
            xn = (xn + a / xn) >> 1;
            xn = (xn + a / xn) >> 1;
            xn = (xn + a / xn) >> 1;
            xn = (xn + a / xn) >> 1;
            xn = (xn + a / xn) >> 1;
            return xn - (xn > a / xn ? 1 : 0);
        }
    }

    /// @dev x^0.5 in WAD: sqrt(xWad * WAD). The multiplication is checked —
    ///      reverts for xWad > ~1.15e59, far beyond any possible Flux supply.
    function powHalf(uint256 xWad) internal pure returns (uint256) {
        return sqrt(xWad * WAD);
    }

    /// @dev P = flux^0.5 * modifier * advantage (normative order).
    function power(uint256 fluxWad, uint256 modWad, uint256 advWad)
        internal pure returns (uint256)
    {
        return mulWad(mulWad(powHalf(fluxWad), modWad), advWad);
    }

    /// @dev pWad = Pa / (Pa + Pd); 0 when both sides are powerless.
    function winProbability(uint256 pa, uint256 pd)
        internal pure returns (uint256)
    {
        uint256 s = pa + pd;
        if (s == 0) return 0;
        return pa * WAD / s;
    }

    /// @notice Resolve one contest. Pure: same inputs, same outcome, forever.
    /// @param randomWord opaque VRF output — drawn AFTER the tick closes so
    ///        nobody (player or GM) can peek before committing.
    function resolveContest(
        Contest memory c,
        Params memory p,
        uint256 randomWord
    ) internal pure returns (Outcome memory o) {
        uint256 pa = power(c.committed, c.attackerMod, WAD);
        uint256 pd = power(c.garrison, c.defenderMod, p.delta);
        o.pWad = winProbability(pa, pd);
        o.roll = randomWord % WAD;
        o.attackerWon = o.roll < o.pWad;

        if (o.attackerWon) {
            // attacker takes the tile: spoils from garrison, rest burns,
            // the committed stake becomes the new garrison
            o.toAttacker = mulWad(p.gamma, c.garrison);
            o.burned = c.garrison - o.toAttacker;
            o.newGarrison = c.committed;
        } else {
            // defender holds: share of the commit as reward, rest burns
            o.toDefender = mulWad(p.beta, c.committed);
            o.burned = c.committed - o.toDefender;
            o.newGarrison = c.garrison;
        }
    }
}
