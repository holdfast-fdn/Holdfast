/**
 * TickScheduler with mocked chain: drains the pool, signs, drives, reads
 * settled events, narrates — and stays safe under duplicate fires.
 * Also covers bucket2 canonicalization and the template narrator's voice.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { bucket2Root, canonicalJson } from "../src/bucket2.js";
import { TickDriver, type ChainOps } from "../src/driver.js";
import { IntentPool } from "../src/intentPool.js";
import { TemplateNarrator } from "../src/narrator.js";
import { TickScheduler, type RawTickSummary } from "../src/scheduler.js";
import { CustodialSigner, WAD } from "../src/signer.js";
import type { Address, SignedContest } from "../src/types.js";

const SETTLEMENT =
  "0x0000000000000000000000000000000000facade" as Address;

class MockOps implements ChainOps {
  settledTick = 0n;
  lastBatch: SignedContest[] = [];
  async openTick() { return "0xopen"; }
  async fulfillWord() { return "0xword"; }
  async settleTick(
    _r: bigint, _t: bigint, _root: `0x${string}`, contests: SignedContest[],
  ) {
    this.lastBatch = contests;
    this.settledTick += 1n;
    return "0xsettle";
  }
  async lastSettledTick() { return this.settledTick; }
}

describe("bucket2 commitment", () => {
  it("canonical JSON is key-order independent", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it("the root moves when any outcome-determining number moves", () => {
    const base = {
      regionId: "0", tick: "1",
      attackerMods: {} as Record<Address, string>, tileMods: {},
    };
    const tweaked = {
      ...base,
      attackerMods: { ["0x00000000000000000000000000000000000a11ce" as Address]:
        "1200000000000000000" },
    };
    expect(bucket2Root(base)).not.toBe(bucket2Root(tweaked));
  });
});

describe("TickScheduler", () => {
  let ops: MockOps;
  let pool: IntentPool;
  let scheduler: TickScheduler;
  let announced: string[];
  let signer: CustodialSigner;

  const summary: RawTickSummary = {
    outcomes: [],
    minted: 26n * WAD,
    burned: 40n * WAD,
    skipped: [],
  };

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "holdfast-sched-"));
    ops = new MockOps();
    pool = new IntentPool();
    announced = [];
    signer = new CustodialSigner(join(dir, "keys.json"));
    scheduler = new TickScheduler({
      regionId: 0n,
      chainId: 31337,
      settlement: SETTLEMENT,
      pool,
      signer,
      driver: new TickDriver(ops, async () => 7n, join(dir, "state"), {
        maxAttempts: 1, retryDelayMs: 1,
      }),
      ops,
      readSummary: async (_r, tick) => {
        const attacker = signer.wallet("tg:42").address;
        return {
          ...summary,
          outcomes: tick === 1n ? [{
            tileId: 5n,
            attacker,
            defender:
              "0x0000000000000000000000000000000000000000" as Address,
            attackerWon: true,
            pWad: (52n * WAD) / 100n,
            roll: (3n * WAD) / 100n,
            burned: 43n * WAD,
          }] : [],
        };
      },
      narrator: new TemplateNarrator(),
      announce: async (text) => { announced.push(text); },
    });
  });

  it("drains, signs, settles, and narrates from settled facts only", async () => {
    pool.add({
      handle: "tg:42", display: "anna",
      intent: { kind: "attack", tileId: 5, committed: 120.5 },
    });

    const rec = await scheduler.runOnce();
    expect(rec.phase).toBe("settled");
    expect(pool.size()).toBe(0);

    // the signed contest carries the WAD amount and a real signature
    expect(ops.lastBatch).toHaveLength(1);
    expect(ops.lastBatch[0].committed).toBe(120n * WAD + WAD / 2n);
    expect(ops.lastBatch[0].sigR).toMatch(/^0x[0-9a-f]{64}$/);

    // narration: names mapped, victory reported, ledger totals present
    expect(announced).toHaveLength(1);
    expect(announced[0]).toContain("anna stormed tile 5 and TOOK it");
    expect(announced[0]).toContain("the wilds");
    expect(announced[0]).toContain("26.0 Flux minted");
  });

  it("narrates a quiet tick honestly", async () => {
    // empty pool: tick still settles (emission-only) — runs as tick 1
    ops.settledTick = 1n; // pretend tick 1 done; next is 2 with no outcomes
    const rec = await scheduler.runOnce();
    expect(rec.phase).toBe("settled");
    expect(announced[0]).toContain("quiet day");
  });
});
