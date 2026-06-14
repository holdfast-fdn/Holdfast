# Holdfast — Whitepaper (Draft v0.3)

*A persistent on-chain world with an autonomous AI Game Master, settled on Base.*

Status: early draft, reflecting design decisions and simulation findings as of the initial design session. Not final.

---

## Abstract

Holdfast is a persistent, asynchronous game world — *The Sundered Isles* — in which an autonomous Game Master (GM) built on the Hermes Agent framework narrates and evolves a shared world that keeps running even when every player is offline. The GM never decides economic outcomes: ownership, balances, and contest results are computed by a deterministic resolver and settled trustlessly on Base via the token **Flux**. The GM supplies narrative intelligence and persistent memory; the chain supplies economic justice. This separation is the project's foundational principle and its answer to a hard truth about AI agents: for large language models, rules are suggestions, not laws.

## 1. Motivation

AI agents are capable narrators but non-deterministic; one that decides who owns what can be wrong, and its decisions cannot be independently verified. Pure smart-contract worlds are verifiable but lifeless — they cannot remember a player, adapt a story, or run a living narrative. Holdfast assigns each system to what it does best: the GM handles language, narrative, memory, and AI factions (allowed to be creative and fallible); the chain handles ownership, balances, and randomness (deterministic, trustless).

## 2. Core principle: GM proposes, chain disposes

The GM may interpret a player's command, narrate a battle, and remember a betrayal across months. It may not grant a territory, mint a token, or decide a contest. Outcomes are produced by a deterministic resolver whose inputs are fully reproducible from public data — anyone can recompute a turn and verify it. The GM is therefore structurally unable to cheat, however it is prompted or compromised. This principle holds recursively if the GM is ever decomposed into sub-GMs (Section 7).

## 3. World model

The MVP world is a single continent of ~9 island tiles, one resource (Flux), and one action: contesting a tile. Players issue natural-language commands through chat platforms they already use (`@HoldfastGM`). The world advances in discrete **ticks**.

### 3.1 The tick

Within each tick window (initially one day): players submit signed off-chain intents (free); the GM interprets and responds narratively from memory, instantly; at tick close the resolver consumes all intents, current state, and an on-chain randomness seed, computes deterministic outcomes, and writes a single settlement transaction to Base. One tick produces one settlement transaction per continent — keeping cost bounded and the experience responsive (players never wait for block confirmation to converse).

### 3.2 State: three buckets

Partitioned by one test — *does it determine who-gets-what?* On-chain (ownership, balances, asset-transferring outcomes, randomness seed, per-tick state root); committed off-chain (mechanical values affecting outcomes — defense, faction strength, outcome-affecting reputation, payout-bound progress, intents — hashed into the on-chain root, tamper-evident); and pure GM memory (narrative, lore, relationship color with no mechanical effect). The governing rule: the instant GM memory influences an outcome-determining number it must move from pure memory to committed state. This prevents the non-deterministic GM from quietly becoming the economic source of truth.

## 4. Contest resolution

Contests use a weighted-probabilistic model — neither purely deterministic (capital always wins, no drama) nor a coin flip (commitment meaningless). Attacker and defender each derive a "power" from committed Flux raised to an exponent α and situational modifiers; the defender enjoys an advantage factor δ. The attacker's win probability is its share of total power. A verifiable random value, drawn only after the tick closes, decides the outcome against that probability — players act blind to randomness, so no one (including the GM) can manipulate it. The exponent α governs how strongly capital translates to advantage; below one, dominance is expensive and upsets thrive, but large holders are nudged toward breadth over depth — a deliberate lever tuned from real play.

### 4.1 The sink

Every contest burns Flux. A winning attacker takes a share of the defender's garrison as spoils and burns the rest; a successful defender keeps a share of the attacker's committed Flux and burns the rest. The fiercer the conflict, the larger the burn — the economy self-corrects.

## 5. Token economics (Flux)

Flux is an ERC-20 on Base and the world's economic medium. Tiles generate Flux for owners (emission); contests and actions burn it (sink). Complex GM adjudication can be metered in Flux, giving the token a cost basis in real compute. The health rule is non-negotiable: **sink must meet or exceed emission**, or supply inflates into slow collapse. Simulation across multiple ticks confirms the economy is deflationary while active; a compute-fee sink provides a floor for quiet periods. Intended alignment: players who build and contest the world earn; the protocol captures a fee on economic throughput; token value tracks genuine activity rather than speculation. A cautionary precedent from prior on-chain games: titles that were financial-products-first lost their players when token prices fell — Holdfast must be fun without the token.

## 6. Trust and verification

The MVP adopts a *trusted-but-verifiable* settlement model: the GM publishes all inputs so anyone can independently recompute and verify each tick, but automatic on-chain dispute resolution is deferred. A future optimistic model with fraud proofs would let any party challenge an incorrect state root within a window. The MVP prioritizes proving the world is compelling before building elaborate dispute machinery.

## 7. Scaling — independent continents

Holdfast scales by **scale-out, not scale-up**: rather than one giant region holding everyone, the world is partitioned into **independent continents**, each a self-contained shard. Players act and remain within their continent (no cross-continent attack or migration). This keeps each GM's context bounded — directly mitigating the context-bloat weakness of large agents — and lets each continent settle independently and in parallel, so a stalled continent never blocks the others (failure is isolated, not global).

Where a single continent must host many players, the GM may be decomposed hierarchically: a **sub-GM per continent** parses intent and narrates locally; a **Main GM** composes world-level narrative from sub-GM summaries. This hierarchy is narrative-only — every layer obeys *GM proposes, chain disposes*; summaries never drive mechanics. Because continents do not interact mechanically, the "one world" is shared in story and standing rather than in battlefield. What stays global to make that feel meaningful — a global leaderboard, a shared economy, or seasonal world events — is an open design question; the conservative starting point is a global leaderboard plus Main-GM narrative, with a shared economy deferred. (See ADR-001.)

## 8. Surfaces

The primary surface is a **Telegram/Discord bot** where players issue natural-language commands and the GM responds. A **read-only web companion** renders the world — an illustrative island map, holdings, faction standings, and a war log — but is never an action surface; all commands route to the bot. The companion is built web-native (no game engine on the critical path; see ADR-002).

## 9. Status and limitations

The contest mathematics and a multi-tick world simulation are validated as pure, reproducible functions and produce emergent narrative even before any storytelling layer. Not built: the settlement contract and Flux token, the Hermes integration, clients, the indexer, and the dispute layer. The simulation uses scripted players; real-player dynamics — collusion, defensive exploits, cross-region economics — remain untested, as does Hermes reliability and cost at scale. These are the subject of the roadmap.
