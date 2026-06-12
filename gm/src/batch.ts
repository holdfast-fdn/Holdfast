/**
 * Batch construction: the NORMATIVE order and the commitment hash.
 *
 * Must match HoldfastSettlement exactly:
 *   - ascending tileId; descending committed within a tile (collision rule)
 *   - batchHash = keccak256(abi.encode(ContestInput[]))
 */

import { encodeAbiParameters, keccak256 } from "viem";
import type { SignedContest } from "./types.js";

export const CONTEST_INPUT_ABI = [
  {
    type: "tuple[]",
    components: [
      { name: "tileId", type: "uint64" },
      { name: "attacker", type: "address" },
      { name: "committed", type: "uint256" },
      { name: "attackerMod", type: "uint256" },
      { name: "sigV", type: "uint8" },
      { name: "sigR", type: "bytes32" },
      { name: "sigS", type: "bytes32" },
    ],
  },
] as const;

/** stable normative sort — never mutates the input */
export function sortBatch(contests: SignedContest[]): SignedContest[] {
  return [...contests].sort((a, b) => {
    if (a.tileId !== b.tileId) return a.tileId < b.tileId ? -1 : 1;
    if (a.committed !== b.committed) return a.committed > b.committed ? -1 : 1;
    return 0;
  });
}

export function batchHash(contests: SignedContest[]): `0x${string}` {
  return keccak256(
    encodeAbiParameters(CONTEST_INPUT_ABI, [
      contests.map((c) => ({
        tileId: c.tileId,
        attacker: c.attacker,
        committed: c.committed,
        attackerMod: c.attackerMod,
        sigV: c.sigV,
        sigR: c.sigR,
        sigS: c.sigS,
      })),
    ]),
  );
}
