# BALANCE.md — Phase 1 parameter recommendation

Output of Workstream A (see `docs/PLAN.md`). All numbers below come from
`sim/balance_lab.py` — 20 seeds × 30 ticks per parameter set, 9 tiles, 4 AI
bots, fully deterministic (seed `1000+i` drives both the AI rng and the VRF
prefix). Reproduce any table with:

```bash
cd sim
python3 balance_lab.py all     # or: sweep | archetypes | decay | tune | counter | whale
```

## Recommended playtest set

| Param | Value | Phase-0 value | Why it changed |
|---|---|---|---|
| α (diminishing returns) | **0.5** | 0.5 | unchanged — keeps ganging-up on a leader effective (see counter test) |
| δ (defender advantage) | **1.3** | 1.3 | unchanged — "taking costs more than holding" principle intact; mid-band is fine |
| γ (spoils ratio) | **0.3** | 0.5 | smaller spoils = less snowball fuel for winners, bigger burn |
| β (defend reward) | **0.3** | 0.5 | smaller reward = leaders fed less by failed attacks against them, bigger burn |
| yield/tile/tick | **6.0** | 12.0 | at 12 the economy inflates whenever activity dips; at 6 it stays deflationary |
| garrison regen | 4.0 | 4.0 | unchanged |
| garrison cap | 200.0 | 200.0 | unchanged |
| garrison decay | **0.0 (off)** | n/a | decay did not help — see decision below |
| starting balance | 250.0 | 250.0 | unchanged |

Headline metrics of the recommended set (mixed-archetype roster):
**upset rate 35.7% · holdings Gini 0.61 · net supply −18.8 Flux/tick
(deflationary) · world stays active through the final ticks (1.0
contests/tick) · runaway-hegemony 80% with passive bots, dropping to 50%
with anti-leader play (see §6 and the noise caveat below).**

## Metric definitions

- **upset** — the side with <50% win probability won. Healthy band ≈ 25–40%:
  enough that underdogs matter, not so much that commitment feels pointless.
- **Gini** — inequality of final tile holdings across players (0 = equal).
- **net/tick** — (total emission − total burn) / ticks. Negative = deflationary.
- **hegemony** — one player held ≥50% of all tiles through the last 5 ticks.
- **late activity** — contests/tick over the final third (0 ≈ dead world).
- **cursed tiles** — ≥4 failed attacks and zero ownership changes in a run.

### Noise caveat (read before quoting hegemony numbers)

Hegemony rates are **high-variance at 20 seeds**: changing nothing but the
VRF stream (e.g. renaming players, which alters contest hashes) moves
individual cells by ±20pp. Robust findings across streams: the **economy
direction** (yield 6 + β/γ 0.3 is always deflationary, yield 12 always
inflationary), the **all-turtle degeneracy**, the **decay verdict**, and the
**balancer effect** (anti-leader play always cuts hegemony and whale
dominance sharply). Treat any single hegemony percentage as ±20pp.

## Evidence

### 1. α × δ sweep (default economy: yield 12, γ=β=0.5)

Every cell was inflationary (+16 to +28 Flux/tick) and hegemony ran 55–80%.
Conclusion: α and δ alone cannot fix the economy or the snowball — the
economy knobs (yield, γ, β) had to move. α=0.5 keeps upsets at the top of
the healthy band (33.7–41.2% vs 31.5–34.7% at α=1.0); δ=1.3 sits
comfortably mid-band.

### 2. Economy tuning (yield × β/γ × decay, 24 sets)

| set (a=0.5 d=1.3) | upset | gini | net/tick | hegemony | late c/t |
|---|---|---|---|---|---|
| y12 β/γ=0.5 | 37.5% | 0.60 | **+20.8 INF** | 80% | 1.18 |
| y12 β/γ=0.3 | 37.7% | 0.57 | −0.2 DEF | 65% | 1.55 |
| y6 β/γ=0.5 | 38.7% | 0.60 | −6.2 DEF | 75% | 1.01 |
| **y6 β/γ=0.3 (recommended)** | **35.7%** | **0.61** | **−18.8 DEF** | **80%** | **1.02** |

Yield 6 + β/γ 0.3 is the only family that is robustly deflationary (−12 to
−19 across all α/δ cells tested) while the world stays active. This directly
enforces the "sink ≥ emission" rule from CLAUDE.md without yet relying on
the GM-compute fee. Hegemony within this family ranged 30–80% across cells —
see the noise caveat; §6 shows behavior, not parameters, is what moves it.

### 3. Archetype matrix (degenerate-equilibrium check)

| roster | gini | net/tick | hegemony | late c/t |
|---|---|---|---|---|
| all-turtle | 0.01 | **+80.1 INF** | 0% | **0.03 (dead)** |
| all-raider | 0.51 | −9.5 DEF | 50% | 2.64 |
| all-opportunist | 0.29 | +52.5 INF | 35% | 0.06 (dies out) |
| mixed | 0.60 | +20.8 INF | 80% | 1.18 |

**The all-turtle world is the confirmed degenerate equilibrium**: nobody
attacks, emission runs unopposed, the token inflates ~80 Flux/tick. Passive
worlds are the economic worst case, not aggressive ones. Implication for
later phases: the GM-compute fee (every action costs Flux) plus quiet-world
emission throttling are the structural answers; within Phase-1 scope, low
yield (6) limits the damage.

### 4. Garrison decay — DECISION: keep it off (0.0)

| decay | upset | net/tick | hegemony | flips | cursed |
|---|---|---|---|---|---|
| 0.00 | 37.5% | +20.8 | 80% | 20.4 | 0.1 |
| 0.03 | 37.9% | +23.9 | 75% | 21.8 | 0.1 |
| 0.08 | 45.1% | +41.7 | **100%** | 22.5 | 0.1 |

The Phase-0 "cursed tile" (failed attacks harden a tile into a permanent
stalemate) **does not reproduce as a systemic problem** over 30-tick runs —
cursed tiles average 0.0–0.6 per run even with decay off. Decay meanwhile
*worsens* hegemony at the aggressive end (eroded defenses help the strongest
attacker most) and inflates the economy (less garrison burned per conquest).
Decision: ship MVP with `garrison_decay = 0`; revisit only if real players
manufacture stalemates. Recorded in `docs/MEMORY.md`.

### 5. Whale test (one 10× player)

| α | whale is top holder | average top share |
|---|---|---|
| 0.5 | 75% of runs | 87.2% |
| 0.7 | 65% | 78.3% |
| 1.0 | 75% | 85.0% |

Against bots that never coordinate, a 10× whale dominates at every α — α
alone cannot neutralize capital (already documented in MEMORY.md). The real
counterweight is behavioral:

### 6. Counter-hegemony (the key finding)

Adding `balancer` bots (raiders that target the current leader once it holds
≥40% of tiles — a proxy for human anti-leader play), at the recommended set:

| roster | hegemony | net/tick | late c/t |
|---|---|---|---|
| mixed (no balancers) | 80% | −18.8 | 1.02 |
| 2 balancers | **50%** | −31.3 | 1.94 |
| whale + 3 balancers | 70%, but whale is top holder in only **30%** of runs | −51.4 | 1.74 |

**Hegemony is primarily a player-behavior artifact, not resolver math.**
When anyone punishes the leader, α=0.5 makes the punishment bite: the
whale's top-holder rate collapses from 75% (vs passive bots) to 30%, war
intensity roughly doubles, and the economy flips into the strongest
deflation measured in the lab. Note the residual 70% hegemony in the whale
row: the balancers often overthrow the whale and one of *them* snowballs —
power rotates instead of locking. This is the empirical justification for
keeping α at 0.5.

## Honest limitations

- Bots are simple heuristics; real players will find strategies (collusion,
  garrison games) no archetype models. Only the Phase-4 playtest is decisive.
- 4 players / 9 tiles / 30 ticks; longer horizons may drift.
- Hegemony estimates carry ±20pp seed noise (see caveat); judge it by the
  balancer contrast, not by any single cell. Watch this metric first in the
  playtest.
- The inflation observed in quiet worlds is the standing argument for the
  GM-compute fee sink (mandatory at scale — CLAUDE.md).
