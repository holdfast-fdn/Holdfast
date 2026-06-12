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
    address alice;
    uint256 aliceKey;
    address bob;
    uint256 bobKey;
    address mallory;
    uint256 malloryKey;

    uint256 constant REGION = 0;
    uint64 constant TILES = 9;

    function setUp() public {
        (alice, aliceKey) = makeAddrAndKey("alice");
        (bob, bobKey) = makeAddrAndKey("bob");
        (mallory, malloryKey) = makeAddrAndKey("mallory");
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

    /// @dev build a properly signed intent for the key's address
    function _signed(uint64 tick, uint64 tileId, uint256 pk, uint256 committed)
        internal view returns (HoldfastSettlement.ContestInput memory ci)
    {
        bytes32 digest = _intentDigest(tick, tileId, committed);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        ci = HoldfastSettlement.ContestInput({
            tileId: tileId,
            attacker: vm.addr(pk),
            committed: committed,
            attackerMod: WAD,
            sigV: v,
            sigR: r,
            sigS: s
        });
    }

    function _intentDigest(uint64 tick, uint64 tileId, uint256 committed)
        internal view returns (bytes32)
    {
        return keccak256(abi.encodePacked(
            "\x19\x01",
            st.DOMAIN_SEPARATOR(),
            keccak256(abi.encode(
                st.INTENT_TYPEHASH(), REGION, tick, tileId, committed
            ))
        ));
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
        cs[0] = _signed(1, 5, aliceKey, 30 * WAD);
        cs[1] = _signed(1, 5, bobKey, 40 * WAD);
        vm.prank(operator);
        vm.expectRevert(HoldfastSettlement.BatchNotSorted.selector);
        st.settleTick(REGION, 1, 0, 0, cs);

        // descending tileIds — violates ascending-tile rule
        cs[0] = _signed(1, 6, aliceKey, 30 * WAD);
        cs[1] = _signed(1, 5, bobKey, 40 * WAD);
        vm.prank(operator);
        vm.expectRevert(HoldfastSettlement.BatchNotSorted.selector);
        st.settleTick(REGION, 1, 0, 0, cs);
    }

    function test_structural_guards_revert() public {
        HoldfastSettlement.ContestInput[] memory cs =
            new HoldfastSettlement.ContestInput[](1);

        cs[0] = _signed(1, 99, aliceKey, 30 * WAD); // no such tile
        vm.prank(operator);
        vm.expectRevert(HoldfastSettlement.BadTileId.selector);
        st.settleTick(REGION, 1, 0, 0, cs);

        cs[0] = _signed(1, 5, aliceKey, 19 * WAD); // below minCommit
        vm.prank(operator);
        vm.expectRevert(HoldfastSettlement.CommitTooSmall.selector);
        st.settleTick(REGION, 1, 0, 0, cs);
    }

    function test_forged_intent_reverts() public {
        HoldfastSettlement.ContestInput[] memory cs =
            new HoldfastSettlement.ContestInput[](1);

        // operator tries to commit ALICE's escrow with BOB's signature
        cs[0] = _signed(1, 5, bobKey, 30 * WAD);
        cs[0].attacker = alice;
        vm.prank(operator);
        vm.expectRevert(HoldfastSettlement.BadSignature.selector);
        st.settleTick(REGION, 1, 0, 0, cs);

        // tampered amount: signed 30, submitted 200 (>= minCommit)
        cs[0] = _signed(1, 5, aliceKey, 30 * WAD);
        cs[0].committed = 200 * WAD;
        vm.prank(operator);
        vm.expectRevert(HoldfastSettlement.BadSignature.selector);
        st.settleTick(REGION, 1, 0, 0, cs);

        // garbage v
        cs[0] = _signed(1, 5, aliceKey, 30 * WAD);
        cs[0].sigV = 26;
        vm.prank(operator);
        vm.expectRevert(HoldfastSettlement.BadSignature.selector);
        st.settleTick(REGION, 1, 0, 0, cs);
    }

    function test_intent_cannot_replay_another_tick() public {
        // a signature for tick 1 must be useless at tick 2
        HoldfastSettlement.ContestInput[] memory signedForTick1 =
            new HoldfastSettlement.ContestInput[](1);
        signedForTick1[0] = _signed(1, 5, aliceKey, 30 * WAD);

        _settle(1, 0, _none());
        vm.prank(operator);
        vm.expectRevert(HoldfastSettlement.BadSignature.selector);
        st.settleTick(REGION, 2, 0, 0, signedForTick1);
    }

    function test_state_conditions_skip_not_revert() public {
        // mallory signed honestly but has zero escrow; alice's contest in
        // the same batch must still settle — no single player can grief the
        // region's tick
        HoldfastSettlement.ContestInput[] memory cs =
            new HoldfastSettlement.ContestInput[](2);
        cs[0] = _signed(1, 4, malloryKey, 30 * WAD);
        cs[1] = _signed(1, 5, aliceKey, 120 * WAD);

        uint256 word = _winningWordFor(1, 5, alice);
        vm.expectEmit(true, true, false, true);
        emit HoldfastSettlement.ContestSkipped(
            REGION, 1, 4, mallory,
            HoldfastSettlement.SkipReason.InsufficientEscrow);
        _settle(1, word, cs);

        (address tOwner,,) = st.tiles(REGION, 5);
        assertEq(tOwner, alice, "alice's contest must still settle");
        assertEq(st.escrow(mallory), 0);
        _assertSolvent();
    }

    function test_self_attack_skips() public {
        HoldfastSettlement.ContestInput[] memory cs =
            new HoldfastSettlement.ContestInput[](1);
        cs[0] = _signed(1, 0, aliceKey, 30 * WAD); // alice owns tile 0

        vm.expectEmit(true, true, false, true);
        emit HoldfastSettlement.ContestSkipped(
            REGION, 1, 0, alice, HoldfastSettlement.SkipReason.SelfAttack);
        _settle(1, 0, cs);

        // nothing deducted beyond the yield she earned
        assertEq(st.escrow(alice), 254 * WAD);
        _assertSolvent();
    }

    function test_duplicate_attacker_skips_second() public {
        // two valid alice intents on one tile: only the larger settles
        HoldfastSettlement.ContestInput[] memory cs =
            new HoldfastSettlement.ContestInput[](2);
        cs[0] = _signed(1, 5, aliceKey, 40 * WAD);
        cs[1] = _signed(1, 5, aliceKey, 30 * WAD);

        uint256 word = _losingWordFor(1, 5, alice); // hold, simpler math
        vm.expectEmit(true, true, false, true);
        emit HoldfastSettlement.ContestSkipped(
            REGION, 1, 5, alice,
            HoldfastSettlement.SkipReason.DuplicateAttacker);
        _settle(1, word, cs);

        // start + yield - one 40 commit (30% of which burns vs the wilds)
        assertEq(st.escrow(alice), (250 + 4 - 40) * WAD);
        _assertSolvent();
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
        cs[0] = _signed(1, 5, aliceKey, 120 * WAD);

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
        cs[0] = _signed(1, 0, bobKey, 100 * WAD);

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
        cs[0] = _signed(1, 5, bobKey, 40 * WAD);

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
        cs[0] = _signed(1, 5, aliceKey, 120 * WAD);
        cs[1] = _signed(1, 5, bobKey, 80 * WAD);

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
