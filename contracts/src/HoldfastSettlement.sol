// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ResolverLib} from "./ResolverLib.sol";
import {FluxToken} from "./FluxToken.sol";

/// @title HoldfastSettlement — per-tick settlement, escrow, and tile registry
/// @notice One tick = ONE transaction per region. Players never pay
///         per-action gas: intents are signed off-chain; at tick close the
///         operator submits the batch and this contract — never the GM —
///         decides who gets what via ResolverLib.
///
///         Trust model (MVP, ROADMAP Phase 2): trusted-but-verifiable.
///         The operator chooses WHICH contests enter the batch and supplies
///         the Bucket-2 modifiers and VRF word, all committed in calldata +
///         `bucket2Root` so anyone can recompute the tick and catch fraud;
///         outcome math itself is computed on-chain and cannot be faked.
///         Fraud proofs and real VRF integration are deliberate deferrals.
///
///         Escrow semantics: a garrison is REAL Flux held by this contract —
///         a winning commit becomes the garrison; spoils and burns draw from
///         it. Garrison regen is therefore minted supply (see BALANCE.md
///         rev2). Invariant: flux.balanceOf(this) == Σ playerEscrow +
///         Σ garrisons (fuzz-tested).
contract HoldfastSettlement {
    uint256 internal constant WAD = 1e18;

    FluxToken public immutable flux;
    /// @notice admin: region genesis + operator rotation. NOT able to touch
    ///         escrow or outcomes.
    address public immutable owner;
    /// @notice tick driver (the Hermes-side service wallet).
    address public operator;

    struct RegionParams {
        uint256 delta;         // defender advantage, WAD
        uint256 gamma;         // spoils ratio, WAD
        uint256 beta;          // defend reward, WAD
        uint256 yieldPerTile;  // emission per owned tile per tick
        uint256 garrisonRegen; // minted into each garrison per tick (to cap)
        uint256 garrisonCap;
        uint256 minCommit;
    }

    /// @dev a region/continent is CONFIG, not hardcode (ADR-001).
    struct Region {
        uint64 tileCount;
        uint64 lastTick;
        bool exists;
        RegionParams params;
    }

    /// @dev owner == address(0) means the wilds ("nature") hold the tile.
    struct Tile {
        address owner;
        uint256 garrison; // escrowed Flux
        uint256 modWad;   // terrain modifier (Bucket 2, fixed at genesis)
    }

    struct ContestInput {
        uint64 tileId;
        address attacker;
        uint256 committed;
        uint256 attackerMod; // Bucket-2 modifier; committed via bucket2Root
    }

    mapping(uint256 regionId => Region) public regions;
    mapping(uint256 regionId => mapping(uint256 tileId => Tile)) public tiles;
    /// @notice player escrow; only deposits/withdrawals and settlement move it.
    mapping(address => uint256) public escrow;

    event Deposited(address indexed player, uint256 amount);
    event Withdrawn(address indexed player, uint256 amount);
    event RegionCreated(uint256 indexed regionId, uint64 tileCount);
    event OperatorSet(address indexed operator);
    event ContestSettled(
        uint256 indexed regionId,
        uint64 indexed tick,
        uint64 tileId,
        address indexed attacker,
        address defender,
        bool attackerWon,
        uint256 pWad,
        uint256 roll,
        uint256 burned
    );
    event TickSettled(
        uint256 indexed regionId,
        uint64 indexed tick,
        uint256 randomWord,
        bytes32 bucket2Root,
        uint256 minted,
        uint256 burned
    );

    error NotOwner();
    error NotOperator();
    error ZeroAddress();
    error RegionExists();
    error RegionMissing();
    error LengthMismatch();
    error WrongTick();
    error BadTileId();
    error BatchNotSorted();
    error SelfAttack();
    error CommitTooSmall();
    error TransferFailed();

    constructor(FluxToken flux_) {
        if (address(flux_) == address(0)) revert ZeroAddress();
        flux = flux_;
        owner = msg.sender;
    }

    // ------------------------------------------------------------------
    // admin
    // ------------------------------------------------------------------
    function setOperator(address operator_) external {
        if (msg.sender != owner) revert NotOwner();
        if (operator_ == address(0)) revert ZeroAddress();
        operator = operator_;
        emit OperatorSet(operator_);
    }

    /// @notice Region genesis. Initial garrisons are minted into escrow here
    ///         (they are real tokens the moment they exist).
    function createRegion(
        uint256 regionId,
        RegionParams calldata params,
        address[] calldata owners,
        uint256[] calldata garrisons,
        uint256[] calldata mods
    ) external {
        if (msg.sender != owner) revert NotOwner();
        if (regions[regionId].exists) revert RegionExists();
        uint256 n = owners.length;
        // MVP scale guard: a region is ~9 tiles; 65535 is an absurd ceiling
        // that also makes the uint64 narrowing provably lossless.
        if (n == 0 || n > 65535 || garrisons.length != n || mods.length != n) {
            revert LengthMismatch();
        }
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 tileCount = uint64(n); // safe: n <= 65535 checked above

        regions[regionId] = Region({
            tileCount: tileCount,
            lastTick: 0,
            exists: true,
            params: params
        });

        uint256 minted = 0;
        for (uint256 i = 0; i < n; i++) {
            tiles[regionId][i] =
                Tile({owner: owners[i], garrison: garrisons[i], modWad: mods[i]});
            minted += garrisons[i];
        }
        if (minted > 0) flux.mint(address(this), minted);
        emit RegionCreated(regionId, tileCount);
    }

    // ------------------------------------------------------------------
    // player escrow
    // ------------------------------------------------------------------
    function deposit(uint256 amount) external {
        escrow[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
        // FluxToken is hook-free; transferFrom cannot reenter.
        if (!flux.transferFrom(msg.sender, address(this), amount)) {
            revert TransferFailed();
        }
    }

    function withdraw(uint256 amount) external {
        escrow[msg.sender] -= amount; // checked: reverts on insufficient
        emit Withdrawn(msg.sender, amount);
        if (!flux.transfer(msg.sender, amount)) revert TransferFailed();
    }

    // ------------------------------------------------------------------
    // the tick
    // ------------------------------------------------------------------
    /// @notice Settle one tick for one region — emission first, then every
    ///         contest, mirroring `sim/world_sim.py` phase order.
    /// @dev Batch ordering is normative and enforced: ascending tileId,
    ///      descending committed within a tile (the spec's collision rule).
    ///      Per-contest randomness is derived from the tick word so no two
    ///      contests share a roll and the batch cannot be reordered to
    ///      change outcomes.
    function settleTick(
        uint256 regionId,
        uint64 tick,
        uint256 randomWord,
        bytes32 bucket2Root,
        ContestInput[] calldata contests
    ) external {
        if (msg.sender != operator) revert NotOperator();
        Region storage region = regions[regionId];
        if (!region.exists) revert RegionMissing();
        if (tick != region.lastTick + 1) revert WrongTick();
        region.lastTick = tick;

        RegionParams memory p = region.params;
        uint256 minted = _phaseEmission(regionId, region.tileCount, p);
        uint256 burned = _phaseContests(regionId, tick, randomWord, p, contests);

        if (minted > 0) flux.mint(address(this), minted);
        if (burned > 0) flux.burn(burned);
        emit TickSettled(regionId, tick, randomWord, bucket2Root, minted, burned);
    }

    /// @dev yield to tile owners + garrison regen toward the cap; both are
    ///      freshly minted supply.
    function _phaseEmission(
        uint256 regionId,
        uint64 tileCount,
        RegionParams memory p
    ) internal returns (uint256 minted) {
        for (uint256 t = 0; t < tileCount; t++) {
            Tile storage tile = tiles[regionId][t];
            if (tile.owner != address(0)) {
                escrow[tile.owner] += p.yieldPerTile;
                minted += p.yieldPerTile;
            }
            uint256 g = tile.garrison;
            if (g < p.garrisonCap && p.garrisonRegen > 0) {
                uint256 newG = g + p.garrisonRegen;
                if (newG > p.garrisonCap) newG = p.garrisonCap;
                minted += newG - g;
                tile.garrison = newG;
            }
        }
    }

    function _phaseContests(
        uint256 regionId,
        uint64 tick,
        uint256 randomWord,
        RegionParams memory p,
        ContestInput[] calldata contests
    ) internal returns (uint256 burned) {
        ResolverLib.Params memory rp =
            ResolverLib.Params({delta: p.delta, gamma: p.gamma, beta: p.beta});
        uint64 tileCount = regions[regionId].tileCount;

        for (uint256 i = 0; i < contests.length; i++) {
            ContestInput calldata c = contests[i];
            if (c.tileId >= tileCount) revert BadTileId();
            if (i > 0) {
                ContestInput calldata prev = contests[i - 1];
                bool ordered = c.tileId > prev.tileId
                    || (c.tileId == prev.tileId && c.committed <= prev.committed);
                if (!ordered) revert BatchNotSorted();
            }
            if (c.committed < p.minCommit) revert CommitTooSmall();

            Tile storage tile = tiles[regionId][c.tileId];
            address defender = tile.owner;
            if (c.attacker == defender) revert SelfAttack();

            // afford check: the stake leaves the attacker's escrow now
            escrow[c.attacker] -= c.committed; // checked: reverts if poor

            uint256 word = uint256(keccak256(
                abi.encodePacked(randomWord, regionId, tick, c.tileId, c.attacker)
            ));
            ResolverLib.Outcome memory o = ResolverLib.resolveContest(
                ResolverLib.Contest({
                    committed: c.committed,
                    attackerMod: c.attackerMod,
                    garrison: tile.garrison,
                    defenderMod: tile.modWad
                }),
                rp,
                word
            );

            if (o.attackerWon) {
                escrow[c.attacker] += o.toAttacker;
                tile.owner = c.attacker;
                tile.garrison = o.newGarrison; // == committed
            } else if (defender != address(0)) {
                escrow[defender] += o.toDefender;
            } else {
                // the wilds collect no reward — it burns with the rest
                burned += o.toDefender;
            }
            burned += o.burned;

            emit ContestSettled(
                regionId, tick, c.tileId, c.attacker, defender,
                o.attackerWon, o.pWad, o.roll, o.burned
            );
        }
    }
}
