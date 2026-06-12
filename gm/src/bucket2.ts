/**
 * Bucket-2 commitment (v1).
 *
 * The guardian rule (MEMORY.md): the moment GM memory influences an
 * outcome-determining number, that number must be committed — never free
 * GM memory. This module is the commitment: every modifier that will enter
 * the resolver is serialized canonically and hashed into the root that
 * settleTick stores on-chain. Anyone holding the published state can
 * recompute the root and replay the tick.
 */

import { keccak256, stringToBytes, concat } from "viem";
import type { Address } from "./types.js";

export interface Bucket2State {
  regionId: string;
  tick: string;
  /** per-attacker modifiers for this tick (WAD, as decimal strings) */
  attackerMods: Record<Address, string>;
  /** per-tile terrain modifiers (WAD, as decimal strings) */
  tileMods: Record<string, string>;
}

const DOMAIN_TAG = "holdfast-bucket2-v1";

/** canonical JSON: object keys sorted recursively, no whitespace */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function bucket2Root(state: Bucket2State): `0x${string}` {
  return keccak256(
    concat([stringToBytes(DOMAIN_TAG), stringToBytes(canonicalJson(state))]),
  );
}
