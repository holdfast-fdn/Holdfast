/**
 * viem-backed chain access: Foundry artifact loading + the ChainOps the
 * TickDriver consumes. Operator and randomness provider are separate
 * accounts by design (see contracts: commit -> word -> settle).
 */

import { readFileSync } from "node:fs";
import type {
  Abi,
  PublicClient,
  WalletClient,
  Account,
  Chain,
  Transport,
} from "viem";
import type { ChainOps } from "./driver.js";
import type { Address, SignedContest } from "./types.js";

export interface Artifact {
  abi: Abi;
  bytecode: `0x${string}`;
}

/** load a forge build artifact (run `forge build` in contracts/ first) */
export function loadArtifact(
  name: string,
  outDir = new URL("../../contracts/out/", import.meta.url),
): Artifact {
  const raw = JSON.parse(
    readFileSync(new URL(`${name}.sol/${name}.json`, outDir), "utf8"),
  );
  return { abi: raw.abi as Abi, bytecode: raw.bytecode.object };
}

type Wallet = WalletClient<Transport, Chain, Account>;

/** structural subset — dodges viem's deep client generics */
type ReadClient = Pick<PublicClient, "waitForTransactionReceipt" | "readContract">;

export class ViemChainOps implements ChainOps {
  constructor(
    private readonly publicClient: ReadClient,
    private readonly operator: Wallet,
    private readonly provider: Wallet,
    private readonly settlement: Address,
    private readonly abi: Abi,
  ) {}

  private async write(
    wallet: Wallet,
    functionName: string,
    args: unknown[],
  ): Promise<string> {
    const hash = await wallet.writeContract({
      address: this.settlement,
      abi: this.abi,
      functionName,
      args,
      chain: wallet.chain,
      account: wallet.account,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`${functionName} reverted (tx ${hash})`);
    }
    return hash;
  }

  openTick(regionId: bigint, tick: bigint, hash: `0x${string}`) {
    return this.write(this.operator, "openTick", [regionId, tick, hash]);
  }

  fulfillWord(regionId: bigint, tick: bigint, word: bigint) {
    return this.write(this.provider, "fulfillWord", [regionId, tick, word]);
  }

  settleTick(
    regionId: bigint,
    tick: bigint,
    bucket2Root: `0x${string}`,
    contests: SignedContest[],
  ) {
    return this.write(this.operator, "settleTick", [
      regionId,
      tick,
      bucket2Root,
      contests.map((c) => ({
        tileId: c.tileId,
        attacker: c.attacker,
        committed: c.committed,
        attackerMod: c.attackerMod,
        sigV: c.sigV,
        sigR: c.sigR,
        sigS: c.sigS,
      })),
    ]);
  }

  async lastSettledTick(regionId: bigint): Promise<bigint> {
    const region = (await this.publicClient.readContract({
      address: this.settlement,
      abi: this.abi,
      functionName: "regions",
      args: [regionId],
    })) as readonly unknown[];
    // regions(id) -> (tileCount, lastTick, exists, params)
    return region[1] as bigint;
  }
}
