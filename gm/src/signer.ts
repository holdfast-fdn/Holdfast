/**
 * Custodial session signer (TESTNET ONLY).
 *
 * Telegram players have no wallet in hand mid-chat, so the closed playtest
 * uses custodial session keys: one generated wallet per player handle, held
 * by the service. Every intent is still EIP-712-signed with that key, so
 * the on-chain guarantee survives intact: the operator can censor, never
 * forge — and the custody boundary is explicit, auditable, and swappable
 * for self-custody (wallet-connect / passkeys) without touching contracts.
 *
 * Keys live in a JSON file OUTSIDE the repo by default; never commit it
 * (CLAUDE.md: no secrets in the repo or any Hermes-loaded environment).
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Address, SignedContest } from "./types.js";

export const WAD = 10n ** 18n;

export interface IntentToSign {
  regionId: bigint;
  tick: bigint;
  tileId: bigint;
  committed: bigint; // WAD
}

export const INTENT_TYPES = {
  Intent: [
    { name: "regionId", type: "uint256" },
    { name: "tick", type: "uint64" },
    { name: "tileId", type: "uint64" },
    { name: "committed", type: "uint256" },
  ],
} as const;

export function holdfastDomain(chainId: number, settlement: Address) {
  return {
    name: "Holdfast",
    version: "1",
    chainId,
    verifyingContract: settlement,
  } as const;
}

export class CustodialSigner {
  private keys: Record<string, `0x${string}`> = {};

  constructor(private readonly keystorePath: string) {
    if (existsSync(keystorePath)) {
      this.keys = JSON.parse(readFileSync(keystorePath, "utf8"));
    }
  }

  /** create-or-load the session wallet for a player handle */
  wallet(handle: string): { address: Address } {
    if (!this.keys[handle]) {
      this.keys[handle] = generatePrivateKey();
      mkdirSync(dirname(this.keystorePath), { recursive: true });
      writeFileSync(
        this.keystorePath,
        JSON.stringify(this.keys, null, 2),
        { mode: 0o600 },
      );
    }
    return { address: privateKeyToAccount(this.keys[handle]).address };
  }

  /** EIP-712-sign an intent with the player's session key */
  async signContest(
    handle: string,
    chainId: number,
    settlement: Address,
    intent: IntentToSign,
    attackerMod: bigint = WAD,
  ): Promise<SignedContest> {
    this.wallet(handle); // ensure key exists
    const account = privateKeyToAccount(this.keys[handle]);
    const signature = await account.signTypedData({
      domain: holdfastDomain(chainId, settlement),
      types: INTENT_TYPES,
      primaryType: "Intent",
      message: {
        regionId: intent.regionId,
        tick: intent.tick,
        tileId: intent.tileId,
        committed: intent.committed,
      },
    });
    const r = `0x${signature.slice(2, 66)}` as `0x${string}`;
    const s = `0x${signature.slice(66, 130)}` as `0x${string}`;
    const v = Number.parseInt(signature.slice(130, 132), 16);
    return {
      tileId: intent.tileId,
      attacker: account.address,
      committed: intent.committed,
      attackerMod,
      sigV: v,
      sigR: r,
      sigS: s,
    };
  }
}
