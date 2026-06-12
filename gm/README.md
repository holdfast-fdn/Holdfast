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
| `src/chain.ts` | viem-backed `ChainOps`, Foundry artifact loader, and the event-based tick-summary reader (what the narrator is allowed to know). |
| `src/bot.ts` | `@HoldfastGM` Telegram surface. Injected transport (HTTP long-poll, no SDK) so the whole bot tests offline. Translates and queues; never touches outcomes. |
| `src/intentPool.ts` | Orders waiting for tick close; one per (player, tile), newest wins; atomic drain. |
| `src/bucket2.ts` | Bucket-2 commitment v1: canonical-JSON + keccak root of every outcome-determining modifier. Currently committed empty — the moment GM memory shapes a modifier, it enters here or not at all. |
| `src/scheduler.ts` | Tick close: drain pool → sign → bucket2Root → drive chain → read SETTLED events → narrate. Narration is structurally after-the-fact. |
| `src/narrator.ts` | Bucket 3. `TemplateNarrator` (deterministic war report) + `HermesNarrator` slot — any implementation takes outcome facts in, prose out, and may never contradict them. |
| `src/index.ts` | Composition root for the playtest — all config via env (see file header). |

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

## Run the playtest service

```bash
export TELEGRAM_BOT_TOKEN=...      # from @BotFather
export ANNOUNCE_CHAT_ID=...        # the game channel
export RPC_URL=https://sepolia.base.org
export SETTLEMENT_ADDRESS=0x...    # from the deploy script
export OPERATOR_PK=... PROVIDER_PK=...
export KEYSTORE_PATH=~/holdfast/keys.json   # OUTSIDE the repo
export STATE_DIR=~/holdfast/state
npx tsx src/index.ts
```

## Not here yet (Phase 3 remainder)

- Hermes Agent wiring: `HermesParser` (must pass the parser acceptance
  set) and `HermesNarrator` (must fact-check against TickSummary). Both
  slots exist with their guardrails documented.
- GM-driven Bucket-2 modifiers (reputation/terrain): plumbing exists
  (bucket2.ts); committed empty until the GM actually shapes them.
- Production randomness: swap the EOA word provider for the VRF adapter
  (AUDIT.md M-2).
