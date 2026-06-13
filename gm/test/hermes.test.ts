/**
 * The Hermes harness, tested with a MOCK client (no network). Proves each
 * slot validates the LLM's proposal, clamps it to what the chain accepts,
 * and falls back to its deterministic stand-in on failure — so a jailbroken
 * or flaky Hermes can never decide an outcome or block a tick.
 */

import { describe, expect, it } from "vitest";
import { extractJson, type ChatMessage, type HermesClient } from "../src/hermes.js";
import { HermesFactionAgent, HeuristicFactionAgent } from "../src/faction.js";
import type { FactionContext, WorldView } from "../src/faction.js";
import { HermesParser, RuleBasedParser } from "../src/parser.js";
import { HermesNarrator, TemplateNarrator } from "../src/narrator.js";
import type { TickSummary } from "../src/narrator.js";
import type { Address } from "../src/types.js";

const WILDS = "0x0000000000000000000000000000000000000000" as Address;
const ME = "0x00000000000000000000000000000000000ace01" as Address;

/** a HermesClient whose completion text is scripted per call */
function mockClient(reply: string | (() => string)): HermesClient {
  const next = typeof reply === "function" ? reply : () => reply;
  return {
    async chat(_m: ChatMessage[]) { return next(); },
    async chatJson(_m: ChatMessage[], validate: (raw: unknown) => unknown) {
      return validate(extractJson(next())) as never;
    },
  } as unknown as HermesClient;
}

function world(tiles: Array<[number, Address, number]>): WorldView {
  return {
    regionId: 0n, tick: 1n, alpha: 0.5, delta: 1.3, minCommit: 20,
    tiles: tiles.map(([tileId, owner, garrison]) => ({
      tileId, owner, ownerIsWilds: owner === WILDS, garrison, mod: 1,
    })),
  };
}
function ctx(escrow: number, w: WorldView): FactionContext {
  return {
    faction: { handle: "faction:x", display: "Ashen Horde", address: ME, escrow },
    world: w, memory: { ticks: [], notes: {} },
  };
}

describe("extractJson", () => {
  it("pulls JSON from chatty / fenced output", () => {
    expect(extractJson('sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('here: {"b":2} ok')).toEqual({ b: 2 });
  });
  it("throws when there is no object", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("HermesFactionAgent", () => {
  const fallback = new HeuristicFactionAgent("raider", 0.8);

  it("accepts a valid proposed move", async () => {
    const client = mockClient('{"tileId":1,"committed":150,"reasoning":"strike the soft wild"}');
    const agent = new HermesFactionAgent("Ashen Horde", client, fallback);
    const move = await agent.decide(ctx(250, world([[0, ME, 100], [1, WILDS, 40]])));
    expect(move).toEqual({ tileId: 1, committed: 150, reasoning: "strike the soft wild" });
  });

  it("clamps an over-commit to the war chest", async () => {
    const client = mockClient('{"tileId":1,"committed":99999,"reasoning":"all in"}');
    const move = await new HermesFactionAgent("Ashen Horde", client, fallback)
      .decide(ctx(250, world([[1, WILDS, 40]])));
    expect(move?.committed).toBe(250);
  });

  it("honors an explicit hold by returning null", async () => {
    // null is the one hold convention (same as the heuristic agents); a
    // sentinel move would crash EIP-712 uint64 encoding and fail the tick.
    const client = mockClient('{"hold":true,"reasoning":"the odds are poor; I wait"}');
    const move = await new HermesFactionAgent("Ashen Horde", client, fallback)
      .decide(ctx(250, world([[1, WILDS, 40]])));
    expect(move).toBeNull();
  });

  it("falls back to the heuristic on an illegal move (self-attack)", async () => {
    const client = mockClient('{"tileId":0,"committed":100}'); // tile 0 is ME's
    const move = await new HermesFactionAgent("Ashen Horde", client, fallback)
      .decide(ctx(250, world([[0, ME, 100], [1, WILDS, 40]])));
    expect(move?.tileId).toBe(1); // heuristic picked the legal wild
  });

  it("falls back to the heuristic on garbage output", async () => {
    const client = mockClient("I refuse to answer in JSON");
    const move = await new HermesFactionAgent("Ashen Horde", client, fallback)
      .decide(ctx(250, world([[1, WILDS, 40]])));
    expect(move?.tileId).toBe(1);
  });
});

describe("HermesParser", () => {
  const fallback = new RuleBasedParser();

  it("accepts a valid structured intent", async () => {
    const p = new HermesParser(mockClient('{"kind":"attack","tileId":7,"committed":80}'), fallback);
    expect(await p.parse("send 80 to the seventh isle")).toEqual({
      kind: "attack", tileId: 7, committed: 80,
    });
  });

  it("passes through a Hermes 'unknown'", async () => {
    const p = new HermesParser(mockClient('{"kind":"unknown","reason":"no tile named"}'), fallback);
    expect((await p.parse("hello")).kind).toBe("unknown");
  });

  it("rejects a bad amount and falls back to rules", async () => {
    // Hermes returns nonsense; the rule-based fallback parses the clear text
    const p = new HermesParser(mockClient('{"kind":"attack","tileId":5,"committed":-9}'), fallback);
    expect(await p.parse("attack tile 5 with 120 flux")).toEqual({
      kind: "attack", tileId: 5, committed: 120,
    });
  });
});

describe("HermesNarrator", () => {
  const summary: TickSummary = {
    tick: 9,
    outcomes: [{
      tileId: 5, attacker: "alice", defender: "the wilds",
      attackerWon: true, pPercent: 60, rollPercent: 30, burned: 44.8,
    }],
    minted: 18, burned: 44.8, skipped: [],
  };

  it("wraps the Herald's prose around the exact deterministic ledger", async () => {
    const client = mockClient("Alice's banners rise over isle 5 as the wilds break.");
    const out = await new HermesNarrator(client, new TemplateNarrator()).narrate(summary);
    expect(out).toContain("Alice's banners rise");
    // ground truth always present and exact, regardless of the prose
    expect(out).toContain("18.0 Flux minted, 44.8 burned");
    expect(out).toContain("Tick 9");
  });

  it("falls back to the template when Hermes errors", async () => {
    const broken = { chat: async () => { throw new Error("timeout"); } } as unknown as HermesClient;
    const out = await new HermesNarrator(broken, new TemplateNarrator()).narrate(summary);
    expect(out).toContain("alice stormed tile 5 and TOOK it");
  });
});
