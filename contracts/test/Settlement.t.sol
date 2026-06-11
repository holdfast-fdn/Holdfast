// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, stdError} from "forge-std/Test.sol";
import {FluxToken} from "../src/FluxToken.sol";
import {HoldfastSettlement} from "../src/HoldfastSettlement.sol";
import {ResolverLib} from "../src/ResolverLib.sol";

contract SettlementTest is Test {
    uint256 internal constant WAD = 1e18;

    FluxToken flux;
    HoldfastSettlement st;

    address operator = makeAddr("operator");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address mallory = makeAddr("mallory");

    uint256 constant REGION = 0;
    uint64 constant TILES = 9;

    function setUp() public {
        flux = new FluxToken();
        st = new HoldfastSettlement(flux);
        flux.setMinter(address(st));
        st.setOperator(operator);

        // demo layout: tile0 alice, tile3 bob, the rest wilds
        address[] memory owners = new address[](TILES);
        uint256[] memory garrisons = new uint256[](TILES);
        uint256[] memory mods = new uint256[](TILES);
        for (uint256 i = 0; i < TILES; i++) {
            owners[i] = address(0);
            garrisons[i] = 60 * WAD;
            mods[i] = WAD;
        }
        owners[0] = alice;
        garrisons[0] = 100 * WAD;
        owners[3] = bob;
        garrisons[3] = 100 * WAD;
        st.createRegion(REGION, _params(), owners, garrisons, mods);

        // fund players through the testnet onboarding path
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;
        st.enroll(players, 250 * WAD);
    }

    function _params() internal pure returns (HoldfastSettlement.RegionParams memory) {
        // BALANCE.md rev2 recommended set
        return HoldfastSettlement.RegionParams({
            delta: 13e17,
            gamma: 3e17,
            beta: 3e17,
            yieldPerTile: 4 * WAD,
            garrisonRegen: 2 * WAD,
            garrisonCap: 200 * WAD,
            minCommit: 20 * WAD
        });
    }

    function _contest(uint64 tileId, address attacker, uint256 committed)
        internal pure returns (HoldfastSettlement.ContestInput memory)
    {
        return HoldfastSettlement.ContestInput({
            tileId: tileId,
            attacker: attacker,
            committed: committed,
            attackerMod: WAD
        });
    }

    function _settle(uint64 tick, uint256 word,
                     HoldfastSettlement.ContestInput[] memory cs) internal {
        vm.prank(operator);
        st.settleTick(REGION, tick, word, bytes32(uint256(0xB2)), cs);
    }

    function _none() internal pure
        returns (HoldfastSettlement.ContestInput[] memory cs)
    {
        cs = new HoldfastSettlement.ContestInput[](0);
    }

    /// @dev solvency invariant: every Flux the contract holds is either
    ///      player escrow or a garrison — nothing else, nothing missing.
    function _assertSolvent() internal view {
        uint256 garrisonSum;
        for (uint256 i = 0; i < TILES; i++) {
            (, uint256 g,) = st.tiles(REGION, i);
            garrisonSum += g;
        }
        uint256 escrowSum = st.escrow(alice) + st.escrow(bob)
            + st.escrow(mallory) + st.escrow(operator);
        assertEq(flux.balanceOf(address(st)), escrowSum + garrisonSum,
            "settlement insolvent");
    }

    // ------------------------------------------------------------------
    // access control & wiring
    // ------------------------------------------------------------------
    function test_minter_wiring_is_one_shot() public {
        vm.expectRevert(FluxToken.MinterAlreadySet.selector);
        flux.setMinter(mallory);

        vm.prank(mallory);
        vm.expectRevert(FluxToken.NotMinter.selector);
        flux.mint(mallory, 1);
    }

    function test_only_owner_admin() public {
        vm.startPrank(mallory);
        vm.expectRevert(HoldfastSettlement.NotOwner.selector);
        st.setOperator(mallory);

        address[] memory o = new address[](1);
        uint256[] memory g = new uint256[](1);
        uint256[] memory m = new uint256[](1);
        vm.expectRevert(HoldfastSettlement.NotOwner.selector);
        st.createRegion(1, _params(), o, g, m);
        vm.stopPrank();
    }

    function test_enroll_only_owner_and_mints_into_escrow() public {
        address[] memory ps = new address[](1);
        ps[0] = mallory;
        vm.prank(mallory);
        vm.expectRevert(HoldfastSettlement.NotOwner.selector);
        st.enroll(ps, 1000 * WAD);

        uint256 supplyBefore = flux.totalSupply();
        st.enroll(ps, 100 * WAD);
        assertEq(st.escrow(mallory), 100 * WAD);
        assertEq(flux.totalSupply(), supplyBefore + 100 * WAD);
        _assertSolvent();

        // enrolled escrow is real, withdrawable Flux
        vm.prank(mallory);
        st.withdraw(100 * WAD);
        assertEq(flux.balanceOf(mallory), 100 * WAD);
    }

    function test_only_operator_settles() public {
        vm.prank(mallory);
        vm.expectRevert(HoldfastSettlement.NotOperator.selector);
        st.settleTick(REGION, 1, 0, 0, _none());
    }

    function test_region_genesis_guards() public {
        address[] memory o = new address[](1);
        uint256[] memory g = new uint256[](1);
        uint256[] memory m = new uint256[](1);
        vm.expectRevert(HoldfastSettlement.RegionExists.selector);
        st.createRegion(REGION, _params(), o, g, m);

        vm.prank(operator);
        vm.expectRevert(HoldfastSettlement.RegionMissing.selector);
        st.settleTick(42, 1, 0, 0, _none());
    }

    function test_tick_must_be_monotonic() public {
        vm.startPrank(operator);
        vm.expectRevert(HoldfastSettlement.WrongTick.selector);
        st.settleTick(REGION, 2, 0, 0, _none()); // skip ahead

        st.settleTick(REGION, 1, 0, 0, _none());
        vm.expectRevert(HoldfastSettlement.WrongTick.selector);
        st.settleTick(REGION, 1, 0, 0, _none()); // replay
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // escrow
    // ------------------------------------------------------------------
    function test_deposit_withdraw_roundtrip() public {
        uint256 before = flux.balanceOf(alice);
        vm.startPrank(alice);
        st.withdraw(100 * WAD);
        assertEq(flux.balanceOf(alice), before + 100 * WAD);
        assertEq(st.escrow(alice), 150 * WAD);

        vm.expectRevert(stdError.arithmeticError);
        st.withdraw(151 * WAD); // more than escrowed
        vm.stopPrank();
        _assertSolvent();
    }

    // ------------------------------------------------------------------
    // batch validation
    // ------------------------------------------------------------------
    function test_batch_must_be_sorted() public {
        HoldfastSettlement.ContestInput[] memory cs =
            new HoldfastSettlement.ContestInput[](2);
        // same tile, ascending committed — violates desc-committed rule
        cs[0] = _contest(5, alice, 30 * WAD);
        cs[1] = _contest(5, bob, 40 * WAD);
        vm.prank(operator);
        vm.expectRevert(HoldfastSettlement.BatchNotSorted.selector);
        st.settleTick(REGION, 1, 0, 0, cs);

        // descending tileIds — violates ascending-tile rule
        cs[0] = _contest(6, alice, 30 * WAD);
        cs[1] = _contest(5, bob, 40 * WAD);
        vm.prank(operator);
        vm.expectRevert(HoldfastSettlement.BatchNotSorted.selector);
        st.settleTick(REGION, 1, 0, 0, cs);
    }

    function test_contest_input_guards() public {
        HoldfastSettlement.ContestInput[] memory cs =
            new HoldfastSettlement.ContestInput[](1);

        cs[0] = _contest(99, alice, 30 * WAD); // no such tile
        vm.prank(operator);
        vm.expectRevert(HoldfastSettlement.BadTileId.selector);
        st.settleTick(REGION, 1, 0, 0, cs);

        cs[0] = _contest(5, alice, 19 * WAD); // below minCommit
        vm.prank(operator);
        vm.expectRevert(HoldfastSettlement.CommitTooSmall.selector);
        st.settleTick(REGION, 1, 0, 0, cs);

        cs[0] = _contest(0, alice, 30 * WAD); // alice attacks her own tile
        vm.prank(operator);
        vm.expectRevert(HoldfastSettlement.SelfAttack.selector);
        st.settleTick(REGION, 1, 0, 0, cs);

        cs[0] = _contest(5, mallory, 30 * WAD); // mallory has no escrow
        vm.prank(operator);
        vm.expectRevert(stdError.arithmeticError);
        st.settleTick(REGION, 1, 0, 0, cs);
    }

    // ------------------------------------------------------------------
    // emission
    // ------------------------------------------------------------------
    function test_emission_only_tick() public {
        uint256 supplyBefore = flux.totalSupply();
        _settle(1, 0, _none());

        // owners earn yield; the wilds earn nothing
        assertEq(st.escrow(alice), 254 * WAD);
        assertEq(st.escrow(bob), 254 * WAD);
        // every garrison regenerates toward the cap
        (, uint256 g0,) = st.tiles(REGION, 0);
        (, uint256 g5,) = st.tiles(REGION, 5);
        assertEq(g0, 102 * WAD);
        assertEq(g5, 62 * WAD);
        // minted = 2 yields + 9 regens
        assertEq(flux.totalSupply() - supplyBefore, (4 * 2 + 2 * 9) * WAD);
        _assertSolvent();
    }

    // ------------------------------------------------------------------
    // contests
    // ------------------------------------------------------------------
    function test_conquest_of_wilds() public {
        // word multiple of WAD -> roll 0 -> any positive p wins
        HoldfastSettlement.ContestInput[] memory cs =
            new HoldfastSettlement.ContestInput[](1);
        cs[0] = _contest(5, alice, 120 * WAD);

        uint256 word = _winningWordFor(1, 5, alice);
        _settle(1, word, cs);

        (address tOwner, uint256 g,) = st.tiles(REGION, 5);
        assertEq(tOwner, alice, "tile not taken");
        assertEq(g, 120 * WAD, "garrison must equal the winning commit");

        // garrison at contest time was 62 (60 genesis + 2 regen this tick);
        // spoils = 0.3 * 62 = 18.6
        uint256 expected = 250 * WAD // start
            + 4 * WAD                // yield for tile0
            - 120 * WAD              // stake
            + 186 * WAD / 10;        // spoils
        assertEq(st.escrow(alice), expected);
        _assertSolvent();
    }

    function test_defender_hold_pays_reward() public {
        // bob storms alice's home tile and the roll comes up max -> hold
        HoldfastSettlement.ContestInput[] memory cs =
            new HoldfastSettlement.ContestInput[](1);
        cs[0] = _contest(0, bob, 100 * WAD);

        uint256 word = _losingWordFor(1, 0, bob);
        _settle(1, word, cs);

        (address tOwner, uint256 g,) = st.tiles(REGION, 0);
        assertEq(tOwner, alice, "owner must not change on a hold");
        assertEq(g, 102 * WAD, "garrison = genesis 100 + regen 2");

        // bob: start + yield(tile3) - commit
        assertEq(st.escrow(bob), (250 + 4 - 100) * WAD);
        // alice: start + yield(tile0) + 0.3 * 100 defend reward
        assertEq(st.escrow(alice), (250 + 4 + 30) * WAD);
        _assertSolvent();
    }

    function test_wilds_hold_burns_reward() public {
        // attacker loses to a nature tile: the whole commit leaves supply
        HoldfastSettlement.ContestInput[] memory cs =
            new HoldfastSettlement.ContestInput[](1);
        cs[0] = _contest(5, bob, 40 * WAD);

        uint256 supplyBefore = flux.totalSupply();
        uint256 word = _losingWordFor(1, 5, bob);
        _settle(1, word, cs);

        // minted this tick: 2 yields + 9 regens = 26; burned: full 40 commit
        assertEq(flux.totalSupply(), supplyBefore + 26 * WAD - 40 * WAD);
        assertEq(st.escrow(bob), (250 + 4 - 40) * WAD);
        _assertSolvent();
    }

    function test_collision_sequential_resolution() public {
        // two attackers, same wild tile, both forced wins: the second
        // (smaller commit) fights the FIRST attacker's fresh garrison
        HoldfastSettlement.ContestInput[] memory cs =
            new HoldfastSettlement.ContestInput[](2);
        cs[0] = _contest(5, alice, 120 * WAD);
        cs[1] = _contest(5, bob, 80 * WAD);

        uint256 word = _winningWordForBoth(1, 5, alice, bob);
        _settle(1, word, cs);

        (address tOwner, uint256 g,) = st.tiles(REGION, 5);
        assertEq(tOwner, bob, "second winner takes the tile");
        assertEq(g, 80 * WAD);
        // bob's spoils come from alice's 120 garrison: 0.3 * 120 = 36
        assertEq(st.escrow(bob), (250 + 4 - 80 + 36) * WAD);
        _assertSolvent();
    }

    // ------------------------------------------------------------------
    // helpers: search a tick word that forces win/lose rolls (test-only)
    // ------------------------------------------------------------------
    function _roll(uint256 word, uint64 tick, uint64 tileId, address attacker)
        internal pure returns (uint256)
    {
        return uint256(keccak256(
            abi.encodePacked(word, uint256(REGION), tick, tileId, attacker)
        )) % WAD;
    }

    function _winningWordFor(uint64 tick, uint64 tileId, address attacker)
        internal pure returns (uint256 w)
    {
        // p is always > 0.3 in these fixtures; roll < 0.25 guarantees a win
        while (_roll(w, tick, tileId, attacker) >= WAD / 4) w++;
    }

    function _losingWordFor(uint64 tick, uint64 tileId, address attacker)
        internal pure returns (uint256 w)
    {
        // p is always < 0.75 in these fixtures; roll >= 0.75 guarantees a hold
        while (_roll(w, tick, tileId, attacker) < (3 * WAD) / 4) w++;
    }

    function _winningWordForBoth(
        uint64 tick, uint64 tileId, address a1, address a2
    ) internal pure returns (uint256 w) {
        while (
            _roll(w, tick, tileId, a1) >= WAD / 4
                || _roll(w, tick, tileId, a2) >= WAD / 4
        ) w++;
    }
}
