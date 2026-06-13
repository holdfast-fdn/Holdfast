/**
 * Agent intent pool — pre-signed orders from EXTERNAL self-custody agents.
 *
 * Unlike IntentPool (which holds unsigned NL orders the service signs with
 * its custodial key at drain), every entry here is ALREADY EIP-712-signed by
 * the agent's own key. The service never holds these keys, so it can censor
 * but never forge — the public-arena custody model (docs/AGENT_PROTOCOL.md).
 *
 * One live intent per (attacker, tile): a newer signed order replaces the
 * older one. Each entry carries the tick it was signed for; the scheduler
 * drops any whose tick no longer matches the tick being settled (the on-chain
 * signature check would reject it anyway — this just keeps the batch clean).
 */

import type { Address, SignedContest } from "./types.js";

export interface PooledContest {
  tick: bigint;            // the tick this intent was signed for
  display: string;         // short label for narration (e.g. "0xabcd…")
  contest: SignedContest;  // the agent's own EIP-712-signed move
}

export interface AgentPoolOptions {
  /** max distinct live intents held across all agents (spam ceiling) */
  maxEntries?: number;
  /** per-address submission budget within rateWindowMs */
  ratePerWindow?: number;
  rateWindowMs?: number;
}

export class AgentIntentPool {
  private orders = new Map<string, PooledContest>();
  private hits = new Map<string, number[]>(); // address -> submit timestamps
  private readonly maxEntries: number;
  private readonly ratePerWindow: number;
  private readonly rateWindowMs: number;

  constructor(opts: AgentPoolOptions = {}) {
    this.maxEntries = opts.maxEntries ?? 1000;
    this.ratePerWindow = opts.ratePerWindow ?? 30;
    this.rateWindowMs = opts.rateWindowMs ?? 60_000;
  }

  /** true if `addr` is within its submission budget (and records the hit) */
  allow(addr: Address): boolean {
    const key = addr.toLowerCase();
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter(
      (t) => now - t < this.rateWindowMs,
    );
    if (recent.length >= this.ratePerWindow) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  /** queue a validated, pre-signed contest. Returns false if the pool is full
   *  (and this attacker has no existing slot to overwrite). */
  add(entry: PooledContest): boolean {
    const key = `${entry.contest.attacker.toLowerCase()}:${entry.contest.tileId}`;
    if (!this.orders.has(key) && this.orders.size >= this.maxEntries) {
      return false;
    }
    this.orders.set(key, entry);
    return true;
  }

  size(): number {
    return this.orders.size;
  }

  /** snapshot + clear — called once per tick close by the scheduler */
  drain(): PooledContest[] {
    const all = [...this.orders.values()];
    this.orders.clear();
    return all;
  }
}
