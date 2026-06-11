"""
Holdfast — Settlement-level parity generator.

Replays a scripted 6-tick war through settlement_fixed.py (the mirror) and
emits a Solidity test that performs the IDENTICAL calls against
HoldfastSettlement, asserting escrows + total supply after every tick and
the full tile map at the end. Any divergence anywhere in any tick fails.

Deterministic. Regenerate: cd sim && python3 gen_settlement_parity.py
"""

from __future__ import annotations

from resolver_fixed import WAD
from settlement_fixed import (
    Settlement, Contest, RegionParams, REC_PARAMS, NATURE, _demo_layout,
)

OUT = "../contracts/test/SettlementParity.t.sol"

ALICE, BOB = 0xA11CE, 0xB0B
OPERATOR = 0xC0DE
REGION = 0

# arbitrary fixed tick words (production: VRF)
WORDS = [0, 0xC0FFEE01, 0xC0FFEE02, 0xC0FFEE03, 0xC0FFEE04,
         0xC0FFEE05, 0xC0FFEE06]

# the scripted war: (tick) -> contests in normative batch order
SCRIPT = {
    1: [Contest(5, ALICE, 120 * WAD), Contest(7, BOB, 100 * WAD)],
    2: [Contest(1, BOB, 55 * WAD), Contest(2, ALICE, 60 * WAD)],
    3: [Contest(0, BOB, 90 * WAD, attacker_mod=12 * 10**17)],
    4: [Contest(3, ALICE, 80 * WAD)],
    5: [Contest(6, ALICE, 60 * WAD), Contest(6, BOB, 55 * WAD)],
    6: [Contest(4, BOB, 30 * WAD), Contest(8, ALICE, 30 * WAD)],
}


def addr(a: int) -> str:
    return f"address(uint160(0x{a:X}))"


def main():
    s = Settlement.genesis(REGION, REC_PARAMS, _demo_layout(ALICE, BOB))
    s.enroll([ALICE, BOB], 250 * WAD)

    tick_blocks = []
    for tick in range(1, 7):
        contests = SCRIPT[tick]
        s.settle_tick(tick, WORDS[tick], contests)
        s.assert_solvent()

        lines = [f"        cs = new HoldfastSettlement.ContestInput[]"
                 f"({len(contests)});"]
        for j, c in enumerate(contests):
            lines.append(
                f"        cs[{j}] = HoldfastSettlement.ContestInput({{"
                f"tileId: {c.tile_id}, attacker: {addr(c.attacker)}, "
                f"committed: {c.committed}, attackerMod: {c.attacker_mod}}});")
        lines.append(f"        vm.prank(OPERATOR);")
        lines.append(
            f"        st.settleTick({REGION}, {tick}, {WORDS[tick]}, "
            f"bytes32(uint256({tick})), cs);")
        lines.append(
            f"        assertEq(st.escrow(ALICE), {s.escrow[ALICE]}, "
            f"\"alice escrow tick {tick}\");")
        lines.append(
            f"        assertEq(st.escrow(BOB), {s.escrow[BOB]}, "
            f"\"bob escrow tick {tick}\");")
        lines.append(
            f"        assertEq(flux.totalSupply(), {s.total_supply}, "
            f"\"supply tick {tick}\");")
        tick_blocks.append(f"        // ---- tick {tick}\n" + "\n".join(lines))

    tile_asserts = []
    for i, t in enumerate(s.tiles):
        owner_sol = "address(0)" if t.owner == NATURE else addr(t.owner)
        tile_asserts.append(
            f"        (address o{i}, uint256 g{i},) = st.tiles({REGION}, {i});\n"
            f"        assertEq(o{i}, {owner_sol}, \"tile {i} owner\");\n"
            f"        assertEq(g{i}, {t.garrison}, \"tile {i} garrison\");")

    sol = f"""// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {{Test}} from "forge-std/Test.sol";
import {{FluxToken}} from "../src/FluxToken.sol";
import {{HoldfastSettlement}} from "../src/HoldfastSettlement.sol";

/// @notice GENERATED FILE — do not edit by hand.
///         Settlement-level parity gate: replays a scripted 6-tick war and
///         asserts the contract matches sim/settlement_fixed.py after every
///         tick. Regenerate: cd sim && python3 gen_settlement_parity.py
contract SettlementParityTest is Test {{
    uint256 internal constant WAD = 1e18;
    address internal constant ALICE = address(uint160(0xA11CE));
    address internal constant BOB = address(uint160(0xB0B));
    address internal constant OPERATOR = address(uint160(0xC0DE));

    FluxToken flux;
    HoldfastSettlement st;

    function setUp() public {{
        flux = new FluxToken();
        st = new HoldfastSettlement(flux);
        flux.setMinter(address(st));
        st.setOperator(OPERATOR);

        address[] memory owners = new address[](9);
        uint256[] memory garrisons = new uint256[](9);
        uint256[] memory mods = new uint256[](9);
        for (uint256 i = 0; i < 9; i++) {{
            owners[i] = address(0);
            garrisons[i] = 60 * WAD;
            mods[i] = WAD;
        }}
        owners[0] = ALICE;
        garrisons[0] = 100 * WAD;
        owners[3] = BOB;
        garrisons[3] = 100 * WAD;
        st.createRegion({REGION}, HoldfastSettlement.RegionParams({{
            delta: {REC_PARAMS.delta},
            gamma: {REC_PARAMS.gamma},
            beta: {REC_PARAMS.beta},
            yieldPerTile: {REC_PARAMS.yield_per_tile},
            garrisonRegen: {REC_PARAMS.garrison_regen},
            garrisonCap: {REC_PARAMS.garrison_cap},
            minCommit: {REC_PARAMS.min_commit}
        }}), owners, garrisons, mods);

        address[] memory players = new address[](2);
        players[0] = ALICE;
        players[1] = BOB;
        st.enroll(players, 250 * WAD);
    }}

    function test_six_tick_war_matches_python_mirror() public {{
        HoldfastSettlement.ContestInput[] memory cs;

{chr(10).join(tick_blocks)}

        // ---- final tile map
{chr(10).join(tile_asserts)}
    }}
}}
"""
    with open(OUT, "w") as f:
        f.write(sol)
    print(f"wrote {OUT}")
    print(f"final: alice={s.escrow[ALICE] / WAD:.4f}  "
          f"bob={s.escrow[BOB] / WAD:.4f}  supply={s.total_supply / WAD:.4f}")
    holders = {0: "wilds", ALICE: "alice", BOB: "bob"}
    print("tiles:", " ".join(
        f"{i}:{holders.get(t.owner, hex(t.owner))}"
        for i, t in enumerate(s.tiles)))


if __name__ == "__main__":
    main()
