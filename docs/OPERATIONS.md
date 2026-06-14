# OPERATIONS — handoff & operator context

Durable, **non-secret** operational context for Holdfast, committed to the repo
so it travels with `git clone` to any machine (a VPS, a fresh checkout, a new
Claude Code session). Secrets never live here — only the facts you need to
operate. (This mirrors the operator notes that are otherwise machine-local.)

> **Secrets** stay in `~/holdfast/` (gm.env, keys.env, keystore, state/), chmod
> 600, **never committed**. Recreate them on each machine per
> [PLAYTEST.md §1](PLAYTEST.md). Keys here are throwaway testnet wallets.

## Where to start

| You want to… | Read |
|---|---|
| Stand up the live testnet (VPS, always-on) | [DEPLOY_TESTNET.md](DEPLOY_TESTNET.md) |
| Run a playtest session + onboard friends | [PLAYTEST.md](PLAYTEST.md) |
| Understand the public agent arena | [AGENT_PROTOCOL.md](AGENT_PROTOCOL.md) |
| See deployed addresses / genesis | [DEPLOYMENTS.md](DEPLOYMENTS.md) |
| Know the phase plan + what's gated | [ROADMAP.md](ROADMAP.md) |

## Current state (2026-06-13)

Working prototype, proven end-to-end on Base Sepolia. The **public agent arena
is built and e2e-verified** (`gm/test/e2e-agent.test.ts`, 78 tests): self-custody
agents `POST /intent` an EIP-712-signed move → merged into the tick batch →
settled on-chain; `POST /faucet` self-funds escrow; GM narration decoupled from
resolution; GM compute metered in Flux and the sink burned on-chain. The
**SDK is published**: `@holdfastfdn/agent-sdk` on npm. Production-testnet deploy
artifacts are ready (`gm/deploy/`). No contract changes were needed.

**The one thing left is non-code: run the Phase-4 closed playtest** — does it
feel *fun* and stay economically balanced with real players? Everything
technical is done.

## Service & env

- Runs via `gm/scripts/run-bot.sh` (sources `~/holdfast/gm.env`, then
  `npx tsx src/index.ts`). On a VPS: the `holdfast-gm` systemd unit.
- Currently the live `@holdfast_gmbot` runs as a background process on a WSL box
  (dies on sleep). The always-on move is the VPS + systemd in DEPLOY_TESTNET.md.
- Env vars for the arena (full list in index.ts header / PLAYTEST.md §1):
  `AGENT_API_PORT` gates the arena · `OWNER_PK`+`FAUCET_FLUX` enable `/faucet` ·
  `COMPUTE_FLUX_PER_1K_TOKENS` · `TREASURY_PK`+`FLUX_ADDRESS` enable the on-chain
  compute-sink burn · use a **dedicated `RPC_URL`** (public sepolia.base.org
  caps `eth_getLogs` to 2000 blocks).
- Tick: manual (`touch ~/holdfast/tick.trigger`), or `TICK_INTERVAL_MS`, or the
  `holdfast-tick.timer` systemd unit. Four role wallets (owner/operator/
  provider/treasury) each need Sepolia ETH; the treasury also needs Flux.

## Hermes (the GM brain)

Nous inference API (OpenAI-compatible). The account currently has **no credits**
→ runs a slow free model. To use Opus: add credits at portal.nousresearch.com
and set `HERMES_MODEL`. External agents run their **own** Hermes off-server, so
they cost the operator ~nothing (a sig-verify + a read) — the compute meter
captures only operator-borne GM compute (parsing, narration, server factions).

## npm publishing

Package: **`@holdfastfdn/agent-sdk`** (`sdk/`). Gotchas:
- The npm **org is `holdfastfdn`** (no hyphen), so the scope is `@holdfastfdn`,
  **not** `@holdfast` (unowned → 404).
- Publishing requires a token with **bypass-2FA** even though the account has no
  2FA (web login alone is rejected) — use a **Classic Automation** token.
- Build + publish: `cd sdk && npm install && npm run build && npm publish --access public`.

## Decisions on record

- **Compute-sink funding = operator treasury** (testnet). Chosen over a
  contract-skim or charging agents' escrow to avoid touching the audit-grade
  settlement contract. An on-chain protocol skim to fund the treasury
  economically is a **deferred, contract-level** concern (post-playtest).
- **Self-custody for the arena** — agents hold their own keys and sign their own
  moves; the operator can censor but never forge. No contract change (the
  custody boundary was always swappable; `gm/src/signer.ts`).

## Hard gates before ANY real value (ROADMAP Phase 6 — "only if Phase 4 succeeds")

Do **not** go to mainnet/value before all of these:
1. Chainlink VRF v2.5 adapter (AUDIT.md M-2) — set as `randomnessProvider`, no
   settlement change; write against current Chainlink Base docs at deploy time.
2. External security audit (settlement holds funds = highest-audit-surface).
3. Reviewed token distribution to replace the centralized `enroll` faucet.
4. Real key management — KMS/HSM, multisig owner/operator, rotation procedures.

## Standing reminders

- Treat the deployed contracts + on-chain state as **LIVE** — never
  redeploy/reset without a deliberate decision (it erases playtest history).
- Verify the bot is actually running before assuming it is (Hermes cron is
  known-flaky; rely on systemd `Restart=always` + a `/health` uptime check).
- Rotate any access token that was shared in a chat.
