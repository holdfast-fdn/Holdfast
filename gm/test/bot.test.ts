/**
 * The Telegram surface, tested with a fake transport — no token, no
 * network. The bot translates and queues; it must never do more.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { HoldfastBot, type IncomingMessage } from "../src/bot.js";
import { IntentPool } from "../src/intentPool.js";
import { RuleBasedParser } from "../src/parser.js";

class FakeTransport {
  sent: Array<{ chatId: number | string; text: string }> = [];
  async send(chatId: number | string, text: string): Promise<void> {
    this.sent.push({ chatId, text });
  }
  last(): string {
    return this.sent[this.sent.length - 1]?.text ?? "";
  }
}

function msg(text: string, userId = 42, username = "anna"): IncomingMessage {
  return { chatId: 1000, userId, username, text };
}

describe("HoldfastBot", () => {
  let transport: FakeTransport;
  let pool: IntentPool;
  let bot: HoldfastBot;

  beforeEach(() => {
    transport = new FakeTransport();
    pool = new IntentPool();
    bot = new HoldfastBot(transport, new RuleBasedParser(), pool);
  });

  it("welcomes and explains on /start", async () => {
    await bot.onMessage(msg("/start"));
    expect(transport.last()).toContain("attack tile 5 with 120 flux");
  });

  it("queues a parsed order and confirms", async () => {
    await bot.onMessage(msg("attack tile 5 with 120 flux"));
    expect(pool.size()).toBe(1);
    expect(pool.list("tg:42")[0].intent).toEqual({
      kind: "attack", tileId: 5, committed: 120,
    });
    expect(transport.last()).toContain("the chain will decide");
  });

  it("a newer order for the same tile replaces the older one", async () => {
    await bot.onMessage(msg("attack tile 5 with 120"));
    await bot.onMessage(msg("attack tile 5 with 80"));
    const orders = pool.list("tg:42");
    expect(orders).toHaveLength(1);
    expect(orders[0].intent.committed).toBe(80);
  });

  it("orders for different tiles coexist; /orders lists them", async () => {
    await bot.onMessage(msg("attack tile 5 with 120"));
    await bot.onMessage(msg("raid tile 7, commit 60"));
    await bot.onMessage(msg("/orders"));
    expect(transport.last()).toContain("tile 5");
    expect(transport.last()).toContain("tile 7");
  });

  it("players are isolated by handle", async () => {
    await bot.onMessage(msg("attack tile 5 with 120", 42));
    await bot.onMessage(msg("attack tile 5 with 99", 77, "budi"));
    expect(pool.size()).toBe(2);
    expect(pool.list("tg:42")[0].intent.committed).toBe(120);
    expect(pool.list("tg:77")[0].intent.committed).toBe(99);
  });

  it("replies with the reason when it cannot parse", async () => {
    await bot.onMessage(msg("what is the meaning of flux?"));
    expect(pool.size()).toBe(0);
    expect(transport.last()).toContain("could not read an order");
  });

  it("/wallet returns the player's session address when a signer is set", async () => {
    const fakeSigner = {
      wallet: (h: string) => ({ address: `0xWALLET_${h}` }),
    };
    const withSigner = new HoldfastBot(
      transport, new RuleBasedParser(), pool, fakeSigner);
    await withSigner.onMessage(msg("/wallet"));
    expect(transport.last()).toContain("0xWALLET_tg:42");
  });

  it("/wallet explains it is off when no signer is wired", async () => {
    await bot.onMessage(msg("/wallet"));
    expect(transport.last()).toContain("not provisioned yet");
  });
});
