# ROADMAP — Holdfast

Phased build plan, lowest risk to highest. Guiding rule: **validate the loop is fun before building trustless machinery or scaling.** Each phase has an exit criterion — do not advance until it is met.

---

## Phase 0 — Mechanical validation ✅ DONE

- [x] Pure-function resolver (`sim/resolver.py`): contest math, VRF abstraction, sink accounting.
- [x] Scenarios: even fight, win curve, whale-split trade-off, reproducibility, Monte Carlo bias check.
- [x] Multi-tick world sim (`sim/world_sim.py`): resource generation, offline AI factions, balances, emergent events.
- [x] Brand identity (`brand/`) and UI previews (`ui/`): Telegram (primary), illustrative isles companion, dashboard, isometric engine scaffold.

**Exit (met):** simulation produces emergent drama and a self-correcting (deflationary-while-active) economy without any narrative layer.

## Phase 1 — Tuning & balance lab ✅ DONE

Use the simulation as a balance lab. No new architecture.
- [x] Parameterize α, δ, yield, garrison regen, starting balance; run N seeds per set; report upset rate, holdings Gini, economy direction, runaway-hegemony check (`sim/balance_lab.py`).
- [x] AI archetypes (turtle, raider, opportunist, + balancer); degenerate equilibrium found: the all-turtle world (+80 Flux/tick inflation).
- [x] Garrison-decay decision: OFF — cursed tiles are not systemic; decay worsens hegemony.
- [x] Whale test: α alone cannot contain a 10× whale vs passive bots; anti-leader play at α=0.5 collapses whale dominance 75%→30%.
- [x] Output: `docs/BALANCE.md` — recommended set α=0.5 δ=1.3 γ=0.3 β=0.3 yield=6.

**Exit (met, with caveat):** economy provably healthy while the world is active; hegemony is behavior-dependent (±20pp seed noise) — final verdict belongs to the Phase-4 playtest.

## Phase 2 — On-chain settlement (Base testnet)

Reproduce the resolver on-chain. Highest-audit-surface artifact — write at audit grade.
- [x] Flux ERC-20 (`FluxToken.sol` — minimal, settlement is sole minter, open burn; not yet deployed to Base Sepolia).
- [x] Tile registry (ownership + garrison + terrain mod, inside `HoldfastSettlement.sol`; region = config per ADR-001).
- [ ] VRF integration for the per-tick seed (currently an operator-supplied word, committed in the TickSettled event — trusted-but-verifiable; real VRF before any value).
- [x] Settlement contract (`HoldfastSettlement.sol`): one tx per tick — emission (yield + regen minted) then contests resolved ON-CHAIN via ResolverLib with enforced batch ordering, afford checks, escrowed garrisons, bucket2Root committed per tick. Design note: at MVP scale full on-chain resolution replaces the planned Merkle reward distribution (strictly more trustless); Merkle claims become relevant at player counts where direct escrow updates are too costly.
- [ ] Production onboarding: how players acquire starting Flux (faucet/distribution) — open design item; tests fund via minter prank.
- [ ] Settlement-level parity mirror in Python (tick-for-tick vs `world_sim`), extending the contest-math parity gate.
- [x] **Parity test (the correctness gate), contest-math level:** `contracts/test/ResolverParity.t.sol` asserts `ResolverLib` reproduces `sim/resolver_fixed.py` (the integer spec, ≤2e-16 from the float reference) bit-for-bit over 87 fixtures + fuzz properties. α fixed at 0.5 → exact floor `sqrt`; fractional-α pow deferred deliberately. Extend the gate to full settlement when the contract lands.
- [ ] Self-audit: reentrancy, precision, access control, pause/upgrade story, unprivileged-attacker drain vectors.

**Exit:** bit-identical settlement results across the full Phase-0 scenario set; self-audit finds no critical/high issues.

## Phase 3 — Hermes GM integration

Wire narrative + intent atop proven mechanics.
- [ ] NL → structured intent skill (validate translation accuracy on a test set).
- [ ] Narrative layer (Bucket 3): GM narrates outcomes the resolver already decided; never asserts an outcome the chain didn't produce.
- [ ] Memory wiring: cross-session relationships/lore in GM memory; outcome-affecting modifiers promoted to Bucket 2.
- [ ] Cron tick driver with completion checks + retries (Hermes cron is unreliable — never trust a single fire).
- [ ] Trusted-but-verifiable publishing of all tick inputs.

**Exit:** a full tick runs end-to-end — player NL → intent → resolver → Base settlement → GM narration → memory update — with the GM provably unable to alter outcomes.

## Phase 4 — Closed playtest (10 players, one continent)

The real test. Everything before is preparation.
- [ ] Onboard ~10 real players on testnet via Telegram.
- [ ] Daily ticks for 2–4 weeks.
- [ ] Watch: collusion, defensive/garrison exploits, whether offline evolution creates the "my world changed overnight" feeling, tick-to-tick retention.
- [ ] Re-tune parameters from real data.

**Exit:** players return between ticks unprompted, and at least one emergent player-driven story (alliance, rivalry, comeback) occurs without GM scripting.

## Phase 5 — Companion polish & indexer

- [ ] Indexer (Ponder-like) reading chain events + tick inputs to serve UIs.
- [ ] Production web companion: swap hardcoded state for indexer feed; drop in Kenney (CC0) art; optional three.js "hero map."
- [ ] Telegram UX hardening (onboarding, error states).

## Phase 6 — Scaling & hardening (only if Phase 4 succeeds)

- [ ] Decide the global layer (start: leaderboard + Main-GM narrative; defer global economy) — ADR-001.
- [ ] Multi-continent provisioning (continent = config, not rewrite).
- [ ] Optional hierarchical GM (sub-GM per continent → Main GM narrative) if a single continent must host many players.
- [ ] Dispute model decision (keep trusted-but-verifiable, or build optimistic + fraud proofs).
- [ ] External security audit; legal review (incl. Indonesia / Bappebti / OJK); token launch design.

**Exit:** clean external audit, legal clarity, sustainable launch + scaling plan.

## Anti-goals (do not do early)

- Fraud proofs before the world is proven fun.
- Multi-continent infra, the GM hierarchy, or the global layer before Phase 4.
- 3D client / Godot or any heavy engine on the critical path (ADR-002).
- Token launch before legal review.
- Any architecture letting a GM (sub or main) decide outcomes — at any phase.
