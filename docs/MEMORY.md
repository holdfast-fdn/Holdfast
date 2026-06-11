# MEMORY.md — Holdfast

The complete decision record from the design session. The "why" behind every choice. When in doubt, this file wins over assumptions.

---

## Identity

- **Project:** Holdfast.
- **World:** *The Sundered Isles* — territories are islands on a sea; players contest them.
- **Token:** **Flux** — ERC-20 on Base, the economic medium. (Renamed away from earlier "Flux as placeholder" concerns about namespace collisions with other crypto/AI "FLUX" projects — flagged as a real branding risk; final ticker/domain availability still to be checked.)
- **GM:** Hermes Agent, surfaced as `@HoldfastGM`.
- **Factions (MVP):** You (ember), Iron Pact (steel-blue), Ashen Horde (crimson), Unclaimed (wild/neutral).
- **Name caution:** "Holdfast" collides with the FPS *Holdfast: Nations at War* — discovery/trademark risk worth checking before heavy brand investment.

## Origin & framing

Emerged from researching real limitations of Hermes Agent (Nous Research). Key realization that shaped everything:

- Some agent problems **cannot be fixed by infrastructure** — chiefly that for LLMs, "rules are suggestions, not laws." Compliance is probabilistic, not deterministic.
- Therefore the only safe way to let an agent touch value is to **move enforcement of economic outcomes OUT of the agent** into a deterministic layer it cannot violate even if jailbroken.

Applied to a game: the GM (Hermes) provides narrative intelligence and persistent memory; the chain provides economic justice.

## Why this is novel

No existing on-chain game makes Hermes's distinctive properties the core mechanic:
- **Learning loop** — GM builds a deepening model of players, adapts the world to collective behavior; no two worlds alike.
- **Always-on (cron)** — the world ticks/evolves while everyone is offline.
- **Persistent cross-session memory** — NPCs remember; consequences persist. The usual agent weakness (context amnesia) is inverted into the core feeling of a living place.

Pure-contract autonomous worlds (Dark Forest, Sky Strife) have trustless settlement but no narrative intelligence/memory. Centralized servers have narrative but no true ownership. AI-GM narrative games (2026) are single-player, no economy/settlement. Holdfast + Base + Hermes is the unfilled intersection.

## Core architectural principle (non-negotiable, recursive)

**GM proposes, chain disposes** — at every layer.
- **Chain = truth (deterministic):** ownership, balances, asset-transferring outcomes. Computed by the resolver, NOT the GM.
- **GM = intent + narrative + memory (non-deterministic):** NL→intent, narration, relationship memory, AI faction moves. May hallucinate; structurally cannot grant what wasn't won.

## Tick model (solves cost AND latency)

Settlement is **per-tick, not per-action**.
1. Players submit **intents** (signed, off-chain, free).
2. GM interprets and responds narratively, instantly, from memory.
3. At tick close, the resolver takes all intents + state + VRF seed → deterministic outcomes → **one settlement transaction** to Base.

One tick = one tx per region. Players never pay per-action gas. The real limiter is latency/UX, not cost — players won't wait for block confirmation to talk to the GM.

## Base cost reality (corrected)

Realistic working number: **~$0.002–$0.01 per state-changing tx.** There is a floor (min base fee 0.005 gwei, post-Jovian) and a volatile L1 security-fee component. Base's low cost is an **enabler** for batched per-tick roots, not a license to settle arbitrarily. Design as if every settlement costs real money.

## Three-bucket state model

Determined by: **does this state become an input to deciding who-gets-what?**
- **Bucket 1 — On-chain (per-tick settlement tx):** tile ownership, Flux balances/transfers, asset-transferring outcomes, VRF seed, per-tick state root.
- **Bucket 2 — Off-chain but committed (hashed into the state root):** defense values/faction strength, AI faction positions, outcome-affecting reputation, payout-bound quest progress, player intents.
- **Bucket 3 — Pure GM memory (never anchored):** narrative, dialogue, lore, relationship "color" without numbers.

**Guardian rule:** the moment GM memory influences an outcome-determining number, it rises from Bucket 3 to Bucket 2 and must be committed. Prevents the non-deterministic GM from becoming the economic source of truth via a back door.

**Trustless guarantee:** resolver deterministic; inputs fully reproducible from on-chain data (VRF seed, prior root) + published Bucket-2 state. Anyone can recompute a tick and get identical results → the GM cannot cheat.

## Resolver math (the heart)

Weighted-probabilistic (lottery with diminishing returns):
```
P_a = (F_a)^α × M_a              # attacker power
P_d = (G_d)^α × M_d × δ          # defender power
p   = P_a / (P_a + P_d)          # attacker win probability
r   = VRF(seed, contest_id)      # drawn AFTER tick closes
attacker wins iff r < p
```
- `F_a` committed Flux, `G_d` garrison, `M` modifiers (Bucket 2), `δ`≈1.3, `α` diminishing-returns exponent.
- VRF drawn after tick close → players commit blind to randomness → no peeking, including by the GM.

**Settlement / sink:**
- Attacker wins: take tile; spoils `γ×G_d` to attacker, rest burned; `F_a` becomes new garrison.
- Attacker loses: `β×F_a` to defender, rest burned.
- Burn on both branches = deflationary sink; fiercer war = bigger burn = self-correcting economy.

## The α parameter (most important tuning lever — a trade-off)

- α<1 (e.g. 0.5): dominance expensive → upsets thrive, but nudges whales to split across many tiles (breadth not depth).
- α=1: neutral to splitting, more deterministic, more whale-friendly per tile.
- α>1: concentration → whales dominate single tiles.
No α removes capital influence entirely. Playtest start: α=0.5–0.7; tune from real data.

## What is proven (empirically, in the sim)

`sim/resolver.py`: even fight 100v100 → 43.5%; ~676 Flux (≈7×) for 2:1 dominance; whale-split trade-off confirmed at α=0.5; reproducibility (identical inputs→outputs); Monte Carlo (20k) win-rate matches theoretical p (VRF unbiased); one tick = one settlement; burn accounting works.

`sim/world_sim.py` (6-tick): emergent drama with zero narrative (a player overextended and had attacks rejected for insufficient balance); AI factions feel intentional (aggressive raiders vs cautious south); economy deflationary while active (~646 burned vs ~576 emission); an emergent "cursed tile" (tile_09 attacked in 5 of 6 ticks, never fell). Note: test players were renamed to alice/bob (conventional, depersonalized) — names feed the VRF contest hash, so the canonical demo numbers changed slightly from the original session run; the story shape and all verdicts are unchanged.

**Verdict:** the mechanical skeleton produces pull even without narrative. Hermes narration will multiply something already alive.

## Phase 1 — balance lab findings (sim/balance_lab.py, full data in BALANCE.md)

- **Recommended playtest set: α=0.5, δ=1.3, γ=0.3, β=0.3, yield=6, regen=4, cap=200, decay=0, start=250.** Changed from Phase 0: yield 12→6 and γ/β 0.5→0.3 — at yield 12 the economy inflates whenever activity dips; smaller spoils/defend-reward cut snowball fuel and increase burn.
- **Garrison-decay decision: OFF (0.0).** The Phase-0 "cursed tile" does not reproduce as a systemic stalemate over 30-tick runs (≤0.6 cursed tiles/run without decay). Decay *worsens* hegemony at the aggressive end (0.08 → 100%): eroded defenses help the strongest attacker most, and less garrison burned per conquest inflates supply. Revisit only if real players manufacture stalemates.
- **Hegemony is a player-behavior artifact, not resolver math.** Mixed passive bots → 80% runaway-hegemony; add bots that target the leader once it holds ≥40% of tiles ("balancer") → 50%, and a 10× whale drops from top-holder in 75% of runs to 30% (power rotates among the balancers instead of locking). α=0.5 is what makes ganging-up effective — this is the empirical justification for keeping it. Caveat: hegemony rates carry ±20pp seed noise at 20 seeds; the balancer *contrast* is the robust signal, not any single percentage. Watch hegemony first in the Phase-4 playtest.
- **Degenerate equilibrium confirmed: the all-turtle (passive) world.** Nobody attacks → no burn → +80 Flux/tick inflation. Passive worlds are the economic worst case; structural answer is the GM-compute fee + quiet-world emission throttling (later phases), contained in MVP by yield=6.
- **Whale at every α dominates uncoordinated bots** — α alone cannot neutralize capital (reconfirmed empirically); the counterweight is anti-leader play, which α<1 empowers.

## What is NOT proven (honest)

- Sim uses fixed seeds + scripted players. Real players may find balance-breaking strategies (collusion, defensive/garrison exploits). Only human playtest answers this.
- No Solidity contract exists; on-chain parity of resolver math untested.
- No Hermes integration; NL→intent quality unvalidated; cron reliability untested at scale.
- Dispute/fraud-proof layer deferred.

## Surfaces & UI decisions

- **Primary surface: Telegram/Discord bot** (`@HoldfastGM`). Players play in natural language. The GM reads intent, not menus.
- **Companion: web, read-only.** Map / holdings / standings / war log. Draws state only; all actions route to the bot. Chosen aesthetic direction: **illustrative island world map** (`ui/holdfast-isles.html`) — floating islands on a textured sea with depth (2.5D via cast shadows, bobbing, volumetric cliffs). Lightweight, instant, fantasy-map warmth.
- **Tech: web-native, no Godot** (ADR-002). 2D first (SVG/Canvas; PixiJS if needed); three.js + low-poly islands as an optional later "hero map." `ui/holdfast-companion-iso.html` is an isometric Canvas engine scaffold ready to receive Kenney sprites.
- **Assets:** Kenney.nl (CC0) is the safe commercial source (no attribution required); itch.io packs vary per-license (prefer explicit commercial; avoid CC-BY-NC). Keep a credits file regardless; avoid trademarked styles.

## Brand (v2 — "The Herald")

- **v1 ("Bastion", ember/iron) superseded** — owner direction: more professional, game-company grade, and explicitly tied to Hermes. v1 files removed; system replaced 2026-06-11.
- **Concept:** the GM is cast as **the Herald** — the winged messenger who carries every player's word and returns at dawn with news of what the world did while you slept. The myth maps onto the architecture: *the Herald speaks, the chain disposes* (Hermes carries the message; he never decides fate). "Wings carry the message, stone holds the ground."
- **Mark:** "The Winged Hold" — a crest: fortress "H" (Holdfast · Hermes) borne on stepped angular wings, Flux spark (cyan diamond) at its heart. Flat, three inks. `brand/holdfast-mark.svg`.
- **Token icon:** "The Winged Drachma" — coin with wings + flux spark. `brand/flux-token.svg`.
- **Palette ("Gold on Night"):** Nyx #0B0E15 (bg), Basalt #151B28 (panels), Marble #F1EEE4 (text), Quicksilver #97A1B5 (secondary), Caduceus Gold #D9A845 (brand metal — spend rarely), Signal #3FB8CE (Flux/agent pulse), War #E25D38 and Laurel #6FA876 (state colors only). Flat, no gradients/glows.
- **Type:** Cinzel (display — classical Roman capitals) + Inter (UI/body, tabular numbers).
- **Taglines:** primary "THE WORLD MOVES WHILE YOU SLEEP."; legacy "HOLD WHAT IS YOURS." (war/season contexts); onboarding "SPEAK, AND THE GOD CARRIES IT."
- **GM persona (the Herald):** messenger never judge (reports outcomes as delivered news); classical dry wit; proves its memory constantly (cites grudges by name and tick); compute fees framed as "the Herald's toll."
- The crest/palette/persona survive a retitle if the "Holdfast" name collision ever forces one. Full sheet: `brand/holdfast-brand.html`. UI rework to match v2 is planned but not done.

## Scaling (see ADR-001)

Decision: **independent continents as scale-out shards**, unified by a narrative (and optionally economic) layer — NOT by shared mechanical conflict. Players are locked to their continent (no cross-continent attack/migration), which eliminates cross-boundary actions, cross-shard memory, and the global sync barrier; each continent settles independently and in parallel (failure isolated per continent). The optional hierarchical GM (sub-GM per continent → Main GM narrative summary) follows the same recursive "GM proposes, chain disposes" rule — summaries are flavor only.

**Open question (unresolved):** *what stays global to make "one world" feel honest?* Candidates safest→riskiest: global leaderboard/prestige (recommended start), global economy/single Flux (reintroduces cross-shard economics — defer), world/seasonal events (deterministic). MVP: leaderboard + Main-GM narrative only.

## Economy health rule

Sink (actions + burn + GM-compute fee) must be ≥ emission (tile yield), or it's a slow ponzi. GM compute is real cost; metering it in Flux gives the token a cost basis — mandatory at scale, not cosmetic. Win-win: players who build the world earn; protocol takes a fee on throughput; token value tracks activity, not hype. (Cautionary precedent: web3 games that were financial-products-first collapsed when token prices dropped — Holdfast must be fun without the token.)

## Owner context

- GitHub org: holdfast-fdn. Indonesia. Windows/WSL2.
- Strong smart-contract security auditor (EVM/Base). Write/review contracts at audit grade; settlement contract holds funds → highest scrutiny.
- Prefers restrained, professional tone over hype.
- Pattern noted in-session: many strong project starts; the differentiator is finishing one. Holdfast's value is execution to a playable MVP, not more ideas.
