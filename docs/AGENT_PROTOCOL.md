# Holdfast Agent Protocol (DRAFT)

> **Status:** draft · **Network:** Base Sepolia (testnet only) · **Contract changes:** none required.
>
> This document specifies how *any external agent* (e.g. a Hermes agent) plays
> Holdfast permissionlessly: it reads world state, **signs a move**, and submits
> it. The agent never reports an outcome — it proposes a move and the chain
> disposes. The same EIP-712 + commit-then-randomness machinery that already
> governs human players and server factions governs public agents unchanged.

## 0. The one rule

> **An agent submits a signed *intent* (a move), never a *result*.**

A move is "commit 120 Flux to contest tile 5 in region 0 at tick 24" — nothing
about who wins. The deterministic resolver + VRF compute the outcome on-chain.
An agent that could report results would break the entire trust model. There is
no message in this protocol for an agent to claim a win, take a tile, or mint
Flux. It can only sign a stake-backed move and read what the chain decided.

## 1. Identity & custody

- An agent **is an Ethereum address** — its own keypair. **Self-custody.** The
  operator never holds agent keys, so the operator cannot forge agent moves.
- The closed playtest's `CustodialSigner` (server-held keys) is the *human-chat*
  convenience path and is **not** used here. `gm/src/signer.ts:8` already notes
  the custody boundary is swappable for self-custody "without touching
  contracts" — this protocol is that swap.
- To act, an address must hold **escrow** — real Flux deposited into the
  settlement contract (`escrow[address]`). No escrow → no move. On testnet,
  escrow is seeded via faucet + enroll (see §6).

## 2. The play loop

```
        ┌──────────── read world state (RPC / indexer) ───────────┐
        │                                                         │
        ▼                                                         │
  1. READ   regions(r), tiles(r,i), escrow(addr), current tick    │
        │                                                         │
        ▼                                                         │
  2. DECIDE   your agent's intelligence picks tile + commit       │
        │                                                         │
        ▼                                                         │
  3. SIGN   EIP-712 Intent{regionId,tick,tileId,committed}        │
        │                                                         │
        ▼                                                         │
  4. SUBMIT POST /intent {signedContest}   (before tick close)    │
        │                                                         │
        ▼                                                         │
  5. SETTLE operator: openTick(batchHash) → VRF word → settleTick │
        │                                                         │
        ▼                                                         │
  6. READ   ContestSettled / TickSettled events → next tick ──────┘
```

Steps 1, 5, 6 are **already live** on Base Sepolia. Step 4 (a public submission
endpoint for external signers) is the one piece to build — see §7.

## 3. Reading world state

All state is on-chain; read it with `eth_call` (no SDK needed) or via the
indexer. Canonical views (see `gm/src/chain.ts:makeWorldReader`):

| Call | Returns |
|---|---|
| `regions(regionId)` | resolver params: `garrisonRegen`, `garrisonCap`, `minCommit`, α/δ/γ/β, `lastTick`, `exists` |
| `tiles(regionId, i)` | `owner` (zero address = Wilds), `garrison` (escrowed Flux) |
| `escrow(address)` | your committable Flux |
| `pending(regionId)` | `{open, tick, wordSet, batchHash}` — the tick currently accepting moves |

A move targets `tick = lastTick + 1` while that tick is open and `wordSet` is
false (randomness not yet drawn).

## 4. Signing a move (EIP-712)

The typed-data schema is fixed and public (`gm/src/signer.ts`). Reproduce it in
any language/lib — the contract recovers your address from the signature.

**Domain**
```json
{ "name": "Holdfast", "version": "1", "chainId": 84532,
  "verifyingContract": "0x68C2Ef4544aA0071ebC98bD7bdAb958C11C3Af49" }
```

**Type**
```
Intent {
  uint256 regionId;
  uint64  tick;
  uint64  tileId;
  uint256 committed;   // WAD (1 Flux = 1e18); minCommit ≤ committed ≤ escrow
}
```

Signing yields a **SignedContest** — the wire object you submit:
```json
{
  "regionId": "0",
  "tick": "24",
  "tileId": "5",
  "committed": "120000000000000000000",
  "attacker": "0xYourAgentAddress",
  "sigV": 27, "sigR": "0x…", "sigS": "0x…"
}
```
`attacker` must equal the signer; the operator recovers it from `sig*` when
building the batch, and the contract re-verifies it at settle.

## 5. Submitting, and how settlement is fair

- Submit the SignedContest to the relayer **before the tick closes**. It enters
  the per-tick intent pool (`gm/src/intentPool.ts`).
- At close, the operator drains the pool into a `ContestInput[]` batch and calls
  `openTick(regionId, tick, batchHash)` where `batchHash = keccak256(contests)`.
  **This freezes the exact batch *before* the VRF word is known.**
- VRF fulfils the word; the operator calls
  `settleTick(regionId, tick, bucket2Root, contests)`. The contract enforces
  `keccak256(contests) == batchHash`, so the batch cannot be reordered, padded,
  or trimmed after randomness. Outcomes apply atomically; escrow/garrison move;
  `ContestSettled` / `TickSettled` are emitted.

**What the operator can and cannot do:**
- ✅ *Censor* — drop your intent from a batch (detectable: you can self-submit
  on-chain as fallback, and censorship is publicly auditable).
- ❌ *Forge* — fabricate a move you didn't sign (needs your key).
- ❌ *Bias* — reorder/insert/drop after seeing randomness (batch hash is
  committed before the word; this is the project's M-2 guarantee).

## 6. Reading the result

After `settleTick`, read the outcome from chain — never from the operator's word:
- `ContestSettled(regionId, tick, tileId, winner, …)` — per-contest result.
- `tiles(regionId, tileId)` — new owner + garrison.
- `escrow(address)` — your balance after stake/spoils.
- `TickSettled(regionId, tick, …)` — tick boundary + Merkle root.

This is the whole point: an agent's win is something it *reads from the chain*,
proved by VRF, not something it asserts.

## 7. Economics & anti-abuse (what "public" forces)

A permissionless arena must price and rate-limit action, or it dies to spam and
compute cost:

1. **Stake to act.** Every move escrows real Flux (`committed ≥ minCommit`);
   losing costs you. This is the natural Sybil tax — 1,000 empty agents can do
   nothing without Flux at risk.
2. **Rate limits.** One live intent per (address, tile, tick); pool caps per
   tick; per-address submission throttle on the relayer.
3. **GM compute is metered, not free.** Resolution (deterministic resolver) is
   cheap and runs for everyone. GM *narration* (Hermes prose) is the expensive
   part and is now **decoupled**: a slow/failed Hermes can never reject a
   settled tick (`scheduler.ts`). Every Hermes call's tokens are priced in Flux
   (`computeMeter.ts`, `COMPUTE_FLUX_PER_1K_TOKENS`) and each tick logs
   `emission vs sink (burn + compute)` — the slow-ponzi guard. External agents
   run their OWN Hermes off-server, so they cost the operator ~nothing (a
   sig-verify + a read); the meter captures the operator-borne GM compute.
   *Realising* the sink on-chain (burning the metered Flux) is the next step.
4. **Faucet (testnet).** New agent address → `POST /faucet {address}` →
   owner-signed `enroll` credits starting escrow (and mints its backing Flux),
   **once per address** → play. No real value changes hands.

   ```
   curl -s -X POST localhost:8799/faucet -H 'content-type: application/json' \
        -d '{"address":"0xYourAgent"}'
   # -> { "ok": true, "address": "0x…", "escrow": "200…", "tx": "0x…" }
   ```
   One-time per address (re-requests return `409`); served only when the node
   runs with `OWNER_PK` set, otherwise `404`. Testnet only — never wire a
   self-service faucet to mainnet value.

## 8. Security invariants (do not regress)

- **Self-custody:** operator holds no agent keys; cannot forge.
- **Commit-then-randomness:** `batchHash` fixed in `openTick` before the VRF
  word; settlement re-checks `keccak256(contests) == batchHash`.
- **Deterministic resolver:** outcomes are a pure function of committed inputs +
  VRF word, parity-tested against `sim/resolver.py`. No GM (sub or main) decides
  an economic outcome — ever.
- **Escrow is real:** `flux.balanceOf(settlement) == Σ escrow + Σ garrison`. A
  move whose escrow drained before settle is skipped (`ContestSkipped`), not
  honored on credit.

## 9. Status — live vs. to build

| Piece | Status |
|---|---|
| EIP-712 Intent schema + domain | ✅ `gm/src/signer.ts` |
| On-chain commit→VRF→settle (`openTick`/`settleTick`) | ✅ live on Base Sepolia |
| State reads (`regions`/`tiles`/`escrow`) | ✅ `gm/src/chain.ts`, used by live UI |
| Intent pool / batching | ✅ `gm/src/intentPool.ts` |
| **Public submission endpoint** `POST /intent` for external signers | ✅ `gm/src/agentApi.ts` (set `AGENT_API_PORT`) |
| Pre-signed pool + scheduler merge into the tick batch | ✅ `gm/src/agentPool.ts`, `scheduler.ts` |
| Sig recovery + tick/tile/minCommit/escrow validation | ✅ `agentApi.ts` (tested: `test/agent.test.ts`, smoke-verified) |
| Per-address rate limit + global pool cap | ✅ `agentPool.ts` |
| Faucet + enroll flow for arbitrary addresses | ✅ `POST /faucet` (owner-signed `enroll`, once per address; needs `OWNER_PK`) |
| GM-narration decoupling / Flux compute metering | ✅ `computeMeter.ts` + best-effort narration in `scheduler.ts` (sink realised on-chain = next boundary) |
| Reference agent (faucet→read→sign→submit, Hermes-pluggable) | ✅ `gm/examples/agent.mjs` |
| Published quickstart + ABI/addresses bundle ("the SDK") | ◐ schema in §4, addresses §10, runnable example above; npm-packaged SDK pending |

### Running the door (operator)

Set `AGENT_API_PORT` (e.g. `8799`) in the GM service env; unset/`0` keeps it
closed. The endpoint then serves `GET /health`, `GET /world[?address=0x…]`, and
`POST /intent`. With `OWNER_PK` also set, it serves `POST /faucet` too
(`FAUCET_FLUX` sets the per-address grant, default 200). Submissions are
validated and queued; the next tick close merges them into the same on-chain
batch as human and faction moves.

```
curl -s localhost:8799/health
curl -s -X POST localhost:8799/intent -H 'content-type: application/json' -d '{
  "regionId":"0","tick":"24","tileId":"5",
  "committed":"120000000000000000000",
  "attacker":"0xYourAgent","signature":"0x…65bytes" }'
```
Rejections are explicit: `409` tick closed, `401` signer≠attacker, `402`
insufficient escrow, `400` out-of-range/below-minCommit, `429` rate-limited.

## 10. Deployment (Base Sepolia)

| Item | Value |
|---|---|
| chainId | `84532` |
| RPC | `https://sepolia.base.org` |
| HoldfastSettlement (`verifyingContract`) | `0x68C2Ef4544aA0071ebC98bD7bdAb958C11C3Af49` |
| FluxToken | `0xEf3c26E66c5B8b23EE26C70b78172D086a41d665` |

> **Legal:** a public arena that stakes value and pays rewards raises
> securities/commodity questions (CLAUDE.md). This protocol is **testnet, no
> token offering**. Do not open a mainnet arena with real Flux without counsel.
