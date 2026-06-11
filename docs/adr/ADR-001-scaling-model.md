# ADR-001 — Scaling model: independent continents (scale-out shards)

**Status:** Accepted (vision) · NOT built in MVP
**Date:** design session
**Context owner:** the world-design discussion; supersedes earlier informal "small region only" framing.

---

## Context

The MVP is one region of ~9 tiles for ~10 players. The question arose: how does Holdfast grow to hundreds or thousands of players? Several models were considered in sequence, each exposing a problem the next one solved.

### Options considered

1. **Scale-up — one giant region with many tiles/players.**
   Pros: richest emergent drama (alliances, faction wars, betrayals need many players sharing one space). Cons: a single GM cannot interpret/narrate/remember hundreds of natural-language interactions per tick within one bounded context — this hits Hermes's core context-bloat weakness head-on. The GM, not the chain, becomes the bottleneck.

2. **Scale-out — many small independent regions (replication).**
   Pros: each region is a self-contained shard; the MVP region is already the template. Settlement cost scales with regions, not players (one state root per region per tick). Cons: small isolated regions can feel sparse; less cross-player drama.

3. **Hierarchical GM (orchestrator-worker) within one big world.**
   Sub-GMs per "continent" parse intent + narrate locally (bounded context); a Main GM aggregates summaries into world-level narrative. This breaks the GM bottleneck via map-reduce. Cons: introduces the three hardest distributed-systems problems — cross-continent action at boundaries, cross-shard player memory, and a global synchronization barrier (all sub-GMs must finish before settle; fragile given Hermes cron reliability issues).

4. **Hierarchical GM + players locked to their continent (no cross-continent attack or migration).** ← chosen
   By forbidding cross-continent action and movement, each continent becomes a *fully independent shard*. This eliminates all three hard problems from option 3 while keeping the "one shared world" narrative wrapper.

## Decision

Adopt **option 4: independent continents as scale-out shards, unified by a narrative (and optionally economic) layer — not by shared mechanical conflict.**

A "continent" is mechanically identical to an "independent region/shard." Players act, fight, and remain within their own continent. The world is shared in *story and standing*, not in *battlefield*.

### The non-negotiable principle (applies recursively at every layer)

> **GM proposes, chain disposes — at every layer.**

Sub-GMs and the Main GM are all LLMs and non-deterministic. None of them may decide ownership, balances, or outcomes. The deterministic resolver remains the single source of mechanical truth. The GM hierarchy is a hierarchy of **narrative + intent-parsing only**, never of settlement. Summaries passed upward are for flavor/world-narrative only; the moment a summary influences a mechanical number, the design has leaked and must be corrected.

### Layers

- **Sub-GM (per continent):** NL→intent parsing, local narration, local relationship memory. Context bounded to its continent — directly mitigates Hermes context bloat.
- **Resolver (deterministic):** computes outcomes. Region-agnostic; takes a continent's state + intents + VRF seed as arguments. **Each continent settles independently** — its own state root per tick, in parallel, no global barrier.
- **Main GM (narrative only):** receives summaries from sub-GMs, composes world-level "state of the world" flavor and meta-events. No mechanical function whatsoever (safe precisely because continents never interact mechanically).

## Consequences

### Eliminated (vs. the hierarchical-but-connected model)
- **Cross-continent boundary actions** — gone. Every tile belongs definitively to one continent.
- **Cross-shard player memory** — gone. Players don't move; each sub-GM holds only its own continent's memory, forever.
- **Global synchronization barrier** — largely gone. Continents settle independently and in parallel. If one sub-GM hangs (a real risk given Hermes cron reliability problems), only that continent is delayed; others proceed. A single global point of failure becomes isolated per-continent failures — a major reliability gain.

### Accepted trade-offs
- **"One world" becomes mostly narrative, not mechanical.** Players in Continent A never fight or meet players in Continent B. Two continents share a *story*, possibly an *economy*, but not a *battlefield*. This must be made to feel meaningful, or the shared-world framing reads as decoration.
- **Player placement/migration needs rules** (UX, not technical): how are new players assigned to a continent? Can continents fill up? Are players locked to their first continent? — to be decided.

## OPEN QUESTION (unresolved — do not let it get lost)

**What stays global, to make "one world" feel honest?** Candidates, safest → riskiest:
1. **Global leaderboard / prestige** — continents compete as collectives. Deterministic, safe, gives a reason to care about other continents without mechanical interaction. *(Recommended starting point.)*
2. **Global economy / single Flux** — cross-continent trade in a shared market. Strong connection, but reintroduces cross-shard dynamics on the economic side (arbitrage, whales moving capital between continents even if not armies). Defer until confident.
3. **World/seasonal events** — occasional events touching all continents at once (deterministic, from the resolver, never from a GM). Gives a sense of one world breathing together.

**MVP recommendation:** keep the global layer to **leaderboard + Main-GM narrative only** — the lightest, safest connective tissue. Defer global economy.

## MVP guardrails (what to do NOW — and nothing more)

Do **not** build the GM hierarchy, multi-continent infra, or the global layer now. That repeats the "heavy infra before validated need" anti-pattern. Just keep the door open by ensuring in MVP code:

1. A continent/region is **configuration, not hardcode** (a second continent = a config file, not a rewrite).
2. The **resolver stays region-agnostic** — already true; it takes region state as an argument.
3. The **GM stays stateless** — already true, via resolver + Bucket-2 committed state. No global singletons, no hardcoded region IDs.

The MVP remains: one continent, ~9 tiles, ~10 players. It is simply now understood as "shard #1." Today's work does not change; the scaling picture is just clearer and more failure-tolerant.

## Unproven risks (be honest)
- Hermes at scale (context, cost, cron reliability) is the largest untested technical risk — and the LLM compute is the dominant variable cost, making the "meter GM compute in Flux" sink mandatory, not cosmetic, at scale.
- Whether a narrative-only "shared world" feels meaningful to players without shared mechanical conflict is a design hypothesis, untested.

Both are answered only by running an actual second continent with real players — not from theory.
