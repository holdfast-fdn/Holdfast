/**
 * Phase-3 exit-criterion scaffold, run end-to-end against a local anvil:
 *
 *   player NL -> structured intent -> custodial EIP-712 signature ->
 *   openTick (batch committed) -> word -> settleTick -> chain state
 *
 * The "GM" here is the rule-based parser; swapping in Hermes changes the
 * translation only — this test proves the GM layer has no way to alter
 * outcomes, because everything after parse is signatures and math.
 *
 * Requires `forge build` artifacts and `anvil` on ~/.foundry/bin.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  encodePacked,
  http,
  keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadArtifact, ViemChainOps } from "../src/chain.js";
import { TickDriver } from "../src/driver.js";
import { RuleBasedParser } from "../src/parser.js";
import { CustodialSigner, WAD } from "../src/signer.js";
import type { Address, SignedContest } from "../src/types.js";

const PORT = 8547;
const RPC = `http://127.0.0.1:${PORT}`;
// anvil's default deterministic accounts
const OWNER_PK =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const OPERATOR_PK =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const PROVIDER_PK =
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

const REGION = 0n;

let anvil: ChildProcess;
let publicClient: ReturnType<typeof createPublicClient>;
let settlement: Address;
let fluxAddr: Address;
let settlementAbi: ReturnType<typeof loadArtifact>["abi"];
let fluxAbi: ReturnType<typeof loadArtifact>["abi"];
let signer: CustodialSigner;
let driver: TickDriver;
let alice: Address;
let bob: Address;

function wallet(pk: `0x${string}`) {
  return createWalletClient({
    account: privateKeyToAccount(pk),
    chain: foundry,
    transport: http(RPC),
  });
}

async function waitForRpc(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      await publicClient.getChainId();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw new Error("anvil did not come up");
}

async function deploy(
  artifact: ReturnType<typeof loadArtifact>,
  args: unknown[] = [],
): Promise<Address> {
  const owner = wallet(OWNER_PK);
  const hash = await owner.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return receipt.contractAddress as Address;
}

async function ownerWrite(
  address: Address,
  abi: ReturnType<typeof loadArtifact>["abi"],
  functionName: string,
  args: unknown[],
): Promise<void> {
  const owner = wallet(OWNER_PK);
  const hash = await owner.writeContract({
    address, abi, functionName, args,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
}

/** same per-contest roll the contract derives; used to pick a word whose
 *  rolls let us assert deterministic outcomes */
function rollOf(
  word: bigint, tick: bigint, tileId: bigint, attacker: Address,
): bigint {
  return (
    BigInt(
      keccak256(
        encodePacked(
          ["uint256", "uint256", "uint64", "uint64", "address"],
          [word, REGION, tick, tileId, attacker],
        ),
      ),
    ) % WAD
  );
}

beforeAll(async () => {
  anvil = spawn(
    join(homedir(), ".foundry/bin/anvil"),
    ["--port", String(PORT), "--silent"],
    { stdio: "ignore" },
  );
  publicClient = createPublicClient({
    chain: foundry,
    transport: http(RPC),
  });
  await waitForRpc();

  const fluxArtifact = loadArtifact("FluxToken");
  const stArtifact = loadArtifact("HoldfastSettlement");
  fluxAbi = fluxArtifact.abi;
  settlementAbi = stArtifact.abi;

  fluxAddr = await deploy(fluxArtifact);
  settlement = await deploy(stArtifact, [fluxAddr]);
  await ownerWrite(fluxAddr, fluxAbi, "setMinter", [settlement]);
  await ownerWrite(settlement, settlementAbi, "setOperator", [
    privateKeyToAccount(OPERATOR_PK).address,
  ]);
  await ownerWrite(settlement, settlementAbi, "setRandomnessProvider", [
    privateKeyToAccount(PROVIDER_PK).address,
  ]);

  // custodial session wallets for the Telegram players
  const dir = mkdtempSync(join(tmpdir(), "holdfast-gm-"));
  signer = new CustodialSigner(join(dir, "keys.json"));
  alice = signer.wallet("alice").address;
  bob = signer.wallet("bob").address;

  // genesis: demo layout, BALANCE.md rev2 params
  const owners: Address[] = Array(9).fill(
    "0x0000000000000000000000000000000000000000" as Address);
  const garrisons = Array(9).fill(60n * WAD);
  const mods = Array(9).fill(WAD);
  owners[0] = alice;
  garrisons[0] = 100n * WAD;
  owners[3] = bob;
  garrisons[3] = 100n * WAD;
  await ownerWrite(settlement, settlementAbi, "createRegion", [
    REGION,
    {
      delta: 13n * 10n ** 17n,
      gamma: 3n * 10n ** 17n,
      beta: 3n * 10n ** 17n,
      yieldPerTile: 4n * WAD,
      garrisonRegen: 2n * WAD,
      garrisonCap: 200n * WAD,
      minCommit: 20n * WAD,
    },
    owners,
    garrisons,
    mods,
  ]);
  await ownerWrite(settlement, settlementAbi, "enroll", [
    [alice, bob], 250n * WAD,
  ]);

  const ops = new ViemChainOps(
    publicClient,
    wallet(OPERATOR_PK),
    wallet(PROVIDER_PK),
    settlement,
    settlementAbi,
  );
  // word provider: grind a word whose rolls make both tick-1 attacks WIN
  // (p ≈ 0.49–0.52 here, so roll < 0.25*WAD is decisive) — deterministic
  // assertions; production providers return verified randomness instead
  const wordProvider = async (_r: bigint, tick: bigint): Promise<bigint> => {
    for (let w = 0n; ; w++) {
      if (
        rollOf(w, tick, 5n, alice) < WAD / 4n &&
        rollOf(w, tick, 7n, bob) < WAD / 4n
      ) {
        return w;
      }
    }
  };
  driver = new TickDriver(ops, wordProvider, mkdtempSync(
    join(tmpdir(), "holdfast-ticks-")), { maxAttempts: 2, retryDelayMs: 100 });
}, 120_000);

afterAll(() => {
  anvil?.kill();
});

async function readTile(tileId: bigint) {
  const t = (await publicClient.readContract({
    address: settlement,
    abi: settlementAbi,
    functionName: "tiles",
    args: [REGION, tileId],
  })) as readonly [Address, bigint, bigint];
  return { owner: t[0], garrison: t[1] };
}

async function readEscrow(player: Address): Promise<bigint> {
  return (await publicClient.readContract({
    address: settlement,
    abi: settlementAbi,
    functionName: "escrow",
    args: [player],
  })) as bigint;
}

describe("full tick, NL to chain", () => {
  it("turns chat commands into settled, signed conquest", async () => {
    const parser = new RuleBasedParser();
    const chainId = await publicClient.getChainId();

    // 1. the players speak
    const aliceCmd = await parser.parse("Attack tile 5 with 120 flux!");
    const bobCmd = await parser.parse("raid tile_07, commit 100");
    expect(aliceCmd.kind).toBe("attack");
    expect(bobCmd.kind).toBe("attack");
    if (aliceCmd.kind !== "attack" || bobCmd.kind !== "attack") return;

    // 2. custodial EIP-712 signatures over the funds-at-risk facts
    const contests: SignedContest[] = [
      await signer.signContest("alice", chainId, settlement, {
        regionId: REGION,
        tick: 1n,
        tileId: BigInt(aliceCmd.tileId),
        committed: BigInt(aliceCmd.committed) * WAD,
      }),
      await signer.signContest("bob", chainId, settlement, {
        regionId: REGION,
        tick: 1n,
        tileId: BigInt(bobCmd.tileId),
        committed: BigInt(bobCmd.committed) * WAD,
      }),
    ];

    // 3. commit -> word -> settle
    const rec = await driver.runTick(
      REGION, 1n, contests, `0x${"b2".repeat(32)}`);
    expect(rec.phase).toBe("settled");

    // 4. the chain decided: both rolls were forced wins
    const tile5 = await readTile(5n);
    expect(tile5.owner).toBe(alice);
    expect(tile5.garrison).toBe(120n * WAD);
    const tile7 = await readTile(7n);
    expect(tile7.owner).toBe(bob);
    expect(tile7.garrison).toBe(100n * WAD);

    // escrow: start + yield(home tile) - commit + spoils(0.3 * 62)
    const spoils = (3n * (62n * WAD)) / 10n;
    expect(await readEscrow(alice)).toBe(
      250n * WAD + 4n * WAD - 120n * WAD + spoils);
    expect(await readEscrow(bob)).toBe(
      250n * WAD + 4n * WAD - 100n * WAD + spoils);

    // 5. duplicate cron fire: nothing double-settles
    const again = await driver.runTick(
      REGION, 1n, contests, `0x${"b2".repeat(32)}`);
    expect(again.phase).toBe("settled");
    expect(await readEscrow(alice)).toBe(
      250n * WAD + 4n * WAD - 120n * WAD + spoils);
  }, 60_000);
});
