# CLAUDE.md — Holdfast

Operational guide for Claude Code working in this repository. Read this first, then `docs/MEMORY.md` for full context.

## What this project is

**Holdfast** is a persistent on-chain world (*The Sundered Isles*) where a **Hermes Agent acts as an autonomous Game Master (GM)**. Players issue natural-language commands via Telegram/Discord (`@HoldfastGM`); the GM narrates and moves the world; a **deterministic resolver** — never the GM — decides who-gets-what; outcomes settle on **Base**. The token is **Flux** (ERC-20).

## The principle that governs everything

> **GM proposes, chain disposes.** The GM is an LLM and is non-deterministic. It must NEVER be the source of truth for ownership, balances, or contest outcomes — those are computed by a deterministic resolver and settled on-chain. This holds **recursively** at every layer if the GM is ever split into sub-GMs (ADR-001). If you find yourself letting any GM decide an economic outcome, stop — that single mistake breaks the game.

## Surfaces (where the game lives)

- **Primary — Telegram/Discord bot:** players play here in natural language. Backend: bot API + Hermes + resolver + contracts. No game engine.
- **Companion — web (read-only):** map, holdings, standings, war log. Draws state only; never an action surface. All actions route to `@HoldfastGM`.
- **Client game canvas (e.g. Godot):** NOT planned. Possibly never needed. See ADR-002.

## Current state (handoff)

- **Validated:** resolver math (`sim/resolver.py`) and a multi-tick world sim (`sim/world_sim.py`). Both run with `python3`. Economic loop, reproducibility, and VRF non-bias confirmed empirically.
- **Designed, not built:** Solidity settlement + Flux token, Hermes GM integration, Telegram bot, indexer, production frontend.
- **Brand:** done (`brand/`) — bastion mark + ember/iron palette.
- **UI previews:** done (`ui/`) — Telegram (primary), illustrative isles companion, dashboard variant, isometric engine.

## Tech stack

Node/TS bot · Hermes Agent (cron + retry — see reliability note) · resolver (Python ref, port to Solidity) · Foundry + Solidity on Base · indexer (Ponder-like) · web-native frontend (SVG/Canvas now; three.js optional later). **No Godot.**

## Parameters (current tuned values)

| Param | Symbol | Value | Meaning |
|---|---|---|---|
| Diminishing returns | α | 0.5 | exponent on Flux in power; <1 = upset-friendly |
| Defender advantage | δ | 1.3 | taking a tile costs more than holding |
| Spoils ratio | γ | 0.3 | share of garrison to winning attacker |
| Defend reward | β | 0.3 | share of committed Flux to successful defender |
| Tile yield | — | 6.0 | Flux emitted per tile per tick |
| Garrison decay | — | 0 (off) | decided against — see BALANCE.md §4 |

Phase-1 lab-tuned values (`docs/BALANCE.md` has the evidence; `sim/balance_lab.py` reproduces it). Starting values for playtest, not final. Only real-player data sets them. Note: `sim/resolver.py` module constants keep the Phase-0 defaults (γ=β=0.5) so its scenario outputs stay stable as the spec; pass tuned values as arguments (`SimParams`).

## How to work here

1. Before changing game math, run `python3 sim/resolver.py` and `python3 sim/world_sim.py`. The resolver is the source of truth for mechanics; the Solidity contract must reproduce its outputs exactly (parity test = the correctness gate).
2. Keep the resolver **pure** — no I/O, no global state, no randomness except the injected `seed`. This is what makes the system trustless and reproducible from public inputs.
3. Respect the **three-bucket state model** (MEMORY.md / WHITEPAPER.md). Rule: the moment GM memory influences an outcome-determining number, it must be committed (Bucket 2), not free GM memory (Bucket 3).
4. **One tick = one settlement transaction** (Merkle root) per region. Never settle per-action. Base is cheap (~$0.002–$0.01/tx, with a floor + volatile L1 component) — enough to enable per-tick batching, NOT to settle per-action.
5. **Keep scaling doors open without building scaling** (ADR-001): a region/continent is *config not hardcode*; resolver stays region-agnostic; GM stays stateless. No global singletons, no hardcoded region IDs.
6. **MVP discipline:** one continent, ~9 tiles, one resource (Flux), one action (contest), daily tick, trusted-but-verifiable settlement, ~10 players. Do not build fraud proofs, multi-continent infra, the GM hierarchy, the global layer, or 3D clients until the core loop is proven fun with real players.

## Hard "do not" list (hard-won)

- Do not let any GM (sub or main) decide/override outcomes — ever.
- Do not settle per-action on-chain (cost + latency death).
- Do not claim sub-cent gas (e.g. "$0.000001"); the real floor is ~$0.002–$0.01.
- Do not let emission (tile yield) exceed sink (burn + GM-compute fee) — slow ponzi. Verify with the sim.
- Do not expand scope (tiles, mechanics, continents, 3D) before the 10-player loop is validated.
- Do not bring Godot/a heavy client engine onto the critical path (ADR-002).
- Do not store secrets/keys in this repo or any Hermes-loaded skill environment.

## Hermes reliability note

Hermes cron has known issues (jobs hanging, delivery failures) even at small scale. The tick driver must have completion checks and retries; never trust a single cron fire. At scale, LLM compute is the dominant variable cost — the "meter GM compute in Flux" sink is mandatory, not cosmetic.

## Legal note (carry into all docs)

Token mechanics with yield/rewards may carry securities/commodity implications by jurisdiction (incl. Indonesia — Bappebti/OJK). Not legal advice; engage counsel before any token launch. The settlement contract holds player funds — highest-audit-surface artifact in the project; review at audit grade with unprivileged-attacker drain analysis.
