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
import type { RawTickSummary, TickSummaryReader } from "./scheduler.js";
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

/** read a settled tick's outcomes back from chain events — what the
 *  narrator is allowed to know */
/** Base's public RPC caps eth_getLogs to a 2000-block range. A just-settled
 *  tick's events are always in the most recent blocks, so we only ever scan
 *  that trailing window — history/scale is the indexer's job, not the
 *  narrator's. */
const LOG_WINDOW = 1999n;

export function makeTickSummaryReader(
  publicClient: Pick<PublicClient, "getContractEvents" | "getBlockNumber">,
  settlement: Address,
  abi: Abi,
  /** floor: never read before the deployment block (0 is fine locally) */
  fromBlock: bigint = 0n,
): TickSummaryReader {
  return async (regionId, tick): Promise<RawTickSummary> => {
    const read = async (eventName: string) => {
      const latest = await publicClient.getBlockNumber();
      const windowStart = latest > LOG_WINDOW ? latest - LOG_WINDOW : 0n;
      const from = windowStart > fromBlock ? windowStart : fromBlock;
      return publicClient.getContractEvents({
        address: settlement,
        abi,
        eventName,
        args: { regionId, tick },
        fromBlock: from,
        toBlock: latest,
      } as Parameters<PublicClient["getContractEvents"]>[0]);
    };

    // settleTick ALWAYS emits exactly one TickSettled, so its absence means
    // the read hit a node still behind the settle block (load-balanced public
    // RPCs lag read-after-write). Poll until it appears before narrating.
    let settled: unknown[] = [];
    let skipped: unknown[] = [];
    let ticks: unknown[] = [];
    for (let attempt = 0; attempt < 10; attempt++) {
      [settled, skipped, ticks] = await Promise.all([
        read("ContestSettled"),
        read("ContestSkipped"),
        read("TickSettled"),
      ]);
      if (ticks.length > 0) break;
      await new Promise((r) => setTimeout(r, 1500));
    }

    type Args = Record<string, unknown>;
    const outcomes = settled.map((log) => {
      const a = (log as { args: Args }).args;
      return {
        tileId: a.tileId as bigint,
        attacker: a.attacker as Address,
        defender: a.defender as Address,
        attackerWon: a.attackerWon as boolean,
        pWad: a.pWad as bigint,
        roll: a.roll as bigint,
        burned: a.burned as bigint,
      };
    });
    const skips = skipped.map((log) => {
      const a = (log as { args: Args }).args;
      return {
        attacker: a.attacker as Address,
        tileId: a.tileId as bigint,
        reason: Number(a.reason),
      };
    });
    const t = (ticks[0] as { args: Args } | undefined)?.args;
    return {
      outcomes,
      skipped: skips,
      minted: (t?.minted as bigint) ?? 0n,
      burned: (t?.burned as bigint) ?? 0n,
    };
  };
}
