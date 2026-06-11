# PLAN — Immediate next actions

Short-horizon working plan for Claude Code. Covers Phase 1 and the start of Phase 2 (see `ROADMAP.md` for the full arc). Pick up here.

## Right now

Phase 0 is done. Ground yourself first:
```bash
python3 sim/resolver.py
python3 sim/world_sim.py
```

## Workstream A — Balance lab (Phase 1)

Goal: a parameter set no single strategy can dominate.
1. Refactor `world_sim.py` so α, δ, yield, garrison regen, starting balance are arguments, not module constants. Add `run_sweep()` running N seeds per set; report upset rate, holdings Gini, economy direction (net supply), runaway-hegemony check.
2. AI archetypes: `turtle`, `raider`, `opportunist`. Watch for degenerate equilibria (all-turtle world where nothing happens).
3. Garrison-decay decision: the "cursed tile" (failed attacks harden it) may cause stalemates. Add optional per-tick decay, compare, document the choice in MEMORY.md.
4. Whale test: one 10× player; confirm α keeps it competitive.
- Output: `docs/BALANCE.md` with the recommended set + evidence.

## Workstream B — On-chain resolver (Phase 2 start)

Begin once A's parameters are roughly settled (so the contract targets the right math).
1. Scaffold Foundry in `contracts/`, target Base Sepolia.
2. Decide fixed-point `x^α` for fractional α (e.g. fixed-point lib, lookup, or restrict α to cheap roots like 0.5→sqrt). Document the precision trade-off.
3. **Parity harness first** — run identical inputs through `sim/resolver.py` fixtures and the Solidity resolver, assert equal. Write this test before the contract is complete; it defines "correct."
4. Minimal contracts: Flux ERC-20, tile registry, settlement entry (state root + Merkle distribution).

## Guardrails (from CLAUDE.md / MEMORY.md / ADRs)

- Solidity resolver must reproduce `sim/resolver.py` exactly. Parity test is the gate.
- One tick = one settlement tx per region/continent. Never per-action.
- Never let any GM decide outcomes (recursive — ADR-001).
- Sink ≥ emission. Re-check with the sim after any economic change.
- Settlement holds player funds → audit-grade scrutiny, unprivileged-attacker drain analysis.
- Keep scaling doors open without building scaling: region/continent = config; resolver region-agnostic; GM stateless.
- No Godot/heavy engine on the critical path (ADR-002).

## Not yet

- Hermes integration (Phase 3) — premature until the contract is parity-tested.
- Indexer + production companion (Phase 5).
- Fraud proofs, multi-continent, GM hierarchy, global layer (Phase 6).
- 3D client. Token launch (legal review gates it).

## First commit

Init the repo, commit docs + sim + brand + ui as baseline, then start Workstream A on a branch. Keep `sim/resolver.py` stable — it is the spec other code is tested against.
