// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {FluxToken} from "../src/FluxToken.sol";
import {HoldfastSettlement} from "../src/HoldfastSettlement.sol";

/// @notice GENERATED FILE — do not edit by hand.
///         Settlement-level parity gate: replays a scripted 6-tick war and
///         asserts the contract matches sim/settlement_fixed.py after every
///         tick. Regenerate: cd sim && python3 gen_settlement_parity.py
contract SettlementParityTest is Test {
    uint256 internal constant WAD = 1e18;
    address internal constant ALICE = address(uint160(0xA11CE));
    address internal constant BOB = address(uint160(0xB0B));
    address internal constant OPERATOR = address(uint160(0xC0DE));

    FluxToken flux;
    HoldfastSettlement st;

    function setUp() public {
        flux = new FluxToken();
        st = new HoldfastSettlement(flux);
        flux.setMinter(address(st));
        st.setOperator(OPERATOR);

        address[] memory owners = new address[](9);
        uint256[] memory garrisons = new uint256[](9);
        uint256[] memory mods = new uint256[](9);
        for (uint256 i = 0; i < 9; i++) {
            owners[i] = address(0);
            garrisons[i] = 60 * WAD;
            mods[i] = WAD;
        }
        owners[0] = ALICE;
        garrisons[0] = 100 * WAD;
        owners[3] = BOB;
        garrisons[3] = 100 * WAD;
        st.createRegion(0, HoldfastSettlement.RegionParams({
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            yieldPerTile: 4000000000000000000,
            garrisonRegen: 2000000000000000000,
            garrisonCap: 200000000000000000000,
            minCommit: 20000000000000000000
        }), owners, garrisons, mods);

        address[] memory players = new address[](2);
        players[0] = ALICE;
        players[1] = BOB;
        st.enroll(players, 250 * WAD);
    }

    function test_six_tick_war_matches_python_mirror() public {
        HoldfastSettlement.ContestInput[] memory cs;

        // ---- tick 1
        cs = new HoldfastSettlement.ContestInput[](2);
        cs[0] = HoldfastSettlement.ContestInput({tileId: 5, attacker: address(uint160(0xA11CE)), committed: 120000000000000000000, attackerMod: 1000000000000000000});
        cs[1] = HoldfastSettlement.ContestInput({tileId: 7, attacker: address(uint160(0xB0B)), committed: 100000000000000000000, attackerMod: 1000000000000000000});
        vm.prank(OPERATOR);
        st.settleTick(0, 1, 3237998081, bytes32(uint256(1)), cs);
        assertEq(st.escrow(ALICE), 134000000000000000000, "alice escrow tick 1");
        assertEq(st.escrow(BOB), 154000000000000000000, "bob escrow tick 1");
        assertEq(flux.totalSupply(), 926000000000000000000, "supply tick 1");
        // ---- tick 2
        cs = new HoldfastSettlement.ContestInput[](2);
        cs[0] = HoldfastSettlement.ContestInput({tileId: 1, attacker: address(uint160(0xB0B)), committed: 55000000000000000000, attackerMod: 1000000000000000000});
        cs[1] = HoldfastSettlement.ContestInput({tileId: 2, attacker: address(uint160(0xA11CE)), committed: 60000000000000000000, attackerMod: 1000000000000000000});
        vm.prank(OPERATOR);
        st.settleTick(0, 2, 3237998082, bytes32(uint256(2)), cs);
        assertEq(st.escrow(ALICE), 97200000000000000000, "alice escrow tick 2");
        assertEq(st.escrow(BOB), 122200000000000000000, "bob escrow tick 2");
        assertEq(flux.totalSupply(), 862400000000000000000, "supply tick 2");
        // ---- tick 3
        cs = new HoldfastSettlement.ContestInput[](1);
        cs[0] = HoldfastSettlement.ContestInput({tileId: 0, attacker: address(uint160(0xB0B)), committed: 90000000000000000000, attackerMod: 1200000000000000000});
        vm.prank(OPERATOR);
        st.settleTick(0, 3, 3237998083, bytes32(uint256(3)), cs);
        assertEq(st.escrow(ALICE), 132200000000000000000, "alice escrow tick 3");
        assertEq(st.escrow(BOB), 40200000000000000000, "bob escrow tick 3");
        assertEq(flux.totalSupply(), 833400000000000000000, "supply tick 3");
        // ---- tick 4
        cs = new HoldfastSettlement.ContestInput[](1);
        cs[0] = HoldfastSettlement.ContestInput({tileId: 3, attacker: address(uint160(0xA11CE)), committed: 80000000000000000000, attackerMod: 1000000000000000000});
        vm.prank(OPERATOR);
        st.settleTick(0, 4, 3237998084, bytes32(uint256(4)), cs);
        assertEq(st.escrow(ALICE), 60200000000000000000, "alice escrow tick 4");
        assertEq(st.escrow(BOB), 72200000000000000000, "bob escrow tick 4");
        assertEq(flux.totalSupply(), 811400000000000000000, "supply tick 4");
        // ---- tick 5
        cs = new HoldfastSettlement.ContestInput[](2);
        cs[0] = HoldfastSettlement.ContestInput({tileId: 6, attacker: address(uint160(0xA11CE)), committed: 60000000000000000000, attackerMod: 1000000000000000000});
        cs[1] = HoldfastSettlement.ContestInput({tileId: 6, attacker: address(uint160(0xB0B)), committed: 55000000000000000000, attackerMod: 1000000000000000000});
        vm.prank(OPERATOR);
        st.settleTick(0, 5, 3237998085, bytes32(uint256(5)), cs);
        assertEq(st.escrow(ALICE), 45700000000000000000, "alice escrow tick 5");
        assertEq(st.escrow(BOB), 25200000000000000000, "bob escrow tick 5");
        assertEq(flux.totalSupply(), 757900000000000000000, "supply tick 5");
        // ---- tick 6
        cs = new HoldfastSettlement.ContestInput[](2);
        cs[0] = HoldfastSettlement.ContestInput({tileId: 4, attacker: address(uint160(0xB0B)), committed: 30000000000000000000, attackerMod: 1000000000000000000});
        cs[1] = HoldfastSettlement.ContestInput({tileId: 8, attacker: address(uint160(0xA11CE)), committed: 30000000000000000000, attackerMod: 1000000000000000000});
        vm.prank(OPERATOR);
        st.settleTick(0, 6, 3237998086, bytes32(uint256(6)), cs);
        assertEq(st.escrow(ALICE), 27700000000000000000, "alice escrow tick 6");
        assertEq(st.escrow(BOB), 3200000000000000000, "bob escrow tick 6");
        assertEq(flux.totalSupply(), 735900000000000000000, "supply tick 6");

        // ---- final tile map
        (address o0, uint256 g0,) = st.tiles(0, 0);
        assertEq(o0, address(uint160(0xA11CE)), "tile 0 owner");
        assertEq(g0, 112000000000000000000, "tile 0 garrison");
        (address o1, uint256 g1,) = st.tiles(0, 1);
        assertEq(o1, address(uint160(0xB0B)), "tile 1 owner");
        assertEq(g1, 63000000000000000000, "tile 1 garrison");
        (address o2, uint256 g2,) = st.tiles(0, 2);
        assertEq(o2, address(uint160(0xA11CE)), "tile 2 owner");
        assertEq(g2, 68000000000000000000, "tile 2 garrison");
        (address o3, uint256 g3,) = st.tiles(0, 3);
        assertEq(o3, address(uint160(0xB0B)), "tile 3 owner");
        assertEq(g3, 112000000000000000000, "tile 3 garrison");
        (address o4, uint256 g4,) = st.tiles(0, 4);
        assertEq(o4, address(0), "tile 4 owner");
        assertEq(g4, 72000000000000000000, "tile 4 garrison");
        (address o5, uint256 g5,) = st.tiles(0, 5);
        assertEq(o5, address(0), "tile 5 owner");
        assertEq(g5, 72000000000000000000, "tile 5 garrison");
        (address o6, uint256 g6,) = st.tiles(0, 6);
        assertEq(o6, address(uint160(0xA11CE)), "tile 6 owner");
        assertEq(g6, 62000000000000000000, "tile 6 garrison");
        (address o7, uint256 g7,) = st.tiles(0, 7);
        assertEq(o7, address(0), "tile 7 owner");
        assertEq(g7, 72000000000000000000, "tile 7 garrison");
        (address o8, uint256 g8,) = st.tiles(0, 8);
        assertEq(o8, address(0), "tile 8 owner");
        assertEq(g8, 72000000000000000000, "tile 8 garrison");
    }
}
