/**
 * Compute metering + narration decoupling.
 *
 *  - ComputeMeter prices Hermes token usage in Flux (the sink, CLAUDE.md).
 *  - Resolution must NEVER depend on narration: a Hermes that throws after a
 *    tick has settled on-chain must not reject the tick or trigger a re-run.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ComputeMeter, type ComputeSink } from "../src/computeMeter.js";
import { makeComputeSink } from "../src/chain.js";
import { TickDriver, type ChainOps } from "../src/driver.js";
import { IntentPool } from "../src/intentPool.js";
import type { Narrator } from "../src/narrator.js";
import { TickScheduler, type RawTickSummary } from "../src/scheduler.js";
import { CustodialSigner, WAD } from "../src/signer.js";
import type { Address, SignedContest } from "../src/types.js";

describe("ComputeMeter", () => {
  it("prices tokens in Flux and accumulates within a tick", () => {
    const m = new ComputeMeter(0.5); // 0.5 Flux per 1k tokens
    m.record(1000);
    m.record(500);
    expect(m.tickTokensUsed()).toBe(1500);
    expect(m.tickFlux()).toBeCloseTo(0.75);
  });

  it("reset clears the tick window but keeps the lifetime total", () => {
    const m = new ComputeMeter(1);
    m.record(2000);
    m.reset();
    m.record(1000);
    expect(m.tickFlux()).toBeCloseTo(1);   // this tick only
    expect(m.totalFlux()).toBeCloseTo(3);  // 2000 + 1000 tokens
  });

  it("ignores missing/zero usage", () => {
    const m = new ComputeMeter(1);
    m.record(0);
    expect(m.tickFlux()).toBe(0);
  });
});

class MockOps implements ChainOps {
  settledTick = 0n;
  async openTick() { return "0xopen" as const; }
  async fulfillWord() { return "0xword" as const; }
  async settleTick() { this.settledTick += 1n; return "0xsettle" as const; }
  async lastSettledTick() { return this.settledTick; }
}

const SUMMARY: RawTickSummary = {
  outcomes: [], minted: 26n * WAD, burned: 40n * WAD, skipped: [],
};

function makeScheduler(narrator: Narrator, meter?: ComputeMeter, sink?: ComputeSink) {
  const dir = mkdtempSync(join(tmpdir(), "holdfast-compute-"));
  const ops = new MockOps();
  return new TickScheduler({
    regionId: 0n, chainId: 31337,
    settlement: "0x0000000000000000000000000000000000facade" as Address,
    pool: new IntentPool(),
    signer: new CustodialSigner(join(dir, "keys.json")),
    driver: new TickDriver(ops, async () => 7n, join(dir, "state"),
      { maxAttempts: 1, retryDelayMs: 1 }),
    ops,
    readSummary: async (): Promise<RawTickSummary> => SUMMARY,
    narrator,
    announce: async () => {},
    meter,
    sink,
  });
}

/** a narrator that also "spends" tokens, simulating a Hermes call mid-tick */
function spendingNarrator(meter: ComputeMeter, tokens: number): Narrator {
  return { narrate() { meter.record(tokens); return "prose"; } };
}

describe("narration is decoupled from resolution", () => {
  it("a narrator that throws does not reject a settled tick", async () => {
    const exploding: Narrator = {
      narrate() { throw new Error("hermes down"); },
    };
    const scheduler = makeScheduler(exploding, new ComputeMeter(0.5));
    const rec = await scheduler.runOnce();
    expect(rec.phase).toBe("settled"); // chain disposed; prose failing is fine
  });

  it("resets the meter window each tick", async () => {
    const meter = new ComputeMeter(0.5);
    meter.record(5000); // leftover from a prior tick
    const ok: Narrator = { narrate: () => "quiet" };
    await makeScheduler(ok, meter).runOnce();
    expect(meter.tickTokensUsed()).toBe(0); // runOnce reset it at the start
  });
});

describe("compute sink realised on-chain", () => {
  const WAD = 10n ** 18n;

  it("burns the metered Flux after settlement", async () => {
    const meter = new ComputeMeter(0.5);            // 0.5 Flux / 1k tokens
    const burns: bigint[] = [];
    const sink: ComputeSink = {
      totalBurned: () => 0n,
      async burn(wad) { burns.push(wad); return { hash: "0xburn", burned: wad }; },
    };
    // 2000 tokens spent mid-tick -> 1.0 Flux compute -> burn 1e18
    await makeScheduler(spendingNarrator(meter, 2000), meter, sink).runOnce();
    expect(burns).toHaveLength(1);
    expect(burns[0]).toBe(1n * WAD);
  });

  it("a failing burn never rejects a settled tick (best-effort)", async () => {
    const meter = new ComputeMeter(0.5);
    const sink: ComputeSink = {
      totalBurned: () => 0n,
      async burn() { throw new Error("rpc down"); },
    };
    const rec = await makeScheduler(spendingNarrator(meter, 1000), meter, sink).runOnce();
    expect(rec.phase).toBe("settled");
  });

  it("does not call the sink when no compute was spent", async () => {
    const meter = new ComputeMeter(0.5);
    let called = false;
    const sink: ComputeSink = {
      totalBurned: () => 0n,
      async burn() { called = true; return null; },
    };
    await makeScheduler({ narrate: () => "quiet" }, meter, sink).runOnce();
    expect(called).toBe(false);
  });
});

describe("makeComputeSink", () => {
  const WAD = 10n ** 18n;
  function fakeChain(balance: bigint) {
    return {
      readContract: async () => balance,
      waitForTransactionReceipt: async () => ({ status: "success" }),
    } as never;
  }
  const treasury = {
    account: { address: "0x00000000000000000000000000000000000beef0" },
    chain: {}, writeContract: async () => "0xburn",
  } as never;

  it("caps the burn at the treasury balance", async () => {
    const sink = makeComputeSink(fakeChain(3n * WAD), treasury, "0xflux" as Address, [] as never);
    const r = await sink.burn(10n * WAD);
    expect(r?.burned).toBe(3n * WAD); // capped
    expect(sink.totalBurned()).toBe(3n * WAD);
  });

  it("returns null on an empty treasury (sink owed, unrealised)", async () => {
    const sink = makeComputeSink(fakeChain(0n), treasury, "0xflux" as Address, [] as never);
    expect(await sink.burn(5n * WAD)).toBeNull();
  });

  it("ignores a non-positive amount", async () => {
    const sink = makeComputeSink(fakeChain(99n * WAD), treasury, "0xflux" as Address, [] as never);
    expect(await sink.burn(0n)).toBeNull();
  });
});
