/**
 * Intent pool — orders waiting for the next tick close.
 *
 * One order per (player, tile): a newer order for the same tile replaces
 * the older one (the player changed their mind); orders for different
 * tiles coexist. Draining returns everything and empties the pool —
 * the scheduler signs and submits the drained snapshot.
 */

import type { AttackIntent } from "./types.js";

export interface PooledIntent {
  handle: string;       // custodial wallet handle, e.g. "tg:12345"
  display: string;      // human name for narration/replies
  intent: AttackIntent;
}

export class IntentPool {
  private orders = new Map<string, PooledIntent>();

  add(entry: PooledIntent): void {
    this.orders.set(`${entry.handle}:${entry.intent.tileId}`, entry);
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
    return all;
  }
}
