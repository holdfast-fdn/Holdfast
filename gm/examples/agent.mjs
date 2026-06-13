/**
 * Holdfast reference agent — the whole protocol in one file.
 *
 *   faucet -> read world -> DECIDE a move -> sign it -> submit -> read result
 *
 * This is what an external player runs. It signs with ITS OWN key (self-
 * custody) and submits a *move*, never a result — the chain decides who wins
 * (docs/AGENT_PROTOCOL.md). Plug your own intelligence into decideMove(): the
 * default is a tiny heuristic; set HERMES_URL/HERMES_KEY to let a Hermes agent
 * choose. Nothing about the brain can change the outcome — only the move.
 *
 * Run (from gm/, which has viem installed):
 *   AGENT_API=http://localhost:8799 node examples/agent.mjs
 *   # optional: AGENT_PK=0x… (else a throwaway key is generated and printed)
 *   # optional: HERMES_URL=… HERMES_KEY=… HERMES_MODEL=… to use an LLM brain
 *
 * Dependencies: viem only.
 */

import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const API = process.env.AGENT_API ?? "http://localhost:8799";
const WAD = 10n ** 18n;
const toWad = (flux) => BigInt(Math.round(flux * 1e6)) * 10n ** 12n; // 6dp -> WAD
const fmt = (wad) => (Number(wad) / 1e18).toFixed(2);

async function getJSON(path) {
  const r = await fetch(API + path);
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}
async function postJSON(path, body) {
  const r = await fetch(API + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

// ── 0. identity (self-custody: the agent holds its own key) ────────────────
const pk = process.env.AGENT_PK ?? generatePrivateKey();
const account = privateKeyToAccount(pk);
if (!process.env.AGENT_PK) {
  console.log(`generated throwaway key — set AGENT_PK to reuse this agent:\n  AGENT_PK=${pk}`);
}
console.log(`agent address: ${account.address}`);

// ── 1. discover the node + schema (zero hardcoding) ────────────────────────
const health = await getJSON("/health");
const { chainId, settlement, regionId } = health;
console.log(`node: region ${regionId}, next tick ${health.nextTick}, ` +
  `minCommit ${fmt(BigInt(health.minCommit))} Flux`);

// ── 2. faucet (testnet) — one-time starting escrow. 409 = already funded ──
if (health.faucet) {
  const f = await postJSON("/faucet", { address: account.address });
  console.log(`faucet: ${f.status} ${JSON.stringify(f.json)}`);
}

// ── 3. read the world + my escrow ──────────────────────────────────────────
const view = await getJSON(`/world?address=${account.address}`);
const world = view.world;
const escrow = BigInt(view.escrow ?? "0");
if (escrow === 0n) {
  console.log("no escrow — enroll/faucet first, then re-run.");
  process.exit(0);
}
console.log(`escrow: ${fmt(escrow)} Flux · ${world.tiles.length} isles`);

// ── 4. DECIDE — your intelligence goes here (chain still disposes) ─────────
async function decideMove() {
  const minCommit = BigInt(health.minCommit);
  const mine = account.address.toLowerCase();
  const targets = world.tiles.filter((t) => (t.owner ?? "").toLowerCase() !== mine);

  // Optional: let a Hermes agent choose. It returns {tileId, committed(Flux)};
  // we still clamp to [minCommit, escrow] — the brain never bypasses the rules.
  if (process.env.HERMES_URL && process.env.HERMES_KEY) {
    try {
      return await hermesDecide(targets, minCommit);
    } catch (e) {
      console.log(`hermes failed (${e.message}); falling back to heuristic`);
    }
  }

  // Heuristic stand-in: take the weakest isle you don't hold; commit enough to
  // likely overcome its garrison, capped by your escrow.
  const weakest = targets.sort((a, b) => a.garrison - b.garrison)[0];
  if (!weakest) return null;
  let committed = toWad(weakest.garrison * 1.3 + Number(fmt(minCommit)));
  if (committed < minCommit) committed = minCommit;
  if (committed > escrow) committed = escrow;
  return { tileId: BigInt(weakest.tileId), committed };
}

async function hermesDecide(targets, minCommit) {
  const prompt =
    `You are a Holdfast faction. Isles you can attack (tileId, owner, garrison):\n` +
    targets.map((t) => `  #${t.tileId} owner=${t.ownerIsWilds ? "wilds" : t.owner.slice(0, 8)} garrison=${t.garrison}`).join("\n") +
    `\nYour escrow: ${fmt(escrow)} Flux. minCommit: ${fmt(minCommit)} Flux.\n` +
    `Pick ONE move. Reply ONLY compact JSON: {"tileId": <n>, "committed": <flux number>}`;
  const r = await fetch(process.env.HERMES_URL + "/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.HERMES_KEY}` },
    body: JSON.stringify({
      model: process.env.HERMES_MODEL ?? "anthropic/claude-opus-latest",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
    }),
  });
  const txt = (await r.json()).choices?.[0]?.message?.content ?? "";
  const m = JSON.parse(txt.match(/\{[^}]*\}/)?.[0] ?? "{}");
  let committed = toWad(Number(m.committed));
  if (committed < minCommit) committed = minCommit;
  if (committed > escrow) committed = escrow;
  console.log(`hermes chose isle ${m.tileId} @ ${fmt(committed)} Flux`);
  return { tileId: BigInt(m.tileId), committed };
}

const move = await decideMove();
if (!move) { console.log("no valid target — holding."); process.exit(0); }
console.log(`move: contest isle ${move.tileId} with ${fmt(move.committed)} Flux`);

// ── 5. SIGN the move (EIP-712, the published schema) ───────────────────────
const tick = BigInt(health.nextTick);
const message = { regionId: BigInt(regionId), tick, tileId: move.tileId, committed: move.committed };
const signature = await account.signTypedData({
  domain: { name: "Holdfast", version: "1", chainId, verifyingContract: settlement },
  types: {
    Intent: [
      { name: "regionId", type: "uint256" },
      { name: "tick", type: "uint64" },
      { name: "tileId", type: "uint64" },
      { name: "committed", type: "uint256" },
    ],
  },
  primaryType: "Intent",
  message,
});

// ── 6. SUBMIT (the agent proposes; the chain disposes at tick close) ───────
const res = await postJSON("/intent", {
  regionId: String(regionId),
  tick: tick.toString(),
  tileId: move.tileId.toString(),
  committed: move.committed.toString(),
  attacker: account.address,
  signature,
});
console.log(`submit: ${res.status} ${JSON.stringify(res.json)}`);
console.log(res.status === 200
  ? "queued. The outcome is decided on-chain at tick close — read it from " +
    "ContestSettled/TickSettled, never from any agent's word."
  : "rejected (see error above).");
