# DEPLOYMENTS

## Base Sepolia (testnet) — 2026-06-12

| Contract | Address |
|---|---|
| FluxToken | [`0xEf3c26E66c5B8b23EE26C70b78172D086a41d665`](https://sepolia.basescan.org/address/0xEf3c26E66c5B8b23EE26C70b78172D086a41d665) |
| HoldfastSettlement | [`0x68C2Ef4544aA0071ebC98bD7bdAb958C11C3Af49`](https://sepolia.basescan.org/address/0x68C2Ef4544aA0071ebC98bD7bdAb958C11C3Af49) |

| Role | Address |
|---|---|
| owner (deploy/genesis/enroll) | `0xeAC4c9057745A60698AC6B325A01A5F47d7c35e4` |
| operator (openTick/settleTick) | `0xBc5445F37f0EE2FF0aE948fBc2d1a46aaf26fc3F` |
| randomnessProvider (fulfillWord, testnet EOA) | `0x8958437C90Eb12113C1C221922b79529d50B315e` |

Keys live OUTSIDE the repo (`~/holdfast/keys.env`, mode 600) on the
operator machine. Throwaway testnet wallets — regenerate with real key
management before anything carries value.

## Region 0 — "The Sundered Isles" (genesis)

- 9 tiles, ALL wilds at genesis (owner `address(0)`, garrison 60, mod 1.0)
  — playtest players start landless with enrolled escrow and take their
  first isle from the wilds.
- Params: BALANCE.md rev2 — δ=1.3, γ=β=0.3, yield=4, regen=2, cap=200,
  minCommit=20 (all WAD).
- Genesis Flux supply: 540 (= 9 × 60 escrowed garrisons). Verified.

## Live companion

```
ui/holdfast-isles.html?rpc=https%3A%2F%2Fsepolia.base.org&settlement=0x68C2Ef4544aA0071ebC98bD7bdAb958C11C3Af49&region=0
```

Add `&me=0x...` (gold highlight) and `&names=0xabc:alice,0xdef:bob` for
the playtest roster.

## End-to-end verified on Base Sepolia — 2026-06-12

Drove a real tick through the actual GM service modules (not bespoke code)
with `gm/scripts/live-tick.ts`: two custodial players spoke NL → parser →
intent pool → EIP-712 signatures → `TickScheduler` (Bucket-2 root +
openTick/fulfillWord/settleTick via `TickDriver`+`ViemChainOps`).

- Settle tx: [`0xad2c…c92dd`](https://sepolia.basescan.org/tx/0xad2c3494287cb833fdc8f648d8194043b46b27db52550b0b49ea344b5c7c92dd)
- Both attacks lost on honest randomness (alice p=51.7% rolled 93.1%;
  bob p=49.4% rolled 58.7%). Economy moved exactly as the spec predicts:
  minted 18 (regen 2×9), burned 220 (both full commits) → supply
  540 → 838. Re-derived from chain via `gm/scripts/replay-summary.ts`.
- Companion renders the deployed world live (wilds at garrison 62, real
  war log) from the public RPC.

RPC lesson baked into the readers: Base's public `eth_getLogs` caps at a
2000-block range, so the summary reader and the companion war-log read
only the recent window (history → indexer, Phase 5). Read-after-write lag
on the load-balanced public RPC is handled by polling for the TickSettled
event before narrating.

## Operational checklist (to start the playtest)

1. `enroll([players], 250e18)` as owner once the roster is known.
2. Run the GM service (`gm/README.md`) with `SETTLEMENT_ADDRESS`,
   `OPERATOR_PK`, `PROVIDER_PK`, the Telegram bot token, and a daily
   `TICK_INTERVAL_MS`.
3. Watch AUDIT.md M-2: the EOA provider is testnet-only; a verifying VRF
   adapter is mandatory before value.
