# Holdfast contracts

On-chain settlement for Holdfast. **GM proposes, chain disposes** — these
contracts are the "disposes" half: the GM never touches an outcome here.

## Contracts

| File | Role |
|---|---|
| `src/ResolverLib.sol` | Pure contest math. Bit-for-bit mirror of `sim/resolver_fixed.py` (the spec). |
| `src/FluxToken.sol` | Minimal ERC-20. Settlement is the sole minter; anyone burns their own balance. |
| `src/HoldfastSettlement.sol` | Escrow + tile registry + per-tick settlement. One tick = one settlement transaction per region. |

## The tick flow (commit → randomness → settle)

1. **`openTick(regionId, tick, batchHash)`** — operator commits the hash of
   the contest batch BEFORE any randomness exists. Reopening after a word
   was drawn voids the word and increments a public counter (an honest
   operator's counter stays at 0 — grinding is visible to everyone).
2. **`fulfillWord(regionId, tick, word)`** — the randomness provider
   delivers the tick word. Immutable once set.
3. **`settleTick(regionId, tick, bucket2Root, contests)`** — the batch must
   hash to the commitment. Emission first (yield + garrison regen, both
   minted), then contests resolved on-chain via ResolverLib. Every intent
   carries the player's EIP-712 signature: the operator can censor, never
   forge.

Per-contest randomness: `keccak256(word ‖ regionId ‖ tick ‖ tileId ‖ attacker)`.

## Build & test

```bash
forge build
forge test          # 26 tests: parity gates + fuzz properties + flows
```

The parity tests are GENERATED from the Python spec — never edit them by
hand. Regenerate after any spec change:

```bash
cd ../sim
python3 gen_parity_fixtures.py      # contest-math fixtures
python3 gen_settlement_parity.py    # 6-tick signed-war replay
```

## Deploy (Base Sepolia)

```bash
export OPERATOR=0x...              # tick-driver service wallet
export RANDOMNESS_PROVIDER=0x...   # testnet: trusted EOA
forge script script/Deploy.s.sol \
  --rpc-url base_sepolia --broadcast \
  --private-key "$PRIVATE_KEY"
```

Never put keys in this repo or any Hermes-loaded environment (CLAUDE.md).

Post-deploy, as owner:
1. `createRegion(regionId, params, owners, garrisons, mods)` — use the
   BALANCE.md rev2 params (δ=1.3e18, γ=β=3e17, yield=4e18, regen=2e18,
   cap=200e18, minCommit=20e18); 9 tiles, player homes once the roster is
   known, the rest `address(0)` (wilds).
2. `enroll(players, 250e18)` — testnet starting escrow (replace with a
   reviewed distribution before any value deployment).

## Production randomness

For any deployment where Flux has value, `randomnessProvider` must be a
verifying VRF consumer contract (recommended: Chainlink VRF v2.5 on Base)
that forwards `fulfillWord` from its callback. Write that adapter against
the CURRENT official Chainlink docs (coordinator address, key hash, request
ABI) at deploy time — do not trust memorized constants. The trust analysis
lives in `docs/AUDIT.md` (see M-2).
