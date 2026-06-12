"""
Holdfast — Settlement-level parity generator (signed-intent era).

Replays a scripted 6-tick war through settlement_fixed.py (the mirror) and
emits a Solidity test that performs the IDENTICAL calls against
HoldfastSettlement — signing each intent at runtime with vm.sign — and
asserts escrows + total supply after every tick plus the full tile map at
the end. Attacker addresses feed the per-contest keccak word, so the
generator derives them from the same private keys via sim/secp256k1_tiny.py
(the generated test cross-checks vm.addr against the derived constants).

Deterministic. Regenerate: cd sim && python3 gen_settlement_parity.py
"""

from __future__ import annotations

from keccak_tiny import keccak256
from resolver_fixed import WAD
from secp256k1_tiny import address_of
from settlement_fixed import (
    Settlement, Contest, REC_PARAMS, NATURE, _demo_layout,
)


def checksummed(addr: int) -> str:
    """EIP-55 checksummed hex — solc rejects non-checksummed literals."""
    low = f"{addr:040x}"
    digest = keccak256(low.encode()).hex()
    return "0x" + "".join(
        ch.upper() if int(digest[i], 16) >= 8 else ch
        for i, ch in enumerate(low))

OUT = "../contracts/test/SettlementParity.t.sol"

ALICE_PK, BOB_PK = 0xA11CE, 0xB0B
ALICE, BOB = address_of(ALICE_PK), address_of(BOB_PK)
REGION = 0

# arbitrary fixed tick words (production: VRF)
WORDS = [0, 0xC0FFEE01, 0xC0FFEE02, 0xC0FFEE03, 0xC0FFEE04,
         0xC0FFEE05, 0xC0FFEE06]

# the scripted war: tick -> contests in normative batch order.
# Commits sized so the war stays affordable; if a player runs dry the
# contract SKIPS (and the mirror must skip identically) — also covered.
SCRIPT = {
    1: [Contest(5, ALICE, 120 * WAD), Contest(7, BOB, 100 * WAD)],
    2: [Contest(1, BOB, 55 * WAD), Contest(2, ALICE, 60 * WAD)],
    3: [Contest(0, BOB, 90 * WAD, attacker_mod=12 * 10**17)],
    4: [Contest(3, ALICE, 80 * WAD)],
    5: [Contest(6, ALICE, 60 * WAD), Contest(6, BOB, 55 * WAD)],
    # tick 6 deliberately includes a likely-unaffordable commit so the
    # skip path itself is under the parity gate
    6: [Contest(4, BOB, 200 * WAD), Contest(8, ALICE, 30 * WAD)],
}

PK_NAME = {ALICE: "ALICE_PK", BOB: "BOB_PK"}


def main():
    s = Settlement.genesis(REGION, REC_PARAMS, _demo_layout(ALICE, BOB))
    s.enroll([ALICE, BOB], 250 * WAD)

    tick_blocks = []
    total_skips = 0
    for tick in range(1, 7):
        contests = SCRIPT[tick]
        s.settle_tick(tick, WORDS[tick], contests)
        s.assert_solvent()
        total_skips += len(s.skipped)

        lines = [f"        cs = new HoldfastSettlement.ContestInput[]"
                 f"({len(contests)});"]
        for j, c in enumerate(contests):
            lines.append(
                f"        cs[{j}] = _signed({tick}, {c.tile_id}, "
                f"{PK_NAME[c.attacker]}, {c.committed}, {c.attacker_mod});")
        lines.append("        vm.prank(OPERATOR);")
        lines.append(
            f"        st.settleTick({REGION}, {tick}, {WORDS[tick]}, "
            f"bytes32(uint256({tick})), cs);")
        skipnote = (f"  // mirror skipped: "
                    + ", ".join(f"#{i} {r}" for i, r in s.skipped)
                    if s.skipped else "")
        lines.append(
            f"        assertEq(st.escrow(ALICE), {s.escrow[ALICE]}, "
            f"\"alice escrow tick {tick}\");{skipnote}")
        lines.append(
            f"        assertEq(st.escrow(BOB), {s.escrow[BOB]}, "
            f"\"bob escrow tick {tick}\");")
        lines.append(
            f"        assertEq(flux.totalSupply(), {s.total_supply}, "
            f"\"supply tick {tick}\");")
        tick_blocks.append(f"        // ---- tick {tick}\n" + "\n".join(lines))

    tile_asserts = []
    for i, t in enumerate(s.tiles):
        owner_sol = "address(0)" if t.owner == NATURE else (
            "ALICE" if t.owner == ALICE else "BOB")
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
///         Settlement-level parity gate: replays a scripted 6-tick war with
///         EIP-712-signed intents and asserts the contract matches
///         sim/settlement_fixed.py after every tick (including the skip
///         path). Regenerate: cd sim && python3 gen_settlement_parity.py
contract SettlementParityTest is Test {{
    uint256 internal constant WAD = 1e18;
    uint256 internal constant ALICE_PK = 0xA11CE;
    uint256 internal constant BOB_PK = 0xB0B;
    // derived by sim/secp256k1_tiny.py; cross-checked against vm.addr below
    address internal constant ALICE =
        {checksummed(ALICE)};
    address internal constant BOB =
        {checksummed(BOB)};
    address internal constant OPERATOR = address(uint160(0xC0DE));

    FluxToken flux;
    HoldfastSettlement st;

    function setUp() public {{
        // the Python secp256k1 mirror must agree with the EVM's
        assertEq(vm.addr(ALICE_PK), ALICE, "python secp drift (alice)");
        assertEq(vm.addr(BOB_PK), BOB, "python secp drift (bob)");

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

    function _signed(
        uint64 tick,
        uint64 tileId,
        uint256 pk,
        uint256 committed,
        uint256 attackerMod
    ) internal view returns (HoldfastSettlement.ContestInput memory ci) {{
        bytes32 digest = keccak256(abi.encodePacked(
            "\\x19\\x01",
            st.DOMAIN_SEPARATOR(),
            keccak256(abi.encode(
                st.INTENT_TYPEHASH(), uint256({REGION}), tick, tileId, committed
            ))
        ));
        (uint8 v, bytes32 r, bytes32 sg) = vm.sign(pk, digest);
        ci = HoldfastSettlement.ContestInput({{
            tileId: tileId,
            attacker: vm.addr(pk),
            committed: committed,
            attackerMod: attackerMod,
            sigV: v,
            sigR: r,
            sigS: sg
        }});
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
    print(f"wrote {OUT} (mirror recorded {total_skips} skipped contest(s))")
    print(f"final: alice={s.escrow[ALICE] / WAD:.4f}  "
          f"bob={s.escrow[BOB] / WAD:.4f}  supply={s.total_supply / WAD:.4f}")
    holders = {NATURE: "wilds", ALICE: "alice", BOB: "bob"}
    print("tiles:", " ".join(
        f"{i}:{holders.get(t.owner, hex(t.owner))}"
        for i, t in enumerate(s.tiles)))


if __name__ == "__main__":
    main()
