/**
 * HoldfastAgent — a self-custody client for the public arena.
 *
 *   const agent = new HoldfastAgent({ api, privateKey });
 *   await agent.faucet();                       // self-fund escrow (once)
 *   const { world, escrow } = await agent.world();
 *   await agent.attack(weakestTarget(world, agent.address)!.tileId, 100);
 *
 * The agent holds its own key and signs its own moves; the operator never
 * sees the key and cannot forge. It submits a *move*, never a result — the
 * chain decides who wins (read it back from ContestSettled/TickSettled).
 */

import type { Account, LocalAccount } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  flux as toWad, holdfastDomain, INTENT_TYPES, toFlux,
  type Health, type Hex, type IntentSubmission, type Move, type Tile, type World,
} from "./schema.js";

export interface AgentOptions {
  /** base URL of a Holdfast node's agent API (e.g. https://host:8799) */
  api: string;
  /** a private key to sign with; a throwaway is generated if omitted */
  privateKey?: Hex;
  /** or bring your own signer (must support signTypedData) */
  account?: Account;
  /** inject fetch (Node <18 / tests); defaults to global fetch */
  fetch?: typeof fetch;
}

export interface SubmitResult {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
}

export class HoldfastAgent {
  readonly account: Account;
  private readonly api: string;
  private readonly doFetch: typeof fetch;
  private cachedHealth?: Health;

  constructor(opts: AgentOptions) {
    this.api = opts.api.replace(/\/$/, "");
    this.doFetch = opts.fetch ?? globalThis.fetch;
    this.account =
      opts.account ?? privateKeyToAccount(opts.privateKey ?? generatePrivateKey());
    if (!this.account.signTypedData) {
      throw new Error("account must support signTypedData");
    }
  }

  /** this agent's on-chain identity */
  get address(): Hex {
    return this.account.address;
  }

  /** node info: chainId, settlement, the tick now accepting moves, faucet */
  async health(force = false): Promise<Health> {
    if (!force && this.cachedHealth) return this.cachedHealth;
    this.cachedHealth = (await this.getJson("/health")) as Health;
    return this.cachedHealth;
  }

  /** the world plus this agent's escrow (WAD) */
  async world(): Promise<{ world: World; escrow: bigint }> {
    const r = (await this.getJson(`/world?address=${this.address}`)) as {
      world: World; escrow?: string;
    };
    return { world: r.world, escrow: BigInt(r.escrow ?? "0") };
  }

  /** this agent's committable escrow, in WAD */
  async escrow(): Promise<bigint> {
    return (await this.world()).escrow;
  }

  /** one-time testnet faucet: enroll this address with starting escrow.
   *  Resolves even if already funded (status carries the detail). */
  async faucet(): Promise<SubmitResult> {
    return this.postJson("/faucet", { address: this.address });
  }

  /** sign a move (EIP-712) without submitting — for advanced/custom flows */
  async signMove(move: Move): Promise<IntentSubmission> {
    const h = await this.health();
    const regionId = BigInt(h.regionId);
    const tick = BigInt(h.nextTick);
    const tileId = BigInt(move.tileId);
    const message = { regionId, tick, tileId, committed: move.committed };
    const signature = await this.account.signTypedData!({
      domain: holdfastDomain(h.chainId, h.settlement),
      types: INTENT_TYPES,
      primaryType: "Intent",
      message,
    });
    return {
      regionId: regionId.toString(),
      tick: tick.toString(),
      tileId: tileId.toString(),
      committed: move.committed.toString(),
      attacker: this.address,
      signature,
    };
  }

  /** sign + submit a move for the next tick */
  async submit(move: Move): Promise<SubmitResult> {
    return this.postJson("/intent", await this.signMove(move));
  }

  /** ergonomic attack: contest `tileId` with `fluxAmount` whole Flux, clamped
   *  to [minCommit, escrow] so it can't be rejected for an out-of-range stake */
  async attack(tileId: number | bigint, fluxAmount: number): Promise<SubmitResult> {
    const h = await this.health();
    const escrow = await this.escrow();
    const minCommit = BigInt(h.minCommit);
    let committed = toWad(fluxAmount);
    if (committed < minCommit) committed = minCommit;
    if (committed > escrow) committed = escrow;
    if (committed < minCommit) {
      throw new Error(
        `escrow ${toFlux(escrow)} Flux below minCommit ${toFlux(minCommit)} — faucet/enroll first`);
    }
    return this.submit({ tileId, committed });
  }

  // ---- transport ----
  private async getJson(path: string): Promise<unknown> {
    const r = await this.doFetch(this.api + path);
    if (!r.ok) throw new Error(`GET ${path} -> ${r.status} ${await r.text()}`);
    return r.json();
  }

  private async postJson(path: string, body: unknown): Promise<SubmitResult> {
    const r = await this.doFetch(this.api + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const parsed = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: r.ok, status: r.status, body: parsed };
  }
}

/** convenience: the weakest isle this agent does not already hold (lowest
 *  garrison = cheapest target). Returns null if there's nothing to attack. */
export function weakestTarget(world: World, address: string): Tile | null {
  const mine = address.toLowerCase();
  const targets = world.tiles
    .filter((t) => t.owner.toLowerCase() !== mine)
    .sort((a, b) => a.garrison - b.garrison);
  return targets[0] ?? null;
}

export type { LocalAccount };
