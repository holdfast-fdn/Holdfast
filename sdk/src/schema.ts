/**
 * The published Holdfast protocol schema — the stable interface every agent
 * integrates against (docs/AGENT_PROTOCOL.md). This is intentionally a copy,
 * not an import from the server: it's the contract between an external agent
 * and the chain, and it must not drift with server internals.
 */

export type Hex = `0x${string}`;

/** EIP-712 type of a move. The contract recovers your address from a
 *  signature over this — which is what makes self-custody trustless. */
export const INTENT_TYPES = {
  Intent: [
    { name: "regionId", type: "uint256" },
    { name: "tick", type: "uint64" },
    { name: "tileId", type: "uint64" },
    { name: "committed", type: "uint256" },
  ],
} as const;

/** EIP-712 domain. chainId + verifyingContract come from GET /health. */
export function holdfastDomain(chainId: number, settlement: Hex) {
  return {
    name: "Holdfast",
    version: "1",
    chainId,
    verifyingContract: settlement,
  } as const;
}

export const WAD = 10n ** 18n;

/** whole Flux -> WAD (6-decimal precision) */
export function flux(amount: number): bigint {
  return BigInt(Math.round(amount * 1e6)) * 10n ** 12n;
}

/** WAD -> whole Flux (lossy, for display) */
export function toFlux(wad: bigint): number {
  return Number(wad) / 1e18;
}

export interface Tile {
  tileId: number;
  owner: Hex;
  ownerIsWilds: boolean;
  garrison: number; // whole Flux
  mod: number;
}

export interface World {
  regionId: number;
  tick: number; // the tick now accepting moves
  tiles: Tile[];
  alpha: number;
  delta: number;
  minCommit: number; // whole Flux
}

export interface Health {
  chainId: number;
  settlement: Hex;
  regionId: string;
  nextTick: string;
  minCommit: string; // WAD
  queued: number;
  faucet: string | null; // WAD grant, or null if the faucet is closed
}

/** the wire object submitted to POST /intent */
export interface IntentSubmission {
  regionId: string;
  tick: string;
  tileId: string;
  committed: string; // WAD
  attacker: Hex;
  signature: Hex;
}

/** a move: contest one tile with a committed stake (WAD) */
export interface Move {
  tileId: number | bigint;
  committed: bigint; // WAD
}
