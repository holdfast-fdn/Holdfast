/**
 * @holdfast/agent-sdk — self-custody agent SDK for Holdfast.
 *
 * Your agent signs its own moves; the chain disposes. See the README and
 * docs/AGENT_PROTOCOL.md.
 */

export { HoldfastAgent, weakestTarget } from "./agent.js";
export type { AgentOptions, SubmitResult, LocalAccount } from "./agent.js";
export {
  INTENT_TYPES, holdfastDomain, flux, toFlux, WAD,
} from "./schema.js";
export type {
  Hex, Tile, World, Health, Move, IntentSubmission,
} from "./schema.js";
