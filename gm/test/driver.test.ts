/**
 * TickDriver resilience: resume after crashes, never double-submit,
 * refuse silent batch swaps. ChainOps is mocked — the e2e test covers the
 * real chain path.
 */

import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { TickDriver, type ChainOps } from "../src/driver.js";
import type { SignedContest } from "../src/types.js";

const WAD = 10n ** 18n;

function contest(tileId: bigint, committed: bigint): SignedContest {
  return {
    tileId,
    attacker: "0x00000000000000000000000000000000000a11ce",
    committed,
    attackerMod: WAD,
    sigV: 27,
    sigR: `0x${"11".repeat(32)}`,
    sigS: `0x${"22".repeat(32)}`,
  };
}

class MockOps implements ChainOps {
  calls: string[] = [];
  settledTick = 0n;
  failNext: string | null = null;

  private async step(label: string): Promise<string> {
    if (this.failNext === label) {
      this.failNext = null;
      throw new Error(`${label} simulated failure`);
    }
    this.calls.push(label);
    return `0xtx_${label}_${this.calls.length}`;
  }

  openTick() { return this.step("open"); }
  fulfillWord() { return this.step("word"); }
  async settleTick(): Promise<string> {
    const tx = await this.step("settle");
    this.settledTick += 1n;
    return tx;
  }
  async lastSettledTick() { return this.settledTick; }
}

describe("TickDriver", () => {
  let dir: string;
  let ops: MockOps;
  let driver: TickDriver;
  const word = async () => 7n;
  const root = `0x${"b2".repeat(32)}` as const;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "holdfast-driver-"));
    ops = new MockOps();
    driver = new TickDriver(ops, word, dir, { maxAttempts: 2, retryDelayMs: 1 });
  });

  it("runs a full tick and publishes the bundle", async () => {
    const rec = await driver.runTick(0n, 1n, [contest(5n, 120n * WAD)], root);
    expect(rec.phase).toBe("settled");
    expect(ops.calls).toEqual(["open", "word", "settle"]);

    const bundle = JSON.parse(
      readFileSync(join(dir, "bundle-0-1.json"), "utf8"));
    expect(bundle.contests).toHaveLength(1);
    expect(bundle.word).toBe("7");
  });

  it("retries a flaky step instead of dying", async () => {
    ops.failNext = "word";
    const rec = await driver.runTick(0n, 1n, [], root);
    expect(rec.phase).toBe("settled");
  });

  it("resumes after a crash without re-submitting finished phases", async () => {
    // first run dies at settle (both attempts fail)
    ops.failNext = "settle";
    const dying = new TickDriver(ops, word, dir, {
      maxAttempts: 1, retryDelayMs: 1,
    });
    await expect(dying.runTick(0n, 1n, [], root)).rejects.toThrow("settle");
    expect(ops.calls).toEqual(["open", "word"]);

    // the duplicate cron fire: open/word must NOT run again
    const rec = await driver.runTick(0n, 1n, [], root);
    expect(rec.phase).toBe("settled");
    expect(ops.calls).toEqual(["open", "word", "settle"]);
  });

  it("is idempotent once the chain says the tick settled", async () => {
    await driver.runTick(0n, 1n, [], root);
    const again = await driver.runTick(0n, 1n, [], root);
    expect(again.phase).toBe("settled");
    expect(ops.calls.filter((c) => c === "settle")).toHaveLength(1);
  });

  it("refuses to silently reopen with a different batch (grinding guard)", async () => {
    ops.failNext = "settle";
    const dying = new TickDriver(ops, word, dir, {
      maxAttempts: 1, retryDelayMs: 1,
    });
    await expect(
      dying.runTick(0n, 1n, [contest(5n, 100n * WAD)], root),
    ).rejects.toThrow();

    await expect(
      driver.runTick(0n, 1n, [contest(5n, 999n * WAD)], root),
    ).rejects.toThrow(/different batch/);
  });

  it("sorts the batch into the normative order before hashing", async () => {
    const rec = await driver.runTick(
      0n, 1n,
      [contest(7n, 10n), contest(5n, 20n), contest(5n, 90n)],
      root,
    );
    const bundle = JSON.parse(
      readFileSync(join(dir, "bundle-0-1.json"), "utf8"));
    const order = bundle.contests.map(
      (c: { tileId: string; committed: string }) =>
        `${c.tileId}:${c.committed}`);
    expect(order).toEqual(["5:90", "5:20", "7:10"]);
    expect(existsSync(join(dir, "tick-0-1.json"))).toBe(true);
    expect(rec.phase).toBe("settled");
  });
});
