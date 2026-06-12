/**
 * TickDriver — drives one region's tick through commit -> word -> settle.
 *
 * Hermes cron is unreliable (jobs hang, fire twice, or not at all —
 * CLAUDE.md), so the driver is a RESUMABLE state machine: every phase
 * transition is persisted before moving on, every chain call is retried,
 * and re-running a half-finished tick continues where it stopped instead
 * of double-submitting. Each settled tick also publishes its full input
 * bundle so anyone can recompute the outcomes (trusted-but-verifiable).
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { batchHash, sortBatch } from "./batch.js";
import type { Address, SignedContest } from "./types.js";

export type TickPhase = "pending" | "opened" | "worded" | "settled";

export interface TickRecord {
  regionId: string;
  tick: string;
  phase: TickPhase;
  batchHash: `0x${string}`;
  word?: string;
  bucket2Root: `0x${string}`;
  txHashes: Record<string, string>;
}

/** chain operations the driver needs — injected, so tests and the real
 *  viem-backed implementation share the exact same control flow */
export interface ChainOps {
  openTick(
    regionId: bigint, tick: bigint, hash: `0x${string}`,
  ): Promise<string>;
  fulfillWord(regionId: bigint, tick: bigint, word: bigint): Promise<string>;
  settleTick(
    regionId: bigint, tick: bigint, bucket2Root: `0x${string}`,
    contests: SignedContest[],
  ): Promise<string>;
  lastSettledTick(regionId: bigint): Promise<bigint>;
}

/** randomness source: testnet EOA pushes a word; production: await the
 *  VRF adapter's WordFulfilled event instead of pushing */
export type WordProvider = (
  regionId: bigint, tick: bigint,
) => Promise<bigint>;

export interface RetryOpts {
  maxAttempts?: number;
  retryDelayMs?: number;
}

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  { maxAttempts = 3, retryDelayMs = 2_000 }: RetryOpts,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
      }
    }
  }
  throw new Error(`${label} failed after ${maxAttempts} attempts: ${lastErr}`);
}

export class TickDriver {
  constructor(
    private readonly ops: ChainOps,
    private readonly wordProvider: WordProvider,
    private readonly stateDir: string,
    private readonly retry: RetryOpts = {},
  ) {
    mkdirSync(stateDir, { recursive: true });
  }

  private statePath(regionId: bigint, tick: bigint): string {
    return join(this.stateDir, `tick-${regionId}-${tick}.json`);
  }

  private load(regionId: bigint, tick: bigint): TickRecord | null {
    const p = this.statePath(regionId, tick);
    return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
  }

  private save(rec: TickRecord): void {
    writeFileSync(
      this.statePath(BigInt(rec.regionId), BigInt(rec.tick)),
      JSON.stringify(rec, null, 2),
    );
  }

  /**
   * Run (or RESUME) one tick. Safe to call again after a crash, a hung
   * cron, or a duplicate fire — completed phases are never re-submitted.
   */
  async runTick(
    regionId: bigint,
    tick: bigint,
    contests: SignedContest[],
    bucket2Root: `0x${string}`,
  ): Promise<TickRecord> {
    // completion check first: never trust a single cron fire
    const settled = await this.ops.lastSettledTick(regionId);
    if (settled >= tick) {
      const done = this.load(regionId, tick);
      if (done) return done;
      throw new Error(
        `tick ${tick} already settled on-chain but no local record — ` +
          `recover the bundle from chain events before continuing`,
      );
    }

    const batch = sortBatch(contests);
    const hash = batchHash(batch);

    let rec = this.load(regionId, tick);
    if (rec && rec.batchHash !== hash) {
      throw new Error(
        `tick ${tick} was already opened with a different batch — ` +
          `refusing to silently reopen (grinding guard); ` +
          `delete the state file only if you know what you are doing`,
      );
    }
    rec ??= {
      regionId: regionId.toString(),
      tick: tick.toString(),
      phase: "pending",
      batchHash: hash,
      bucket2Root,
      txHashes: {},
    };

    if (rec.phase === "pending") {
      rec.txHashes.open = await withRetry("openTick", () =>
        this.ops.openTick(regionId, tick, hash), this.retry);
      rec.phase = "opened";
      this.save(rec);
    }

    if (rec.phase === "opened") {
      const word = await withRetry("wordProvider", () =>
        this.wordProvider(regionId, tick), this.retry);
      rec.txHashes.word = await withRetry("fulfillWord", () =>
        this.ops.fulfillWord(regionId, tick, word), this.retry);
      rec.word = word.toString();
      rec.phase = "worded";
      this.save(rec);
    }

    if (rec.phase === "worded") {
      rec.txHashes.settle = await withRetry("settleTick", () =>
        this.ops.settleTick(regionId, tick, bucket2Root, batch), this.retry);
      rec.phase = "settled";
      this.save(rec);
      this.publish(rec, batch);
    }

    return rec;
  }

  /** trusted-but-verifiable: the full input bundle anyone can replay */
  private publish(rec: TickRecord, batch: SignedContest[]): void {
    const bundle = {
      ...rec,
      contests: batch.map((c) => ({
        tileId: c.tileId.toString(),
        attacker: c.attacker,
        committed: c.committed.toString(),
        attackerMod: c.attackerMod.toString(),
        sigV: c.sigV,
        sigR: c.sigR,
        sigS: c.sigS,
      })),
    };
    writeFileSync(
      join(this.stateDir, `bundle-${rec.regionId}-${rec.tick}.json`),
      JSON.stringify(bundle, null, 2),
    );
  }
}
