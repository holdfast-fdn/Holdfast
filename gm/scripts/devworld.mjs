/**
 * Dev world: boots a complete Holdfast world on a local anvil so the
 * companion map (and anything else) can be pointed at REAL chain state.
 *
 *   anvil --port 8545         # in another terminal
 *   node scripts/devworld.mjs
 *
 * Deploys FluxToken + HoldfastSettlement, wires roles, creates the demo
 * 9-tile region (BALANCE.md rev2 params), enrolls alice & bob, and
 * settles tick 1 with two signed conquests so events exist. Prints the
 * companion URL at the end.
 */

import { readFileSync } from "node:fs";
import {
  createPublicClient, createWalletClient, encodePacked, http, keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const WAD = 10n ** 18n;
const REGION = 0n;

// anvil's default deterministic accounts
const KEYS = {
  owner: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  operator: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  provider: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  alice: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  bob: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
};

const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
const wallet = (pk) => createWalletClient({
  account: privateKeyToAccount(pk), chain: foundry, transport: http(RPC),
});

function artifact(name) {
  const raw = JSON.parse(readFileSync(
    new URL(`../../contracts/out/${name}.sol/${name}.json`, import.meta.url),
    "utf8"));
  return { abi: raw.abi, bytecode: raw.bytecode.object };
}

async function deploy(art, args = []) {
  const hash = await wallet(KEYS.owner).deployContract({
    abi: art.abi, bytecode: art.bytecode, args });
  const rc = await pub.waitForTransactionReceipt({ hash });
  return rc.contractAddress;
}

async function write(addr, abi, pk, functionName, args) {
  const hash = await wallet(pk).writeContract({
    address: addr, abi, functionName, args });
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") throw new Error(`${functionName} reverted`);
}

const roll = (word, tick, tileId, attacker) =>
  BigInt(keccak256(encodePacked(
    ["uint256", "uint256", "uint64", "uint64", "address"],
    [word, REGION, tick, tileId, attacker]))) % WAD;

async function main() {
  const flux = artifact("FluxToken");
  const st = artifact("HoldfastSettlement");
  const alice = privateKeyToAccount(KEYS.alice);
  const bob = privateKeyToAccount(KEYS.bob);

  const fluxAddr = await deploy(flux);
  const stAddr = await deploy(st, [fluxAddr]);
  await write(fluxAddr, flux.abi, KEYS.owner, "setMinter", [stAddr]);
  await write(stAddr, st.abi, KEYS.owner, "setOperator",
    [privateKeyToAccount(KEYS.operator).address]);
  await write(stAddr, st.abi, KEYS.owner, "setRandomnessProvider",
    [privateKeyToAccount(KEYS.provider).address]);

  const owners = Array(9).fill("0x0000000000000000000000000000000000000000");
  const garrisons = Array(9).fill(60n * WAD);
  const mods = Array(9).fill(WAD);
  owners[0] = alice.address; garrisons[0] = 100n * WAD;
  owners[3] = bob.address; garrisons[3] = 100n * WAD;
  await write(stAddr, st.abi, KEYS.owner, "createRegion", [REGION, {
    delta: 13n * 10n ** 17n, gamma: 3n * 10n ** 17n, beta: 3n * 10n ** 17n,
    yieldPerTile: 4n * WAD, garrisonRegen: 2n * WAD,
    garrisonCap: 200n * WAD, minCommit: 20n * WAD,
  }, owners, garrisons, mods]);
  await write(stAddr, st.abi, KEYS.owner, "enroll",
    [[alice.address, bob.address], 250n * WAD]);

  // tick 1: two signed conquests with a win-forcing word
  const domain = {
    name: "Holdfast", version: "1",
    chainId: await pub.getChainId(), verifyingContract: stAddr,
  };
  const types = { Intent: [
    { name: "regionId", type: "uint256" }, { name: "tick", type: "uint64" },
    { name: "tileId", type: "uint64" }, { name: "committed", type: "uint256" },
  ]};
  const signed = async (account, tileId, committed) => {
    const sig = await account.signTypedData({ domain, types,
      primaryType: "Intent",
      message: { regionId: REGION, tick: 1n, tileId, committed } });
    return {
      tileId, attacker: account.address, committed, attackerMod: WAD,
      sigV: Number.parseInt(sig.slice(130, 132), 16),
      sigR: `0x${sig.slice(2, 66)}`, sigS: `0x${sig.slice(66, 130)}`,
    };
  };
  const contests = [
    await signed(alice, 5n, 120n * WAD),
    await signed(bob, 7n, 100n * WAD),
  ];
  let word = 0n;
  while (roll(word, 1n, 5n, alice.address) >= WAD / 4n
      || roll(word, 1n, 7n, bob.address) >= WAD / 4n) word++;

  const batchAbi = [{ type: "tuple[]", components: [
    { name: "tileId", type: "uint64" }, { name: "attacker", type: "address" },
    { name: "committed", type: "uint256" }, { name: "attackerMod", type: "uint256" },
    { name: "sigV", type: "uint8" }, { name: "sigR", type: "bytes32" },
    { name: "sigS", type: "bytes32" },
  ]}];
  const { encodeAbiParameters } = await import("viem");
  const batchHash = keccak256(encodeAbiParameters(batchAbi, [contests]));

  await write(stAddr, st.abi, KEYS.operator, "openTick", [REGION, 1n, batchHash]);
  await write(stAddr, st.abi, KEYS.provider, "fulfillWord", [REGION, 1n, word]);
  await write(stAddr, st.abi, KEYS.operator, "settleTick",
    [REGION, 1n, `0x${"b2".repeat(32)}`, contests]);

  console.log("FluxToken         :", fluxAddr);
  console.log("HoldfastSettlement:", stAddr);
  console.log("alice             :", alice.address);
  console.log("bob               :", bob.address);
  console.log("\nCompanion (live):");
  console.log(
    `http://localhost:4173/ui/holdfast-isles.html` +
    `?rpc=${encodeURIComponent(RPC)}&settlement=${stAddr}&region=0` +
    `&me=${alice.address}&names=${bob.address}:bob`);
}

main().catch((e) => { console.error(e); process.exit(1); });
