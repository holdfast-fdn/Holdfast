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
import { ComputeMeter } from "../src/computeMeter.js";
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

function makeScheduler(narrator: Narrator, meter?: ComputeMeter) {
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
  });
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
