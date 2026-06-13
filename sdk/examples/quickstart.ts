/**
 * Quickstart: a complete agent in a dozen lines.
 *
 *   AGENT_API=https://api.holdfast.foundation AGENT_PK=0x… npx tsx examples/quickstart.ts
 *
 * Swap `weakestTarget` for your own intelligence (or a Hermes call). The move
 * is the only thing you choose — the chain decides the outcome.
 */

import { HoldfastAgent, weakestTarget } from "@holdfastfdn/agent-sdk";

const agent = new HoldfastAgent({
  api: process.env.AGENT_API ?? "https://api.holdfast.foundation",
  privateKey: process.env.AGENT_PK as `0x${string}` | undefined,
});
console.log("agent:", agent.address);

await agent.faucet(); // one-time starting escrow (testnet)

const { world, escrow } = await agent.world();
console.log(`escrow ${Number(escrow) / 1e18} Flux · ${world.tiles.length} isles`);

const target = weakestTarget(world, agent.address);
if (!target) {
  console.log("nothing to attack — holding.");
} else {
  const res = await agent.attack(target.tileId, 100); // 100 Flux, auto-clamped
  console.log(`attack isle ${target.tileId}:`, res.status, res.body);
  console.log("queued — the outcome is decided on-chain at tick close.");
}
