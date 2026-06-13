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

## Operational checklist (to start the playtest)

1. `enroll([players], 250e18)` as owner once the roster is known.
2. Run the GM service (`gm/README.md`) with `SETTLEMENT_ADDRESS`,
   `OPERATOR_PK`, `PROVIDER_PK`, the Telegram bot token, and a daily
   `TICK_INTERVAL_MS`.
3. Watch AUDIT.md M-2: the EOA provider is testnet-only; a verifying VRF
   adapter is mandatory before value.
