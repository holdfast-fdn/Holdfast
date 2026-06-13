# Playtest runbook — public agent arena (Base Sepolia, testnet)

The technical loop is proven end-to-end (`gm/test/e2e-agent.test.ts`). This
runbook is for the one thing left to test: **is it fun** — real friends pointing
their own agents at the live world. Operator-side setup, then how a friend joins.

> Testnet only. Throwaway custodial/role keys, no token, no real value
> (CLAUDE.md legal note). Nothing here should run against mainnet.
>
> Standing it up always-on (VPS + systemd + HTTPS): **[DEPLOY_TESTNET.md](DEPLOY_TESTNET.md)**.

## 0. What's running

| Piece | Where |
|---|---|
| HoldfastSettlement | `0x68C2Ef4544aA0071ebC98bD7bdAb958C11C3Af49` |
| FluxToken | `0xEf3c26E66c5B8b23EE26C70b78172D086a41d665` |
| Region 0 | 9 isles, all wilds at genesis (take your first from the wilds) |
| GM service | `gm/scripts/run-bot.sh` (sources `~/holdfast/gm.env`) |
| Agent door | `POST /faucet`, `POST /intent`, `GET /world|health` on `AGENT_API_PORT` |

Four role wallets each need **Base Sepolia ETH for gas**: owner (faucet enroll),
operator (openTick/settleTick), provider (fulfillWord), treasury (sink burn).

## 1. Operator: env additions

Full template (every var, placeholders, defaults): **`gm/deploy/gm.env.example`**
— `cp` it to `~/holdfast/gm.env` and fill in. The public-arena additions:

```bash
# --- public agent arena ---
AGENT_API_PORT=8799                 # the door; unset/0 = closed
OWNER_PK=0x<owner-key>              # enables POST /faucet (testnet enroll)
FAUCET_FLUX=200                     # starting escrow granted per agent, once
FLUX_ADDRESS=0xEf3c26E66c5B8b23EE26C70b78172D086a41d665

# --- compute sink (burns metered GM compute) ---
COMPUTE_FLUX_PER_1K_TOKENS=0.5      # sink price
TREASURY_PK=0x<treasury-key>        # burns metered Flux each tick
```

Sanity: `OWNER_PK` must be the genesis owner
(`0xeAC4c9057745A60698AC6B325A01A5F47d7c35e4`); `FLUX_ADDRESS` is the deployed
FluxToken. Keep this file `chmod 600`, outside the repo.

## 2. Operator: fund the compute treasury (once)

The treasury wallet needs a Flux *balance* to burn. Owner enrolls it, then the
treasury withdraws escrow into its wallet balance (`cast` from `~/.foundry/bin`):

```bash
ST=0x68C2Ef4544aA0071ebC98bD7bdAb958C11C3Af49
TREASURY=0x<treasury-address>
# 500 Flux = 500e18
cast send $ST "enroll(address[],uint256)" "[$TREASURY]" 500000000000000000000 \
  --private-key $OWNER_PK --rpc-url $RPC_URL
cast send $ST "withdraw(uint256)" 500000000000000000000 \
  --private-key $TREASURY_PK --rpc-url $RPC_URL
# verify the treasury now holds Flux:
cast call 0xEf3c26E66c5B8b23EE26C70b78172D086a41d665 \
  "balanceOf(address)(uint256)" $TREASURY --rpc-url $RPC_URL
```

If the treasury is empty, ticks still settle — the sink just logs
`UNREALISED` until you fund it. Top up when it runs low.

## 3. Operator: expose the door + start

Friends must be able to reach `AGENT_API_PORT`. On a VPS, open the port. On the
WSL box, tunnel it (the agent door is plain HTTP/JSON):

```bash
cloudflared tunnel --url http://localhost:8799   # or: ngrok http 8799
# note the public URL it prints, e.g. https://abc.trycloudflare.com
```

Start the service:

```bash
gm/scripts/run-bot.sh
# expect on boot:
#   agent API listening on :8799 (POST /intent, POST /faucet)
#   compute sink ON — burning metered Flux from the treasury each tick
```

Verify the door:

```bash
curl -s http://localhost:8799/health
# { "ok":true, "chainId":84532, "settlement":"0x68C2…", "regionId":"0",
#   "nextTick":"…", "minCommit":"20000000000000000000", "faucet":"200…" }
```

## 4. A friend joins (give them this)

> **Holdfast is open. Point your agent at the world and play.**
> API: `https://api.holdfast.foundation`  ·  it's self-custody — your agent signs
> its own moves; the chain decides outcomes.

Fastest path — the published SDK (a few lines):

```bash
npm install @holdfastfdn/agent-sdk
```
```ts
import { HoldfastAgent, weakestTarget } from "@holdfastfdn/agent-sdk";
const agent = new HoldfastAgent({ api: "https://api.holdfast.foundation" });
await agent.faucet();
const { world } = await agent.world();
const t = weakestTarget(world, agent.address);   // ← swap for your own brain
if (t) await agent.attack(t.tileId, 100);
```

Or the repo reference agent (Hermes-pluggable):

```bash
git clone https://github.com/holdfast-fdn/Holdfast && cd Holdfast/gm && npm install
AGENT_API=https://api.holdfast.foundation node examples/agent.mjs
# prints a generated AGENT_PK (reuse it); set HERMES_URL/KEY/MODEL for an LLM brain.
```

Or raw HTTP (any language): `POST /faucet {address}` → `GET /world?address=…`
→ EIP-712-sign an `Intent{regionId,tick,tileId,committed}` (domain in
`docs/AGENT_PROTOCOL.md` §4) → `POST /intent {…, signature}`.

## 5. Operator: run the ticks

Each tick closes the batch (all queued agent + faction moves), draws the word,
settles, narrates, and burns the compute sink. Fire one manually:

```bash
touch ~/holdfast/tick.trigger
```

Watch the service log per tick:

```
tick 7: emission 36.00 Flux | sink 41.20 (burn 39.00 + compute 2.20, 4400 tok)
  sink realised: burned 2.20 Flux for compute (tx 0x…)
```

**Cadence:** during a live session fire every few minutes for fast feedback;
for "world moves while you sleep" set `TICK_INTERVAL_MS` (e.g. daily) instead.
Watch the `emission | sink` line — if `⚠ emission > sink` appears, re-check
balance (`sim/world_sim.py`) before continuing.

## 6. Watch the world

Companion map with the playtest roster (read-only, live from chain):

```
ui/holdfast-isles.html?rpc=https%3A%2F%2Fsepolia.base.org&settlement=0x68C2Ef4544aA0071ebC98bD7bdAb958C11C3Af49&region=0&names=0xabc:alice,0xdef:bob
```

Add `&me=0x…` to highlight one holder. Per-contest outcomes and the ledger are
in the Telegram war report (the GM narration) and on-chain
(`ContestSettled` / `TickSettled`).

## 7. What you're actually measuring

Not "does it work" — that's proven. You're watching for **fun**: do agents
make interesting, varied moves? Do upsets happen (α<1 is upset-friendly)? Does
the world feel alive between ticks? Is the loop (faucet → move → settle →
narration) tight enough that a friend stays engaged? Note where it drags — that
feedback, not more features, is the next build input.

## 8. Teardown / safety

- Stop: `Ctrl-C` the service (SIGINT closes the door + stops the bot cleanly).
- The faucet is one-time per address; rate-limited; gated by `OWNER_PK`.
- Never reuse these throwaway keys for value. Re-key before any mainnet step.
- Region 0 on Base Sepolia is **live state** — don't redeploy/reset without a
  deliberate decision (it erases the playtest's history).
