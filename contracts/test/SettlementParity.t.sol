// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {FluxToken} from "../src/FluxToken.sol";
import {HoldfastSettlement} from "../src/HoldfastSettlement.sol";

/// @notice GENERATED FILE — do not edit by hand.
///         Settlement-level parity gate: replays a scripted 6-tick war with
///         EIP-712-signed intents and asserts the contract matches
///         sim/settlement_fixed.py after every tick (including the skip
///         path). Regenerate: cd sim && python3 gen_settlement_parity.py
contract SettlementParityTest is Test {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant ALICE_PK = 0xA11CE;
    uint256 internal constant BOB_PK = 0xB0B;
    // derived by sim/secp256k1_tiny.py; cross-checked against vm.addr below
    address internal constant ALICE =
        0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7;
    address internal constant BOB =
        0x0376AAc07Ad725E01357B1725B5ceC61aE10473c;
    address internal constant OPERATOR = address(uint160(0xC0DE));
    address internal constant PROVIDER = address(uint160(0xFEED));

    FluxToken flux;
    HoldfastSettlement st;

    function setUp() public {
        // the Python secp256k1 mirror must agree with the EVM's
        assertEq(vm.addr(ALICE_PK), ALICE, "python secp drift (alice)");
        assertEq(vm.addr(BOB_PK), BOB, "python secp drift (bob)");

        flux = new FluxToken();
        st = new HoldfastSettlement(flux);
        flux.setMinter(address(st));
        st.setOperator(OPERATOR);
        st.setRandomnessProvider(PROVIDER);

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

    function _signed(
        uint64 tick,
        uint64 tileId,
        uint256 pk,
        uint256 committed,
        uint256 attackerMod
    ) internal view returns (HoldfastSettlement.ContestInput memory ci) {
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            st.DOMAIN_SEPARATOR(),
            keccak256(abi.encode(
                st.INTENT_TYPEHASH(), uint256(0), tick, tileId, committed
            ))
        ));
        (uint8 v, bytes32 r, bytes32 sg) = vm.sign(pk, digest);
        ci = HoldfastSettlement.ContestInput({
            tileId: tileId,
            attacker: vm.addr(pk),
            committed: committed,
            attackerMod: attackerMod,
            sigV: v,
            sigR: r,
            sigS: sg
        });
    }

    function test_six_tick_war_matches_python_mirror() public {
        HoldfastSettlement.ContestInput[] memory cs;

        // ---- tick 1
        cs = new HoldfastSettlement.ContestInput[](2);
        cs[0] = _signed(1, 5, ALICE_PK, 120000000000000000000, 1000000000000000000);
        cs[1] = _signed(1, 7, BOB_PK, 100000000000000000000, 1000000000000000000);
        vm.prank(OPERATOR);
        st.openTick(0, 1, keccak256(abi.encode(cs)));
        vm.prank(PROVIDER);
        st.fulfillWord(0, 1, 3237998081);
        vm.prank(OPERATOR);
        st.settleTick(0, 1, bytes32(uint256(1)), cs);
        assertEq(st.escrow(ALICE), 152600000000000000000, "alice escrow tick 1");
        assertEq(st.escrow(BOB), 172600000000000000000, "bob escrow tick 1");
        assertEq(flux.totalSupply(), 1059200000000000000000, "supply tick 1");
        // ---- tick 2
        cs = new HoldfastSettlement.ContestInput[](2);
        cs[0] = _signed(2, 1, BOB_PK, 55000000000000000000, 1000000000000000000);
        cs[1] = _signed(2, 2, ALICE_PK, 60000000000000000000, 1000000000000000000);
        vm.prank(OPERATOR);
        st.openTick(0, 2, keccak256(abi.encode(cs)));
        vm.prank(PROVIDER);
        st.fulfillWord(0, 2, 3237998082);
        vm.prank(OPERATOR);
        st.settleTick(0, 2, bytes32(uint256(2)), cs);
        assertEq(st.escrow(ALICE), 119800000000000000000, "alice escrow tick 2");
        assertEq(st.escrow(BOB), 125600000000000000000, "bob escrow tick 2");
        assertEq(flux.totalSupply(), 993400000000000000000, "supply tick 2");
        // ---- tick 3
        cs = new HoldfastSettlement.ContestInput[](1);
        cs[0] = _signed(3, 0, BOB_PK, 90000000000000000000, 1200000000000000000);
        vm.prank(OPERATOR);
        st.openTick(0, 3, keccak256(abi.encode(cs)));
        vm.prank(PROVIDER);
        st.fulfillWord(0, 3, 3237998083);
        vm.prank(OPERATOR);
        st.settleTick(0, 3, bytes32(uint256(3)), cs);
        assertEq(st.escrow(ALICE), 131800000000000000000, "alice escrow tick 3");
        assertEq(st.escrow(BOB), 75400000000000000000, "bob escrow tick 3");
        assertEq(flux.totalSupply(), 957200000000000000000, "supply tick 3");
        // ---- tick 4
        cs = new HoldfastSettlement.ContestInput[](1);
        cs[0] = _signed(4, 3, ALICE_PK, 80000000000000000000, 1000000000000000000);
        vm.prank(OPERATOR);
        st.openTick(0, 4, keccak256(abi.encode(cs)));
        vm.prank(PROVIDER);
        st.fulfillWord(0, 4, 3237998084);
        vm.prank(OPERATOR);
        st.settleTick(0, 4, bytes32(uint256(4)), cs);
        assertEq(st.escrow(ALICE), 59800000000000000000, "alice escrow tick 4");
        assertEq(st.escrow(BOB), 111400000000000000000, "bob escrow tick 4");
        assertEq(flux.totalSupply(), 939200000000000000000, "supply tick 4");
        // ---- tick 5
        cs = new HoldfastSettlement.ContestInput[](2);
        cs[0] = _signed(5, 6, ALICE_PK, 60000000000000000000, 1000000000000000000);
        cs[1] = _signed(5, 6, BOB_PK, 55000000000000000000, 1000000000000000000);
        vm.prank(OPERATOR);
        st.openTick(0, 5, keccak256(abi.encode(cs)));
        vm.prank(PROVIDER);
        st.fulfillWord(0, 5, 3237998085);
        vm.prank(OPERATOR);
        st.settleTick(0, 5, bytes32(uint256(5)), cs);
        assertEq(st.escrow(ALICE), 45300000000000000000, "alice escrow tick 5");
        assertEq(st.escrow(BOB), 68400000000000000000, "bob escrow tick 5");
        assertEq(flux.totalSupply(), 889700000000000000000, "supply tick 5");
        // ---- tick 6
        cs = new HoldfastSettlement.ContestInput[](2);
        cs[0] = _signed(6, 4, BOB_PK, 200000000000000000000, 1000000000000000000);
        cs[1] = _signed(6, 8, ALICE_PK, 30000000000000000000, 1000000000000000000);
        vm.prank(OPERATOR);
        st.openTick(0, 6, keccak256(abi.encode(cs)));
        vm.prank(PROVIDER);
        st.fulfillWord(0, 6, 3237998086);
        vm.prank(OPERATOR);
        st.settleTick(0, 6, bytes32(uint256(6)), cs);
        assertEq(st.escrow(ALICE), 27300000000000000000, "alice escrow tick 6");  // mirror skipped: #0 InsufficientEscrow
        assertEq(st.escrow(BOB), 80400000000000000000, "bob escrow tick 6");
        assertEq(flux.totalSupply(), 901700000000000000000, "supply tick 6");

        // ---- final tile map
        (address o0, uint256 g0,) = st.tiles(0, 0);
        assertEq(o0, BOB, "tile 0 owner");
        assertEq(g0, 96000000000000000000, "tile 0 garrison");
        (address o1, uint256 g1,) = st.tiles(0, 1);
        assertEq(o1, address(0), "tile 1 owner");
        assertEq(g1, 72000000000000000000, "tile 1 garrison");
        (address o2, uint256 g2,) = st.tiles(0, 2);
        assertEq(o2, ALICE, "tile 2 owner");
        assertEq(g2, 68000000000000000000, "tile 2 garrison");
        (address o3, uint256 g3,) = st.tiles(0, 3);
        assertEq(o3, BOB, "tile 3 owner");
        assertEq(g3, 112000000000000000000, "tile 3 garrison");
        (address o4, uint256 g4,) = st.tiles(0, 4);
        assertEq(o4, address(0), "tile 4 owner");
        assertEq(g4, 72000000000000000000, "tile 4 garrison");
        (address o5, uint256 g5,) = st.tiles(0, 5);
        assertEq(o5, ALICE, "tile 5 owner");
        assertEq(g5, 130000000000000000000, "tile 5 garrison");
        (address o6, uint256 g6,) = st.tiles(0, 6);
        assertEq(o6, ALICE, "tile 6 owner");
        assertEq(g6, 62000000000000000000, "tile 6 garrison");
        (address o7, uint256 g7,) = st.tiles(0, 7);
        assertEq(o7, BOB, "tile 7 owner");
        assertEq(g7, 110000000000000000000, "tile 7 garrison");
        (address o8, uint256 g8,) = st.tiles(0, 8);
        assertEq(o8, address(0), "tile 8 owner");
        assertEq(g8, 72000000000000000000, "tile 8 garrison");
    }
}
