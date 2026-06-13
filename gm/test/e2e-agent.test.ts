/**
 * Public-arena end-to-end, against a local anvil — the WHOLE new pipeline:
 *
 *   POST /faucet (owner enroll) -> agent reads world -> agent EIP-712-signs
 *   its OWN move -> POST /intent -> scheduler merges it into the tick batch ->
 *   openTick -> word -> settleTick -> tile flips on-chain -> GM compute metered
 *   -> sink BURNS Flux from the treasury (supply drops).
 *
 * Proves the self-custody arena works without the operator ever holding the
 * agent's key, and that the compute sink is realised on-chain. Requires
 * `forge build` artifacts and anvil on ~/.foundry/bin.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  createPublicClient, createWalletClient, encodePacked, http, keccak256,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startAgentApi } from "../src/agentApi.js";
import { AgentIntentPool } from "../src/agentPool.js";
import {
  loadArtifact, makeComputeSink, makeWorldReader, makeTickSummaryReader,
  ViemChainOps,
} from "../src/chain.js";
import { ComputeMeter } from "../src/computeMeter.js";
import { TickDriver } from "../src/driver.js";
import { IntentPool } from "../src/intentPool.js";
import { TemplateNarrator, type Narrator } from "../src/narrator.js";
import { TickScheduler } from "../src/scheduler.js";
import { CustodialSigner, holdfastDomain, INTENT_TYPES, WAD } from "../src/signer.js";
import type { Address } from "../src/types.js";

const PORT = 8548;
const RPC = `http://127.0.0.1:${PORT}`;
const API_PORT = 8811;
const API = `http://127.0.0.1:${API_PORT}`;
const REGION = 0n;
const OWNER_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const OPERATOR_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const PROVIDER_PK = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
const TREASURY_PK = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6";

let anvil: ChildProcess;
let pub: ReturnType<typeof createPublicClient>;
let settlement: Address;
let fluxAddr: Address;
let stAbi: ReturnType<typeof loadArtifact>["abi"];
let fluxAbi: ReturnType<typeof loadArtifact>["abi"];
let stopApi: () => void;
let scheduler: TickScheduler;
let pool: AgentIntentPool;
let meter: ComputeMeter;
let sinkTotal: () => bigint;

// the external agent — its OWN key (self-custody). No ETH: it only signs + POSTs.
const agent = privateKeyToAccount(generatePrivateKey());
const TARGET_TILE = 5n;

function wallet(pk: `0x${string}`) {
  return createWalletClient({ account: privateKeyToAccount(pk), chain: foundry, transport: http(RPC) });
}
async function waitForRpc() {
  for (let i = 0; i < 100; i++) {
    try { await pub.getChainId(); return; } catch { await new Promise((r) => setTimeout(r, 150)); }
  }
  throw new Error("anvil did not come up");
}
async function deploy(a: ReturnType<typeof loadArtifact>, args: unknown[] = []): Promise<Address> {
  const hash = await wallet(OWNER_PK).deployContract({ abi: a.abi, bytecode: a.bytecode, args });
  return (await pub.waitForTransactionReceipt({ hash })).contractAddress as Address;
}
async function ownerWrite(addr: Address, abi: typeof stAbi, fn: string, args: unknown[]) {
  const hash = await wallet(OWNER_PK).writeContract({ address: addr, abi, functionName: fn, args });
  expect((await pub.waitForTransactionReceipt({ hash })).status).toBe("success");
}
function rollOf(word: bigint, tick: bigint, tileId: bigint, attacker: Address): bigint {
  return BigInt(keccak256(encodePacked(
    ["uint256", "uint256", "uint64", "uint64", "address"],
    [word, REGION, tick, tileId, attacker]))) % WAD;
}
async function fluxBalance(a: Address): Promise<bigint> {
  return (await pub.readContract({ address: fluxAddr, abi: fluxAbi, functionName: "balanceOf", args: [a] })) as bigint;
}
async function readTile(tileId: bigint) {
  const t = (await pub.readContract({ address: settlement, abi: stAbi, functionName: "tiles", args: [REGION, tileId] })) as readonly [Address, bigint, bigint];
  return { owner: t[0], garrison: t[1] };
}

beforeAll(async () => {
  anvil = spawn(join(homedir(), ".foundry/bin/anvil"), ["--port", String(PORT), "--silent"], { stdio: "ignore" });
  pub = createPublicClient({ chain: foundry, transport: http(RPC) });
  await waitForRpc();

  const fluxArt = loadArtifact("FluxToken");
  const stArt = loadArtifact("HoldfastSettlement");
  fluxAbi = fluxArt.abi; stAbi = stArt.abi;
  fluxAddr = await deploy(fluxArt);
  settlement = await deploy(stArt, [fluxAddr]);
  await ownerWrite(fluxAddr, fluxAbi, "setMinter", [settlement]);
  await ownerWrite(settlement, stAbi, "setOperator", [privateKeyToAccount(OPERATOR_PK).address]);
  await ownerWrite(settlement, stAbi, "setRandomnessProvider", [privateKeyToAccount(PROVIDER_PK).address]);

  // genesis: 9 wilds isles (cleanly contestable), rev2 params
  const owners: Address[] = Array(9).fill("0x0000000000000000000000000000000000000000" as Address);
  const garrisons = Array(9).fill(60n * WAD);
  const mods = Array(9).fill(WAD);
  await ownerWrite(settlement, stAbi, "createRegion", [REGION, {
    delta: 13n * 10n ** 17n, gamma: 3n * 10n ** 17n, beta: 3n * 10n ** 17n,
    yieldPerTile: 4n * WAD, garrisonRegen: 2n * WAD, garrisonCap: 200n * WAD,
    minCommit: 20n * WAD,
  }, owners, garrisons, mods]);

  // fund the compute treasury: enroll it, then it withdraws escrow -> Flux balance
  const treasury = privateKeyToAccount(TREASURY_PK).address;
  await ownerWrite(settlement, stAbi, "enroll", [[treasury], 50n * WAD]);
  const wHash = await wallet(TREASURY_PK).writeContract({ address: settlement, abi: stAbi, functionName: "withdraw", args: [50n * WAD] });
  await pub.waitForTransactionReceipt({ hash: wHash });

  // the public door (faucet via owner enroll) + the agent pool
  pool = new AgentIntentPool();
  stopApi = startAgentApi({
    port: API_PORT, regionId: REGION, chainId: foundry.id, settlement, abi: stAbi,
    publicClient: pub, pool, readWorld: makeWorldReader(pub, settlement, stAbi),
    faucet: {
      amountWad: 200n * WAD,
      enroll: async (addr, amt) => {
        const h = await wallet(OWNER_PK).writeContract({ address: settlement, abi: stAbi, functionName: "enroll", args: [[addr], amt] });
        await pub.waitForTransactionReceipt({ hash: h });
        return h;
      },
    },
  });

  // scheduler: real chain ops, sink burning from the treasury, word ground so
  // the agent WINS its contest (deterministic assertion). A narrator that
  // "spends" 4000 tokens stands in for Hermes so the meter -> sink has cost.
  const ops = new ViemChainOps(pub, wallet(OPERATOR_PK), wallet(PROVIDER_PK), settlement, stAbi);
  const wordProvider = async (_r: bigint, tick: bigint): Promise<bigint> => {
    for (let w = 0n; ; w++) if (rollOf(w, tick, TARGET_TILE, agent.address as Address) < WAD / 4n) return w;
  };
  meter = new ComputeMeter(0.5); // 0.5 Flux / 1k tokens
  const sink = makeComputeSink(pub, wallet(TREASURY_PK), fluxAddr, fluxAbi);
  sinkTotal = sink.totalBurned;
  const narrator: Narrator = { narrate: (s) => { meter.record(4000); return new TemplateNarrator().narrate(s); } };
  scheduler = new TickScheduler({
    regionId: REGION, chainId: foundry.id, settlement,
    pool: new IntentPool(), agentPool: pool,
    signer: new CustodialSigner(join(mkdtempSync(join(tmpdir(), "hf-keys-")), "k.json")),
    driver: new TickDriver(ops, wordProvider, mkdtempSync(join(tmpdir(), "hf-ticks-")), { maxAttempts: 2, retryDelayMs: 100 }),
    ops, readSummary: makeTickSummaryReader(pub, settlement, stAbi, 0n),
    narrator, announce: async () => {}, meter, sink,
  });
}, 120_000);

afterAll(() => { stopApi?.(); anvil?.kill(); });

describe("public arena, agent move to chain + compute sink", () => {
  it("faucets, accepts a self-signed move, settles it, and burns the sink", async () => {
    // ── faucet: a fresh agent self-funds escrow ──
    const fr = await fetch(`${API}/faucet`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: agent.address }) });
    expect(fr.status).toBe(200);

    // ── read world + next tick from the door ──
    const health = await (await fetch(`${API}/health`)).json();
    const tick = BigInt(health.nextTick);

    // ── the agent signs its OWN move (operator never sees the key) ──
    const committed = 100n * WAD;
    const signature = await agent.signTypedData({
      domain: holdfastDomain(foundry.id, settlement), types: INTENT_TYPES,
      primaryType: "Intent", message: { regionId: REGION, tick, tileId: TARGET_TILE, committed },
    });
    const sr = await fetch(`${API}/intent`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ regionId: "0", tick: tick.toString(), tileId: TARGET_TILE.toString(), committed: committed.toString(), attacker: agent.address, signature }) });
    expect(sr.status).toBe(200);
    expect(pool.size()).toBe(1);

    // ── fire the tick: merge agent intent -> settle on-chain ──
    const treasuryAddr = privateKeyToAccount(TREASURY_PK).address as Address;
    const treasuryBefore = await fluxBalance(treasuryAddr);
    const rec = await scheduler.runOnce();
    expect(rec.phase).toBe("settled");

    // ── the agent now holds the isle, decided by chain math + VRF ──
    const tile = await readTile(TARGET_TILE);
    expect(tile.owner.toLowerCase()).toBe(agent.address.toLowerCase());

    // ── the compute sink was realised on-chain: treasury supply dropped ──
    const treasuryAfter = await fluxBalance(treasuryAddr);
    expect(sinkTotal()).toBe(2n * WAD); // 4000 tok * 0.5/1k = 2 Flux
    expect(treasuryBefore - treasuryAfter).toBe(2n * WAD);
  }, 60_000);
});
