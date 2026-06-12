# AUDIT.md — Phase 2 self-audit (settlement stack)

Self-review of `contracts/src/` at audit grade, per ROADMAP Phase 2. This is
NOT an external audit; it is the structured record of the unprivileged-
attacker drain analysis, what was fixed, and what risk is knowingly carried
into the closed testnet. An external audit gates any value deployment
(Phase 6).

**Scope:** `FluxToken.sol`, `ResolverLib.sol`, `HoldfastSettlement.sol`
@ branch `balance-lab`, 2026-06-12.

## Threat model

| Actor | Capabilities |
|---|---|
| Unprivileged attacker | any public call; crafted calldata; reentrancy attempts |
| Malicious player | signs intents, deposits/withdraws at will, griefs timing |
| Malicious operator | full control of `settleTick` inputs: batch contents, `randomWord`, `bucket2Root`, Bucket-2 modifiers |
| Malicious owner | region genesis, `enroll` minting, operator rotation |

## Findings

### H-1 (fixed) — Operator could forge intents and bleed any escrow

`settleTick` deducted `escrow[attacker]` from operator-supplied inputs with
no proof the player ever issued the intent. A malicious operator could
fabricate "victim attacks X with their whole escrow" losing battles:
β (30%) to a colluding defender, the rest burned — repeatable every tick
until the victim's escrow was empty.

**Fix:** every contest now carries an EIP-712 signature binding
`(regionId, tick, tileId, committed)` — the funds-at-risk facts — verified
on-chain (`_verifyIntent`): low-s only, v ∈ {27,28}, `ecrecover` must equal
the attacker. The signed tick gives replay protection across ticks;
duplicates within a tick are skipped (first/largest instance wins).
The operator can now **censor but never forge**.
Tests: `test_forged_intent_reverts`, `test_intent_cannot_replay_another_tick`,
`test_duplicate_attacker_skips_second`.

Deliberate scope note: `attackerMod` is outside the signature — it is
GM-computed Bucket-2 state known only at tick close, and inflating it
helps (never hurts) the signer. Its accountability channel is `bucket2Root`
(see L-1).

### M-1 (fixed) — Any player could grief the whole region's tick

The escrow deduction used checked arithmetic: one underfunded contest
reverted the entire batch. A player could sign an intent, withdraw their
escrow before tick close, and block settlement for everyone, every tick.

**Fix:** split fault classes. STRUCTURAL faults (ordering, bounds,
minCommit, bad signature) are operator responsibility → revert.
STATE-dependent conditions (escrow drained after signing, self-attack
arising from earlier same-tick conquests, duplicates) → **skip** with a
`ContestSkipped(reason)` event. The skip path is itself under the
settlement parity gate (the generated 6-tick war includes a forced skip).
Tests: `test_state_conditions_skip_not_revert`, `test_self_attack_skips`.

### M-2 (substantially mitigated; residual accepted for closed testnet) — tick randomness

Original issue: the operator both chose the batch AND supplied `randomWord`
in one call — it could grind words for favorable rolls, or watch a word and
then censor specific contests.

**Structural fix (commit-then-randomness):** the tick is now three steps —
`openTick(batchHash)` commits the batch BEFORE any randomness exists;
`fulfillWord` is callable only by a separate `randomnessProvider` and the
word is immutable once set; `settleTick` requires the submitted batch to
hash to the pre-randomness commitment. Re-opening a tick after a word was
drawn voids the word, forces a fresh draw, and increments a PUBLIC
`reopens` counter + `TickReopened` event — an honest operator's counter
stays at zero, so any grinding attempt is visible on-chain.
Tests: `test_randomness_flow_guards`, `test_reopen_is_public_and_voids_word`.

**Residual (accepted, testnet only):** on the closed playtest the provider
is a trusted EOA — operator+provider collusion could still grind via
public reopens (auditable, bounded by reopen events). For any deployment
where Flux has value, the provider MUST be a verifying VRF consumer
contract (recommended: Chainlink VRF v2.5 on Base; write the adapter
against current official docs at deploy time — see contracts/README.md).

### L-1 (accepted, documented) — Bucket-2 modifiers are operator-supplied

`attackerMod` / tile `modWad` shift win probabilities. Trust anchor:
`bucket2Root` is committed per tick; anyone can recompute the tick from
published Bucket-2 state and catch manipulation (trusted-but-verifiable).
Fraud proofs are a deliberate Phase-6 deferral.

### L-2 (accepted, testnet-only) — `enroll` / genesis garrisons mint freely

Owner-controlled minting is the closed-playtest faucet. Publicly evented,
cannot touch existing balances. MUST be replaced by a reviewed distribution
(plus legal clearance — CLAUDE.md) before value. Documented in natspec.

### I-1 — `powHalf` overflow bound

`sqrt(x * WAD)` reverts for `x > ~1.15e59` (checked mul). Unreachable below
~1.15e41 whole tokens of stake; a revert here is a safe failure, not a
drain. Documented in the library.

### I-2 — ERC-20 `approve` race

Standard known issue; mitigate client-side (approve 0 → N) if it ever
matters. No game path depends on partial allowances.

## Checklist

- **Reentrancy:** no token hooks (FluxToken is hook-free and immutable);
  deposit/withdraw follow CEI anyway; settlement makes no external calls
  except mint/burn/transfer on the trusted token.
- **Access control:** owner = genesis + operator rotation only; operator =
  settleTick only; minter wired one-shot. No role can move player escrow
  except through signed contests or the player's own withdraw.
- **Precision:** all floors, dust burns (conservative); bit-for-bit parity
  with the Python spec at three layers (sqrt/contest/settlement).
- **Upgradability/pause:** none, deliberately — there is no admin path to
  freeze or redirect player funds.
- **Solvency invariant:** `flux.balanceOf(settlement) == Σ escrow +
  Σ garrisons` asserted across every flow test and the parity war.
- **Conservation (drain in property form):** fuzzed at 2048 runs — attacker
  can never extract more than the garrison, defender never more than the
  commit.

## Gates currently green (2026-06-12)

`forge test`: 24/24 — 87-case contest parity + 3 fuzz properties +
19 settlement tests + 6-tick signed-war settlement parity (asserts escrows
and supply after every tick, final map, includes a skipped contest, and
cross-checks the Python secp256k1 address derivation against `vm.addr`).
