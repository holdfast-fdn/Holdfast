# BALANCE.md — Phase 1 parameter recommendation

> **REVISION 2 (emission accounting fix).** Porting settlement to Solidity
> exposed an accounting error in every net/tick figure below: on-chain, a
> garrison is REAL escrowed Flux (a winning commit becomes the garrison and
> later pays spoils/burns), therefore **garrison regen is minted supply** and
> decay is burned supply. The original lab counted only tile yield as
> emission, overstating deflation by ~regen×tiles per tick. With corrected
> accounting the old recommended set (yield 6, regen 4) is **+11.2 INF**, not
> −18.8 DEF. The recommendation below is re-tuned (yield 6→4, regen 4→2);
> net/tick figures in §1–§4 tables predate the fix and overstate deflation by
> up to +36/tick — their *comparative* conclusions (hegemony, decay verdict,
> degeneracy) are unaffected. §2b and §6 use corrected numbers.

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
| yield/tile/tick | **4.0** | 12.0 | rev2: with regen counted as emission, yield 6 was inflationary |
| garrison regen | **2.0** | 4.0 | rev2: regen is MINTED supply (on-chain escrow semantics); 4 inflates at any yield |
| garrison cap | 200.0 | 200.0 | unchanged |
| garrison decay | **0.0 (off)** | n/a | decay did not help — see decision below |
| starting balance | 250.0 | 250.0 | unchanged |

Headline metrics of the recommended set rev2 (mixed-archetype roster,
corrected accounting): **upset rate 36.8% · holdings Gini 0.47 · net supply
−7.3 Flux/tick (deflationary) · late activity 1.46 contests/tick ·
runaway-hegemony 60% with passive bots, 40% with anti-leader play (see §6
and the noise caveat below).**

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

### 2b. Yield × regen re-tune (corrected emission accounting — rev2)

| set (a=0.5 d=1.3 β/γ=0.3) | upset | gini | net/tick | hegemony | late c/t |
|---|---|---|---|---|---|
| y6 regen4 (old rec) | 35.7% | 0.61 | **+11.2 INF** | 80% | 1.02 |
| y6 regen2 | 36.8% | 0.56 | −0.0 | 70% | 1.23 |
| **y4 regen2 (rec rev2)** | **36.8%** | **0.47** | **−7.3 DEF** | **60%** | **1.46** |
| y4 regen0 | 40.5% | 0.51 | −15.6 DEF | 60% | 1.15 |
| y3 regen2 | 34.0% | 0.39 | −3.4 DEF | 45% | 1.02 |

Regen 4 is inflationary at every yield tested. y4+regen2 keeps defense
recovery alive (garrisons still heal, the "holding" feel survives) while the
economy stays comfortably deflationary with the war activity *higher* than
the old recommendation. y4+regen0 burns harder but garrisons never recover —
rejected for feel; revisit with playtest data.

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
≥40% of tiles — a proxy for human anti-leader play), at the rev2 recommended
set with corrected accounting:

| roster | hegemony | net/tick | late c/t |
|---|---|---|---|
| mixed (no balancers) | 60% | −7.3 DEF | 1.46 |
| 2 balancers | **40%** | −11.2 DEF | 1.48 |
| whale + 3 balancers | 50% hegemony; whale is top holder in **50%** of runs | **−78.3 DEF** | 1.53 |

**Hegemony is primarily a player-behavior artifact, not resolver math.**
When anyone punishes the leader, α=0.5 makes the punishment bite: against
passive bots a 10× whale is top holder in 65–75% of runs (§5); against three
balancers that drops to 50% here (30% in the pre-rev2 measurement — both
runs agree on the direction, ±20pp seed noise applies), and the whale's
capital churns into the strongest burn measured in the lab (−78/tick).
Power rotates instead of locking. This is the empirical justification for
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
