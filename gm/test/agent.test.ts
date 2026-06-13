/**
 * Agent protocol tests — the public-arena trust boundary.
 *
 * The thing that MUST hold: a move signed by an external agent's own key
 * recovers to that agent's address under the published Intent schema, and any
 * tamper breaks the recovery. That is what stops the operator forging moves.
 */

import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { recoverTypedDataAddress } from "viem";
import { AgentIntentPool } from "../src/agentPool.js";
import { holdfastDomain, INTENT_TYPES } from "../src/signer.js";
import type { Address, SignedContest } from "../src/types.js";

const CHAIN = 84532;
const SETTLEMENT = "0x68C2Ef4544aA0071ebC98bD7bdAb958C11C3Af49" as Address;

const aliceKey = generatePrivateKey();
const alice = privateKeyToAccount(aliceKey);

function signMove(account = alice, over = {}) {
  const message = {
    regionId: 0n, tick: 24n, tileId: 5n, committed: 120n * 10n ** 18n, ...over,
  };
  return account.signTypedData({
    domain: holdfastDomain(CHAIN, SETTLEMENT),
    types: INTENT_TYPES, primaryType: "Intent", message,
  }).then((signature) => ({ message, signature }));
}

describe("Intent EIP-712 schema", () => {
  it("recovers to the agent's own address (operator cannot forge)", async () => {
    const { message, signature } = await signMove();
    const recovered = await recoverTypedDataAddress({
      domain: holdfastDomain(CHAIN, SETTLEMENT),
      types: INTENT_TYPES, primaryType: "Intent", message, signature,
    });
    expect(recovered.toLowerCase()).toBe(alice.address.toLowerCase());
  });

  it("a tampered commit no longer recovers to the signer", async () => {
    const { message, signature } = await signMove();
    const recovered = await recoverTypedDataAddress({
      domain: holdfastDomain(CHAIN, SETTLEMENT),
      types: INTENT_TYPES, primaryType: "Intent",
      message: { ...message, committed: 999n * 10n ** 18n }, // raised the stake
      signature,
    });
    expect(recovered.toLowerCase()).not.toBe(alice.address.toLowerCase());
  });

  it("a different domain (wrong contract) breaks recovery", async () => {
    const { message, signature } = await signMove();
    const other = "0x0000000000000000000000000000000000001234" as Address;
    const recovered = await recoverTypedDataAddress({
      domain: holdfastDomain(CHAIN, other),
      types: INTENT_TYPES, primaryType: "Intent", message, signature,
    });
    expect(recovered.toLowerCase()).not.toBe(alice.address.toLowerCase());
  });
});

function contest(attacker: Address, tileId: bigint): SignedContest {
  return {
    tileId, attacker, committed: 1n, attackerMod: 1n, sigV: 27,
    sigR: "0x00", sigS: "0x00",
  };
}

describe("AgentIntentPool", () => {
  it("keeps one live intent per (attacker, tile) — newer replaces older", () => {
    const pool = new AgentIntentPool();
    const a = alice.address.toLowerCase() as Address;
    pool.add({ tick: 1n, display: "a", contest: contest(a, 5n) });
    pool.add({ tick: 1n, display: "a", contest: { ...contest(a, 5n), committed: 9n } });
    pool.add({ tick: 1n, display: "a", contest: contest(a, 6n) });
    expect(pool.size()).toBe(2); // tiles 5 and 6
    const drained = pool.drain();
    expect(drained.find((d) => d.contest.tileId === 5n)?.contest.committed).toBe(9n);
  });

  it("drain empties the pool", () => {
    const pool = new AgentIntentPool();
    pool.add({ tick: 1n, display: "a", contest: contest(alice.address as Address, 1n) });
    pool.drain();
    expect(pool.size()).toBe(0);
  });

  it("rate-limits per address", () => {
    const pool = new AgentIntentPool({ ratePerWindow: 2, rateWindowMs: 10_000 });
    const a = alice.address as Address;
    expect(pool.allow(a)).toBe(true);
    expect(pool.allow(a)).toBe(true);
    expect(pool.allow(a)).toBe(false); // budget spent
    const bob = privateKeyToAccount(generatePrivateKey()).address as Address;
    expect(pool.allow(bob)).toBe(true); // independent budget
  });

  it("respects the global capacity ceiling", () => {
    const pool = new AgentIntentPool({ maxEntries: 1 });
    const a = privateKeyToAccount(generatePrivateKey()).address as Address;
    const b = privateKeyToAccount(generatePrivateKey()).address as Address;
    expect(pool.add({ tick: 1n, display: "a", contest: contest(a, 1n) })).toBe(true);
    expect(pool.add({ tick: 1n, display: "b", contest: contest(b, 1n) })).toBe(false);
    // an existing slot can still be overwritten even when full
    expect(pool.add({ tick: 1n, display: "a", contest: contest(a, 1n) })).toBe(true);
  });
});
