/**
 * Intent pool — orders waiting for the next tick close.
 *
 * One order per (player, tile): a newer order for the same tile replaces
 * the older one (the player changed their mind); orders for different
 * tiles coexist. Draining returns everything and empties the pool —
 * the scheduler signs and submits the drained snapshot.
 */

import { readFileSync, writeFileSync } from "node:fs";
import type { AttackIntent } from "./types.js";

export interface PooledIntent {
  handle: string;       // custodial wallet handle, e.g. "tg:12345"
  display: string;      // human name for narration/replies
  intent: AttackIntent;
}

export class IntentPool {
  private orders = new Map<string, PooledIntent>();

  /** @param persistPath optional file mirroring the pool, so a restart never
   *  drops queued orders. Orders carry no tick — they're signed for whatever
   *  tick is next at drain — so reloading them stays correct. */
  constructor(private readonly persistPath?: string) {
    if (persistPath) {
      try {
        const raw = JSON.parse(readFileSync(persistPath, "utf8")) as PooledIntent[];
        for (const e of raw) this.orders.set(`${e.handle}:${e.intent.tileId}`, e);
      } catch {
        /* no/corrupt snapshot — start empty */
      }
    }
  }

  private save(): void {
    if (!this.persistPath) return;
    try {
      writeFileSync(this.persistPath, JSON.stringify([...this.orders.values()]));
    } catch {
      /* best-effort; never block an order on disk */
    }
  }

  add(entry: PooledIntent): void {
    this.orders.set(`${entry.handle}:${entry.intent.tileId}`, entry);
    this.save();
  }

  /** the player's currently queued orders */
  list(handle: string): PooledIntent[] {
    return [...this.orders.values()].filter((o) => o.handle === handle);
  }

  size(): number {
    return this.orders.size;
  }

  /** snapshot + clear — called exactly once per tick close */
  drain(): PooledIntent[] {
    const all = [...this.orders.values()];
    this.orders.clear();
    this.save();
    return all;
  }
}
