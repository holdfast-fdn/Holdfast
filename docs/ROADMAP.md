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
- [x] Randomness architecture: commit-then-randomness flow (openTick batch commitment → fulfillWord by a separate provider, immutable → settleTick verifies the hash) kills post-word censorship and makes grinding publicly auditable (reopen counter). Remaining for value deployments: swap the testnet EOA provider for a Chainlink VRF v2.5 adapter written against current docs at deploy time (AUDIT.md M-2).
- [x] Deployed to Base Sepolia 2026-06-12 (`docs/DEPLOYMENTS.md`): FluxToken `0xEf3c…d665`, HoldfastSettlement `0x68C2…Af49`; region 0 genesis = 9 wild isles, rev2 params; live companion verified against the public RPC.
- [x] Settlement contract (`HoldfastSettlement.sol`): one tx per tick — emission (yield + regen minted) then contests resolved ON-CHAIN via ResolverLib with enforced batch ordering, afford checks, escrowed garrisons, bucket2Root committed per tick. Design note: at MVP scale full on-chain resolution replaces the planned Merkle reward distribution (strictly more trustless); Merkle claims become relevant at player counts where direct escrow updates are too costly.
- [x] Testnet onboarding: `enroll()` — owner credits starting escrow (minted, publicly evented). Deliberately centralized for the Phase-4 closed playtest; MUST be replaced by a reviewed distribution + legal clearance before any value deployment.
- [x] Settlement-level parity mirror (`sim/settlement_fixed.py` + vendored stdlib-only keccak256 verified against `cast keccak`): generated 6-tick war replay (`SettlementParity.t.sol`) asserts escrows + total supply after EVERY tick and the final tile map, bit-for-bit — full-tick semantics (emission, batch order, per-contest keccak words, wilds burn) now under the gate.
- [x] **Parity test (the correctness gate), contest-math level:** `contracts/test/ResolverParity.t.sol` asserts `ResolverLib` reproduces `sim/resolver_fixed.py` (the integer spec, ≤2e-16 from the float reference) bit-for-bit over 87 fixtures + fuzz properties. α fixed at 0.5 → exact floor `sqrt`; fractional-α pow deferred deliberately. Extend the gate to full settlement when the contract lands.
- [x] Self-audit (`docs/AUDIT.md`): drain analysis found and FIXED two real issues — operator intent forgery (now EIP-712-signed intents, censor-but-never-forge) and whole-tick grief via underfunded contests (now skip-with-event semantics, under the parity gate). Open/accepted: operator-chosen randomWord (M-2 — VRF mandatory before value), Bucket-2 modifier trust (bucket2Root), enroll faucet. External audit still gates Phase 6.

**Exit:** bit-identical settlement results across the full Phase-0 scenario set; self-audit finds no critical/high issues.

## Phase 3 — Hermes GM integration

Wire narrative + intent atop proven mechanics.
- [ ] NL → structured intent skill (validate translation accuracy on a test set).
- [ ] Narrative layer (Bucket 3): GM narrates outcomes the resolver already decided; never asserts an outcome the chain didn't produce.
- [x] AI faction agents (the GM-as-player core): `gm/src/faction.ts` — FactionAgent seat with full world view + persistent memory; HeuristicFactionAgent stand-in (sim archetypes) + HermesFactionAgent slot; scheduler folds faction moves into the tick batch as signed intents. Demonstrated autonomously on Base Sepolia (the Ashen Horde took an isle on honest VRF). Wiring Hermes replaces only decide().
- [ ] Memory wiring: cross-session relationships/lore in GM memory; outcome-affecting modifiers promoted to Bucket 2 (faction memory structure exists; Hermes fills it).
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
- [x] Companion live-read prototype: `ui/holdfast-isles.html?rpc=…&settlement=0x…` renders tiles/owners/garrisons via raw `eth_call` and the war log via `ContestSettled` logs — zero dependencies, falls back to demo data without params (verified against a seeded anvil via `gm/scripts/devworld.mjs`). At MVP scale this needs no indexer; an indexer still becomes worthwhile for history/scale. Map art: purchased Moon Tribe pack (local-only assets, see ui/assets/README.md); three.js hero map still optional (3D pack on hand).
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
