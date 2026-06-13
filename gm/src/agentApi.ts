/**
 * Agent API — the public submission surface (docs/AGENT_PROTOCOL.md).
 *
 * A permissionless HTTP front door for EXTERNAL self-custody agents:
 *
 *   GET  /health   liveness + the tick currently accepting moves
 *   GET  /world    region params + tiles + (optional) your escrow
 *   POST /intent   submit one EIP-712-signed move for the next tick
 *   POST /faucet   (testnet) enroll an address with starting escrow, once
 *
 * The service validates every submission against the SAME schema the contract
 * verifies (signer.ts: INTENT_TYPES + holdfastDomain) and the live chain state
 * (tick, tile range, minCommit, escrow). It then queues the agent's OWN signed
 * contest — it never signs, never decides an outcome. GM proposes, chain
 * disposes; here the agent proposes and the chain still disposes.
 *
 * Built on node:http — no framework, no new dependency.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { recoverTypedDataAddress } from "viem";
import type { Abi, PublicClient } from "viem";
import type { AgentIntentPool } from "./agentPool.js";
import { holdfastDomain, INTENT_TYPES, WAD } from "./signer.js";
import type { Address, SignedContest } from "./types.js";

export interface AgentApiDeps {
  port: number;
  regionId: bigint;
  chainId: number;
  settlement: Address;
  abi: Abi;
  publicClient: Pick<PublicClient, "readContract">;
  pool: AgentIntentPool;
  /** convenience world view for GET /world (faction reader is reused) */
  readWorld: (regionId: bigint) => Promise<unknown>;
  /** optional testnet faucet: enroll an address with starting escrow (owner
   *  tx). Absent (no OWNER_PK) → POST /faucet returns 404. Self-funding only
   *  ever makes sense on testnet — never wire this to mainnet value. */
  faucet?: {
    /** owner-signed enroll(addr, amountWad) -> tx hash, receipt awaited */
    enroll: (addr: Address, amountWad: bigint) => Promise<string>;
    amountWad: bigint;
  };
}

const MAX_BODY = 16 * 1024; // 16 KB — an intent is tiny; reject anything large
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", ...CORS });
  res.end(json);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > MAX_BODY) reject(new Error("body too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/** parse a 65-byte signature into the contract's split (v, r, s) form */
function splitSig(sig: string): { sigV: number; sigR: `0x${string}`; sigS: `0x${string}` } {
  const h = sig.startsWith("0x") ? sig.slice(2) : sig;
  if (h.length !== 130) throw new Error("signature must be 65 bytes");
  let v = Number.parseInt(h.slice(128, 130), 16);
  if (v < 27) v += 27; // normalise 0/1 -> 27/28
  return {
    sigV: v,
    sigR: `0x${h.slice(0, 64)}`,
    sigS: `0x${h.slice(64, 128)}`,
  };
}

interface RegionState {
  tileCount: bigint;
  lastTick: bigint;
  minCommit: bigint; // WAD
}

async function readRegion(d: AgentApiDeps): Promise<RegionState> {
  const r = (await d.publicClient.readContract({
    address: d.settlement, abi: d.abi, functionName: "regions", args: [d.regionId],
  })) as readonly [bigint, bigint, boolean, { minCommit: bigint }];
  return { tileCount: r[0], lastTick: r[1], minCommit: r[3].minCommit };
}

async function readEscrowWad(d: AgentApiDeps, addr: Address): Promise<bigint> {
  return (await d.publicClient.readContract({
    address: d.settlement, abi: d.abi, functionName: "escrow", args: [addr],
  })) as bigint;
}

async function handleIntent(d: AgentApiDeps, raw: string): Promise<[number, unknown]> {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return [400, { error: "invalid JSON" }];
  }

  // ---- shape ----
  const regionId = toBig(body.regionId);
  const tick = toBig(body.tick);
  const tileId = toBig(body.tileId);
  const committed = toBig(body.committed); // WAD
  const attacker = String(body.attacker ?? "").toLowerCase() as Address;
  const signature =
    typeof body.signature === "string"
      ? body.signature
      : body.sigR && body.sigS && body.sigV !== undefined
        ? `0x${strip(body.sigR)}${strip(body.sigS)}${Number(body.sigV).toString(16).padStart(2, "0")}`
        : undefined;

  if (regionId === null || tick === null || tileId === null || committed === null) {
    return [400, { error: "regionId, tick, tileId, committed must be integer strings" }];
  }
  if (!/^0x[0-9a-f]{40}$/.test(attacker)) return [400, { error: "bad attacker address" }];
  if (!signature) return [400, { error: "missing signature (or sigR/sigS/sigV)" }];

  // ---- region / tick / tile ----
  if (regionId !== d.regionId) return [400, { error: `this node serves region ${d.regionId}` }];
  const region = await readRegion(d);
  const nextTick = region.lastTick + 1n;
  if (tick !== nextTick) return [409, { error: `tick is closed; sign for tick ${nextTick}`, nextTick: nextTick.toString() }];
  if (tileId < 0n || tileId >= region.tileCount) return [400, { error: `tileId out of range 0..${region.tileCount - 1n}` }];
  if (committed < region.minCommit) {
    return [400, { error: `committed below minCommit`, minCommit: region.minCommit.toString() }];
  }

  // ---- signature: recover and bind to attacker ----
  let recovered: Address;
  try {
    recovered = (await recoverTypedDataAddress({
      domain: holdfastDomain(d.chainId, d.settlement),
      types: INTENT_TYPES,
      primaryType: "Intent",
      message: { regionId, tick, tileId, committed },
      signature: signature as `0x${string}`,
    })).toLowerCase() as Address;
  } catch {
    return [400, { error: "signature does not verify against the Intent schema" }];
  }
  if (recovered !== attacker) return [401, { error: "signature signer != attacker" }];

  // ---- escrow: must back the stake ----
  const escrow = await readEscrowWad(d, attacker);
  if (escrow < committed) {
    return [402, { error: "insufficient escrow to back this commit", escrow: escrow.toString() }];
  }

  // ---- rate limit ----
  if (!d.pool.allow(attacker)) return [429, { error: "rate limit; slow down" }];

  // ---- queue the agent's OWN signed contest ----
  const split = splitSig(signature);
  const contest: SignedContest = {
    tileId,
    attacker,
    committed,
    attackerMod: WAD, // external agents do not set their own combat modifier
    ...split,
  };
  const queued = d.pool.add({ tick, display: `${attacker.slice(0, 6)}…`, contest });
  if (!queued) return [503, { error: "intent pool full; try next tick" }];

  return [200, { ok: true, queued: true, regionId: regionId.toString(), tick: tick.toString(), tileId: tileId.toString(), attacker }];
}

/** one-time-per-address faucet guard, shared across requests */
interface FaucetGuard {
  done: Set<string>;     // addresses already fauceted this process
  inflight: Set<string>; // addresses with an enroll tx in progress
}

async function handleFaucet(
  d: AgentApiDeps,
  raw: string,
  guard: FaucetGuard,
): Promise<[number, unknown]> {
  if (!d.faucet) return [404, { error: "faucet disabled on this node" }];
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return [400, { error: "invalid JSON" }];
  }
  const addr = String(body.address ?? "").toLowerCase() as Address;
  if (!/^0x[0-9a-f]{40}$/.test(addr)) return [400, { error: "bad address" }];

  if (guard.done.has(addr)) return [409, { error: "address already funded" }];
  if (guard.inflight.has(addr)) return [429, { error: "funding already in progress" }];

  // on-chain truth: only ever fund an address that has never been enrolled,
  // so the faucet can't be drained by re-requesting (free escrow = Sybil).
  const escrow = await readEscrowWad(d, addr);
  if (escrow > 0n) {
    guard.done.add(addr);
    return [409, { error: "address already has escrow", escrow: escrow.toString() }];
  }

  guard.inflight.add(addr);
  try {
    const hash = await d.faucet.enroll(addr, d.faucet.amountWad);
    guard.done.add(addr);
    return [200, {
      ok: true, address: addr, escrow: d.faucet.amountWad.toString(), tx: hash,
    }];
  } catch (err) {
    return [502, { error: `enroll failed: ${(err as Error).message}` }];
  } finally {
    guard.inflight.delete(addr);
  }
}

function toBig(v: unknown): bigint | null {
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isInteger(v)) return BigInt(v);
  if (typeof v === "string" && /^\d+$/.test(v)) return BigInt(v);
  return null;
}
function strip(v: unknown): string {
  const s = String(v);
  return s.startsWith("0x") ? s.slice(2) : s;
}

export function startAgentApi(d: AgentApiDeps): () => void {
  const guard: FaucetGuard = { done: new Set(), inflight: new Set() };
  const server = createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "GET" && url.pathname === "/health") {
        const region = await readRegion(d);
        return send(res, 200, {
          ok: true,
          chainId: d.chainId,
          settlement: d.settlement,
          regionId: d.regionId.toString(),
          nextTick: (region.lastTick + 1n).toString(),
          minCommit: region.minCommit.toString(),
          queued: d.pool.size(),
          faucet: d.faucet ? d.faucet.amountWad.toString() : null,
        });
      }

      if (req.method === "POST" && url.pathname === "/faucet") {
        const raw = await readBody(req);
        const [status, out] = await handleFaucet(d, raw, guard);
        return send(res, status, out);
      }

      if (req.method === "GET" && url.pathname === "/world") {
        const world = await d.readWorld(d.regionId);
        const addr = url.searchParams.get("address");
        const escrow = addr && /^0x[0-9a-fA-F]{40}$/.test(addr)
          ? (await readEscrowWad(d, addr.toLowerCase() as Address)).toString()
          : undefined;
        return send(res, 200, { world: jsonSafe(world), escrow });
      }

      if (req.method === "POST" && url.pathname === "/intent") {
        const raw = await readBody(req);
        const [status, out] = await handleIntent(d, raw);
        return send(res, status, out);
      }

      return send(res, 404, { error: "not found" });
    } catch (err) {
      return send(res, 500, { error: (err as Error).message });
    }
  });
  server.listen(d.port);
  return () => server.close();
}

/** bigints aren't JSON-serialisable — stringify them for the wire */
function jsonSafe(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val)));
}
