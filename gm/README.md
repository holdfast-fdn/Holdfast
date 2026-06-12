# Holdfast GM service

The off-chain half of "GM proposes, chain disposes". Nothing in this
package can decide an outcome — it translates language into signed
intents, drives the tick, and (next) narrates what the chain already
decided.

## Modules

| File | Role |
|---|---|
| `src/parser.ts` | NL → structured intent. `RuleBasedParser` (deterministic, tested) + `HermesParser` adapter slot. The test set in `test/parser.test.ts` is the acceptance bar ANY parser must pass — run it against Hermes before wiring it in. |
| `src/signer.ts` | Custodial session wallets (TESTNET ONLY) + EIP-712 intent signing. Telegram players get a generated key; every intent is still signed, so the operator can censor but never forge. Keystore lives outside the repo; never commit keys. |
| `src/batch.ts` | Normative batch order (ascending tile, descending commit) + `batchHash` — must match `keccak256(abi.encode(...))` in the contract (proven by the e2e test). |
| `src/driver.ts` | `TickDriver`: resumable commit → word → settle state machine. Persists every phase, retries every call, never double-submits, refuses silent batch swaps, and publishes a verifiable input bundle per settled tick. Built for unreliable cron (CLAUDE.md Hermes note). |
| `src/chain.ts` | viem-backed `ChainOps` + Foundry artifact loader. |

## Test

```bash
cd ../contracts && forge build   # artifacts for the e2e test
cd ../gm
npm test                         # 28 tests, incl. full NL→chain e2e on anvil
```

The e2e test boots an anvil node, deploys the real contracts, and runs the
Phase-3 exit-criterion path: chat command → intent → custodial signature →
openTick → word → settleTick → asserted conquest and escrow math →
duplicate-cron idempotency.

## Not here yet (Phase 3 remainder)

- Telegram bot surface (`@HoldfastGM`) — message plumbing in/out.
- Hermes Agent wiring: `HermesParser` (validate against the parser test
  set) and the narrative layer (Bucket 3 — narrate, never decide).
- Bucket-2 root: currently a placeholder constant; compute it from the
  published modifier state once modifiers become GM-driven.
- A scheduler invoking `TickDriver.runTick` (cron + the built-in resume
  makes duplicate/missed fires safe).
