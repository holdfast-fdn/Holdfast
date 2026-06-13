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

Config lives in an env file OUTSIDE the repo (never commit the bot token
or role keys); the launcher loads it:

```bash
# ~/holdfast/gm.env  (chmod 600)
TELEGRAM_BOT_TOKEN=...        # from @BotFather
RPC_URL=https://sepolia.base.org
SETTLEMENT_ADDRESS=0x...      # from docs/DEPLOYMENTS.md
REGION_ID=0
OPERATOR_PK=...  PROVIDER_PK=...
KEYSTORE_PATH=/home/you/holdfast/players.json   # OUTSIDE the repo
STATE_DIR=/home/you/holdfast/state
FROM_BLOCK=0                  # deployment block as a getLogs floor
ANNOUNCE_CHAT_ID=...          # game channel (only needed once ticks run)
TICK_INTERVAL_MS=0            # 0 = listen only; 86400000 = daily ticks

# --- Hermes Agent (optional) — the brain. Unset = deterministic stand-ins.
HERMES_BASE_URL=https://inference-api.nousresearch.com/v1   # any OpenAI-compatible
HERMES_API_KEY=...
HERMES_MODEL=...             # a Hermes model id served by the provider
HERMES_TIMEOUT_MS=12000

# --- AI factions (the world moves while you sleep)
#   key:Display Name:archetype  (archetype = raider|turtle|opportunist|balancer)
FACTIONS=ashen:Ashen Horde:raider,iron:Iron Pact:turtle
```

```bash
gm/scripts/run-bot.sh        # sources ~/holdfast/gm.env, starts @HoldfastGM
```

`TICK_INTERVAL_MS=0` makes the bot **listen and queue orders only** — ticks
are driven manually with `scripts/live-tick.ts` until the playtest roster
is enrolled; flip to `86400000` for daily ticks. (`setInterval` caps near
24.8 days, so longer cadences need a cron.)

### Onboarding a player (closed playtest)

1. The player messages @HoldfastGM — their custodial session wallet is
   created on first message and stored in `KEYSTORE_PATH` under `tg:<id>`.
2. The owner `enroll([thatAddress], 250e18)` (owner-only — the bot can't
   self-mint). Production onboarding/self-custody is still an open item.
3. Orders the player issues now settle against real escrow at tick close.

## The Hermes harness (the brain)

`src/hermes.ts` is an OpenAI-compatible client (works with the Nous
inference API, OpenRouter, or a local Hermes). Set the `HERMES_*` env and
the GM drives its three non-deterministic jobs with the LLM; unset, it runs
on the deterministic stand-ins. Each slot has the same two guards:

| Slot | Hermes does | Guard |
|---|---|---|
| `HermesParser` | NL → structured intent | validates the JSON; falls back to `RuleBasedParser`. Must pass the parser acceptance set before trusting. |
| `HermesNarrator` | the Herald's voice over the facts | the exact deterministic ledger line is always appended; falls back to `TemplateNarrator`. Narration is Bucket 3 — never an outcome. |
| `HermesFactionAgent` | choose a faction's move | the move is clamped to a legal tile + `[minCommit, escrow]`, then SIGNED as a normal intent; falls back to a `HeuristicFactionAgent`. |

Two invariants hold across all three (tested in `test/hermes.test.ts`):
**the LLM never decides an outcome** (it returns a proposal the chain
disposes — a jailbroken Hermes can still only choose where to commit), and
**a tick never blocks on the LLM** (timeout → deterministic fallback).

To enable: add the `HERMES_*` (and optionally `FACTIONS`) env and restart
`run-bot.sh`. The startup log says which brain is in play.

## Not here yet

- GM-driven Bucket-2 modifiers (reputation/terrain): plumbing exists
  (bucket2.ts); committed empty until the GM actually shapes them. The
  faction memory structure is ready for Hermes to fill.
- Production randomness: swap the EOA word provider for the VRF adapter
  (AUDIT.md M-2).
- Validate `HermesParser` against the acceptance set with a live endpoint
  before trusting it over the rules.
