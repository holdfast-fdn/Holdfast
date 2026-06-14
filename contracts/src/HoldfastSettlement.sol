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

    /// @dev EIP-712 typed intent — what a player actually authorizes.
    bytes32 public constant INTENT_TYPEHASH = keccak256(
        "Intent(uint256 regionId,uint64 tick,uint64 tileId,uint256 committed)"
    );
    /// @dev secp256k1 group order / 2 — reject malleable high-s signatures.
    uint256 internal constant SECP256K1_HALF_N =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    bytes32 public immutable DOMAIN_SEPARATOR;

    FluxToken public immutable flux;
    /// @notice admin: region genesis + operator rotation. NOT able to touch
    ///         escrow or outcomes.
    address public immutable owner;
    /// @notice tick driver (the Hermes-side service wallet).
    address public operator;
    /// @notice sole source of tick randomness. Testnet: a trusted EOA.
    ///         Production: a VRF consumer contract (e.g. Chainlink VRF v2.5
    ///         adapter) that forwards verified words — swap is pure config.
    address public randomnessProvider;

    /// @dev one tick in flight per region: the operator must commit the
    ///      batch hash BEFORE the random word exists, so the word can never
    ///      influence which contests are included (no post-word censorship,
    ///      no outcome shopping by exclusion).
    struct PendingTick {
        uint64 tick;
        bool open;
        bool wordSet;
        uint32 reopens;   // public grinding counter — honest ops stay at 0
        bytes32 batchHash;
        uint256 word;
    }
    mapping(uint256 regionId => PendingTick) public pending;

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

    /// @dev The attacker's EIP-712 signature binds (regionId, tick, tileId,
    ///      committed) — the funds-at-risk facts — so the operator can censor
    ///      intents but can never FORGE one. `attackerMod` is deliberately
    ///      outside the signature: it is GM-computed Bucket-2 state known
    ///      only at tick close, and inflating it helps (never hurts) the
    ///      signer; its accountability channel is `bucket2Root`.
    struct ContestInput {
        uint64 tileId;
        address attacker;
        uint256 committed;
        uint256 attackerMod; // Bucket-2 modifier; committed via bucket2Root
        uint8 sigV;
        bytes32 sigR;
        bytes32 sigS;
    }

    /// @dev state-dependent skip reasons (player behavior between signing
    ///      and settlement must never revert the whole region's tick).
    enum SkipReason {
        SelfAttack,         // attacker already owns the tile at resolution
        DuplicateAttacker,  // same attacker appears twice for one tile
        InsufficientEscrow  // escrow drained after the intent was signed
    }

    mapping(uint256 regionId => Region) public regions;
    mapping(uint256 regionId => mapping(uint256 tileId => Tile)) public tiles;
    /// @notice player escrow; only deposits/withdrawals and settlement move it.
    mapping(address => uint256) public escrow;

    event Deposited(address indexed player, uint256 amount);
    event Withdrawn(address indexed player, uint256 amount);
    event Enrolled(address indexed player, uint256 startingEscrow);
    event RegionCreated(uint256 indexed regionId, uint64 tileCount);
    event OperatorSet(address indexed operator);
    event RandomnessProviderSet(address indexed provider);
    event TickOpened(
        uint256 indexed regionId, uint64 indexed tick, bytes32 batchHash);
    event TickReopened(
        uint256 indexed regionId, uint64 indexed tick, uint32 reopens);
    event WordFulfilled(
        uint256 indexed regionId, uint64 indexed tick, uint256 word);
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
    event ContestSkipped(
        uint256 indexed regionId,
        uint64 indexed tick,
        uint64 tileId,
        address indexed attacker,
        SkipReason reason
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
    error CommitTooSmall();
    error TransferFailed();
    error BadSignature();
    error NotProvider();
    error TickNotOpen();
    error WordAlreadySet();
    error WordNotSet();
    error BatchMismatch();

    constructor(FluxToken flux_) {
        if (address(flux_) == address(0)) revert ZeroAddress();
        flux = flux_;
        owner = msg.sender;
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256(
                "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
            ),
            keccak256(bytes("Holdfast")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
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

    function setRandomnessProvider(address provider_) external {
        if (msg.sender != owner) revert NotOwner();
        if (provider_ == address(0)) revert ZeroAddress();
        randomnessProvider = provider_;
        emit RandomnessProviderSet(provider_);
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

    /// @notice TESTNET onboarding: the owner credits starting escrow to new
    ///         players (minted supply). This is a deliberate centralized
    ///         faucet for the Phase-4 closed playtest ONLY — any deployment
    ///         where Flux carries value must replace it with a reviewed
    ///         distribution. It cannot touch existing balances — only add new,
    ///         publicly-evented supply.
    function enroll(address[] calldata players, uint256 startingEscrow)
        external
    {
        if (msg.sender != owner) revert NotOwner();
        for (uint256 i = 0; i < players.length; i++) {
            if (players[i] == address(0)) revert ZeroAddress();
            escrow[players[i]] += startingEscrow;
            emit Enrolled(players[i], startingEscrow);
        }
        flux.mint(address(this), players.length * startingEscrow);
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
    // the tick: commit batch -> draw randomness -> settle
    // ------------------------------------------------------------------
    /// @notice Step 1 — commit the tick's batch hash BEFORE any randomness
    ///         exists. Reopening (a different batch after a word was already
    ///         drawn) voids the word, requires a fresh draw, and increments a
    ///         public counter — an honest operator's counter stays at zero,
    ///         so grinding attempts are visible to everyone.
    function openTick(uint256 regionId, uint64 tick, bytes32 batchHash)
        external
    {
        if (msg.sender != operator) revert NotOperator();
        Region storage region = regions[regionId];
        if (!region.exists) revert RegionMissing();
        if (tick != region.lastTick + 1) revert WrongTick();

        PendingTick storage pt = pending[regionId];
        if (pt.open && pt.wordSet) {
            pt.reopens += 1;
            emit TickReopened(regionId, tick, pt.reopens);
        }
        pt.tick = tick;
        pt.open = true;
        pt.wordSet = false;
        pt.batchHash = batchHash;
        pt.word = 0;
        emit TickOpened(regionId, tick, batchHash);
    }

    /// @notice Step 2 — the randomness provider delivers the tick word.
    ///         One word per opened batch; immutable once set.
    function fulfillWord(uint256 regionId, uint64 tick, uint256 word)
        external
    {
        if (msg.sender != randomnessProvider) revert NotProvider();
        PendingTick storage pt = pending[regionId];
        if (!pt.open || pt.tick != tick) revert TickNotOpen();
        if (pt.wordSet) revert WordAlreadySet();
        pt.wordSet = true;
        pt.word = word;
        emit WordFulfilled(regionId, tick, word);
    }

    /// @notice Step 3 — settle: emission first, then every contest,
    ///         mirroring `sim/world_sim.py` phase order. The submitted batch
    ///         must hash to the pre-randomness commitment.
    /// @dev Batch ordering is normative and enforced: ascending tileId,
    ///      descending committed within a tile (the spec's collision rule).
    ///      Per-contest randomness is derived from the tick word so no two
    ///      contests share a roll and the batch cannot be reordered to
    ///      change outcomes.
    function settleTick(
        uint256 regionId,
        uint64 tick,
        bytes32 bucket2Root,
        ContestInput[] calldata contests
    ) external {
        if (msg.sender != operator) revert NotOperator();
        Region storage region = regions[regionId];
        if (!region.exists) revert RegionMissing();
        if (tick != region.lastTick + 1) revert WrongTick();

        PendingTick storage pt = pending[regionId];
        if (!pt.open || pt.tick != tick) revert TickNotOpen();
        if (!pt.wordSet) revert WordNotSet();
        if (keccak256(abi.encode(contests)) != pt.batchHash) {
            revert BatchMismatch();
        }
        uint256 randomWord = pt.word;
        delete pending[regionId];
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

    /// @dev STRUCTURAL faults (bad ordering, bounds, size, signature) are the
    ///      operator's responsibility and revert the batch. STATE-dependent
    ///      conditions (escrow drained after signing, self-attack arising
    ///      from earlier contests this tick, duplicates) are skipped with an
    ///      event — otherwise any single player could grief the entire
    ///      region's settlement by withdrawing after committing.
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
            _verifyIntent(regionId, tick, c);

            // duplicate attacker within this tile's group: skip later entries
            // (the batch is sorted, so a tile's group is contiguous)
            if (_isDuplicate(contests, i)) {
                emit ContestSkipped(regionId, tick, c.tileId, c.attacker,
                    SkipReason.DuplicateAttacker);
                continue;
            }

            Tile storage tile = tiles[regionId][c.tileId];
            address defender = tile.owner;
            if (c.attacker == defender) {
                emit ContestSkipped(regionId, tick, c.tileId, c.attacker,
                    SkipReason.SelfAttack);
                continue;
            }
            if (escrow[c.attacker] < c.committed) {
                emit ContestSkipped(regionId, tick, c.tileId, c.attacker,
                    SkipReason.InsufficientEscrow);
                continue;
            }
            // the stake leaves the attacker's escrow now
            unchecked {
                escrow[c.attacker] -= c.committed; // checked above
            }

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

    /// @dev The attacker must have signed (regionId, tick, tileId, committed)
    ///      under this contract's EIP-712 domain. Rejects malleable high-s
    ///      and invalid v values.
    function _verifyIntent(
        uint256 regionId,
        uint64 tick,
        ContestInput calldata c
    ) internal view {
        if (uint256(c.sigS) > SECP256K1_HALF_N) revert BadSignature();
        if (c.sigV != 27 && c.sigV != 28) revert BadSignature();
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(
                INTENT_TYPEHASH, regionId, tick, c.tileId, c.committed
            ))
        ));
        address recovered = ecrecover(digest, c.sigV, c.sigR, c.sigS);
        if (recovered == address(0) || recovered != c.attacker) {
            revert BadSignature();
        }
    }

    /// @dev true if the same attacker already appeared for this tile earlier
    ///      in the batch (groups are contiguous because the batch is sorted).
    function _isDuplicate(ContestInput[] calldata contests, uint256 i)
        internal pure returns (bool)
    {
        uint64 tileId = contests[i].tileId;
        address attacker = contests[i].attacker;
        for (uint256 j = i; j > 0;) {
            j--;
            if (contests[j].tileId != tileId) break;
            if (contests[j].attacker == attacker) return true;
        }
        return false;
    }
}
