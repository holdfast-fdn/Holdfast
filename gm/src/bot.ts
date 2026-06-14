/**
 * @HoldfastGM — the Telegram surface.
 *
 * Transport is injected so the whole bot is testable without Telegram;
 * the HTTP transport long-polls getUpdates with nothing but fetch (no SDK
 * dependency). The bot itself only translates and queues — it never touches
 * an outcome.
 *
 * Humans play in two ways: type a natural order ("attack tile 5 with 120
 * flux"), or tap the inline buttons the Herald offers. Buttons are pure
 * navigation/info (wallet, orders, how-to, the live map) — the only thing
 * that ever queues an economic move is a parsed order, still validated and
 * still disposed by the chain.
 */

import type { AttackIntent, NLIntentParser } from "./types.js";
import type { IntentPool } from "./intentPool.js";
import type { WorldView } from "./faction.js";

export interface IncomingMessage {
  chatId: number | string;
  userId: number | string;
  username?: string;
  text: string;
}

/** a tapped inline button (callback_query) */
export interface IncomingCallback {
  id: string;
  chatId: number | string;
  userId: number | string;
  username?: string;
  data: string;
}

/** one inline-keyboard button: a callback action OR a link */
export interface InlineButton {
  text: string;
  data?: string; // callback_data
  url?: string;
}
export type Keyboard = InlineButton[][];

export interface SendOpts {
  buttons?: Keyboard;
}

export interface TelegramTransport {
  send(chatId: number | string, text: string, opts?: SendOpts): Promise<void>;
  /** ack a tapped button so its spinner stops (optional in fakes) */
  answerCallback?(id: string, text?: string): Promise<void>;
}

/** resolves a player handle to their custodial session address (CustodialSigner) */
export interface WalletResolver {
  wallet(handle: string): { address: string };
}

export interface BotOpts {
  /** builds the live-map URL, optionally centred on the player's address */
  mapUrl?: (address?: string) => string;
  /** read the live world (tiles + params) — enables Flux balance + win-odds
   *  preview. The Herald only PREVIEWS the deterministic chance; it never
   *  decides the outcome. */
  readWorld?: () => Promise<WorldView>;
  /** read a player's committable Flux (escrow), whole tokens */
  readEscrow?: (address: string) => Promise<number>;
}

const HELP = [
  "I am the Herald. Speak an order and I carry it to the isles.",
  "",
  "⚔️ Orders — commit Flux to attack an isle (by its number):",
  "  attack tile 5 with 120 flux",
  "  raid tile 3 with 80",
  "  take tile 7 using 60",
  "When you order, I tell you your chance to take it.",
  "",
  "/play   — the goal, Flux & how odds work",
  "/wallet — your Flux balance & isles held",
  "/orders — what you have queued",
  "/map    — live map: owners, garrisons, tile numbers",
  "",
  "Orders lock at tick close. The chain decides; I only carry the word.",
].join("\n");

const HOWTO = [
  "⚔️ How to play Holdfast",
  "",
  "🎯 GOAL: take isles and hold them. Every isle you hold yields Flux to you",
  "   each tick — the more ground you hold, the richer you grow.",
  "",
  "💰 FLUX is your war chest. Commit it to attack an isle:",
  "     attack tile 5 with 120 flux",
  "   • Win  → you take the isle + a share of its garrison.",
  "   • Lose → most of your committed Flux burns (some goes to the defender).",
  "   Tap 🔑 My Wallet anytime to see your Flux.",
  "",
  "🎲 ODDS: a bigger commit vs the isle's garrison = a better chance — but",
  "   defenders have the edge, so matching the garrison isn't quite a coin",
  "   flip. When you place an order, I show you the exact chance.",
  "",
  "🗺️ Isles are NUMBERED. Open the map to see tile numbers, owners & garrisons.",
  "",
  "The chain decides every outcome — not me, not anyone. I only carry the word.",
].join("\n");

/** the Telegram bot command list (shown in the “/” menu) */
export const BOT_COMMANDS: Array<{ command: string; description: string }> = [
  { command: "start", description: "Open the Herald's menu" },
  { command: "play", description: "How to play, step by step" },
  { command: "wallet", description: "Your Flux balance & isles held" },
  { command: "orders", description: "Orders queued for the next tick" },
  { command: "map", description: "Open the live map of the isles" },
  { command: "help", description: "What the Herald understands" },
];

export class HoldfastBot {
  private readonly mapUrl?: (address?: string) => string;
  private readonly readWorld?: () => Promise<WorldView>;
  private readonly readEscrow?: (address: string) => Promise<number>;

  constructor(
    private readonly transport: TelegramTransport,
    private readonly parser: NLIntentParser,
    private readonly pool: IntentPool,
    /** optional — enables /wallet; without it the command explains it's off */
    private readonly signer?: WalletResolver,
    opts: BotOpts = {},
  ) {
    this.mapUrl = opts.mapUrl;
    this.readWorld = opts.readWorld;
    this.readEscrow = opts.readEscrow;
  }

  /** the main menu keyboard, personalised with the player's map link */
  private menu(handle: string): Keyboard {
    const rows: Keyboard = [
      [{ text: "⚔️ How to Play", data: "howto" }, { text: "🔑 My Wallet", data: "wallet" }],
      [{ text: "📜 My Orders", data: "orders" }],
    ];
    if (this.mapUrl) {
      const addr = this.signer ? this.signer.wallet(handle).address : undefined;
      rows[1].push({ text: "🗺️ Live Map", url: this.mapUrl(addr) });
    }
    return rows;
  }

  private welcome(chatId: number | string, handle: string): Promise<void> {
    return this.transport.send(
      chatId,
      [
        "⚓ Welcome to Holdfast — The Sundered Isles.",
        "",
        "I am the Herald. Tap below, or just tell me what you want:",
        "  attack tile 5 with 120 flux",
      ].join("\n"),
      { buttons: this.menu(handle) },
    );
  }

  async onMessage(msg: IncomingMessage): Promise<void> {
    const text = msg.text.trim();
    const handle = `tg:${msg.userId}`;
    const display = msg.username ?? `player-${msg.userId}`;

    if (text === "/start") {
      await this.welcome(msg.chatId, handle);
      return;
    }
    if (text === "/help") {
      await this.transport.send(msg.chatId, HELP, { buttons: this.menu(handle) });
      return;
    }
    if (text === "/play") {
      await this.sendHowto(msg.chatId, handle);
      return;
    }
    if (text === "/wallet") {
      await this.sendWallet(msg.chatId, handle);
      return;
    }
    if (text === "/orders") {
      await this.sendOrders(msg.chatId, handle);
      return;
    }
    if (text === "/map") {
      await this.sendMap(msg.chatId, handle);
      return;
    }

    const parsed = await this.parser.parse(text);
    if (parsed.kind === "unknown") {
      await this.transport.send(
        msg.chatId,
        `The Herald squints: ${parsed.reason}`,
        { buttons: [[{ text: "⚔️ How to Play", data: "howto" }]] },
      );
      return;
    }

    this.pool.add({ handle, display, intent: parsed });
    await this.transport.send(
      msg.chatId,
      await this.orderConfirmation(parsed),
      { buttons: [[{ text: "📜 My Orders", data: "orders" }, ...(this.mapUrl ? [{ text: "🗺️ Live Map", url: this.mapUrl(this.addrFor(handle)) }] : [])]] },
    );
  }

  /** Order receipt + a PREVIEW of the deterministic win chance. The Herald
   *  only shows the math (committed vs garrison); the chain still decides. */
  private async orderConfirmation(o: AttackIntent): Promise<string> {
    const base = `⚔️ Order taken: attack tile ${o.tileId} with ${o.committed} Flux.`;
    const tail = "\nIt locks at tick close — the chain decides.";
    if (!this.readWorld) return base + tail;
    try {
      const world = await this.readWorld();
      const tile = world.tiles.find((t) => t.tileId === o.tileId);
      if (!tile) return `${base}\n⚠ There is no tile ${o.tileId} in this region (isles are ${`0–${world.tiles.length - 1}`}).`;
      if (o.committed < world.minCommit)
        return `${base}\n⚠ Below the minimum of ${world.minCommit} Flux — this order would be skipped. Commit more.`;
      // p = committed^α / (committed^α + garrison^α · δ)  — defenders get δ.
      const pa = Math.pow(o.committed, world.alpha);
      const pd = Math.pow(Math.max(tile.garrison, 0.0001), world.alpha) * world.delta;
      const pct = Math.round((pa / (pa + pd)) * 100);
      const held = tile.ownerIsWilds ? "the wilds" : `${tile.owner.slice(0, 6)}…`;
      return (
        `${base}\n\n🎲 ~${pct}% to take it.\n` +
        `Isle ${o.tileId} is held by ${held} with ${tile.garrison.toFixed(0)} Flux garrison ` +
        `(defenders have the edge). Commit more to raise your odds.${tail}`
      );
    } catch {
      return base + tail;
    }
  }

  /** dispatch a tapped inline button */
  async onCallback(cb: IncomingCallback): Promise<void> {
    const handle = `tg:${cb.userId}`;
    await this.transport.answerCallback?.(cb.id);
    switch (cb.data) {
      case "menu":
        return void (await this.welcome(cb.chatId, handle));
      case "howto":
        return void (await this.sendHowto(cb.chatId, handle));
      case "wallet":
        return void (await this.sendWallet(cb.chatId, handle));
      case "orders":
        return void (await this.sendOrders(cb.chatId, handle));
      case "map":
        return void (await this.sendMap(cb.chatId, handle));
      default:
        return;
    }
  }

  private addrFor(handle: string): string | undefined {
    return this.signer ? this.signer.wallet(handle).address : undefined;
  }

  private sendHowto(chatId: number | string, handle: string): Promise<void> {
    return this.transport.send(chatId, HOWTO, { buttons: this.menu(handle) });
  }

  private async sendWallet(chatId: number | string, handle: string): Promise<void> {
    if (!this.signer) {
      return this.transport.send(
        chatId,
        "Your isles identity is not provisioned yet — the Herald will " +
          "tell you when the world opens.",
      );
    }
    const addr = this.signer.wallet(handle).address;
    let balance = "";
    if (this.readEscrow && this.readWorld) {
      try {
        const [flux, world] = await Promise.all([this.readEscrow(addr), this.readWorld()]);
        const isles = world.tiles.filter((t) => t.owner.toLowerCase() === addr.toLowerCase()).length;
        balance = `\n\n💰 ${flux.toFixed(1)} Flux  ·  🏴 ${isles} isle${isles === 1 ? "" : "s"} held`;
      } catch {
        balance = "\n\n(couldn't read your balance from the chain just now)";
      }
    }
    return this.transport.send(
      chatId,
      `🔑 Your seal in the isles:\n${addr}${balance}\n\n` +
        "Flux is your war chest — commit it to take isles. Win and you gain " +
        "more; lose and most of it burns.",
      { buttons: this.menu(handle) },
    );
  }

  private sendOrders(chatId: number | string, handle: string): Promise<void> {
    const queued = this.pool.list(handle);
    return this.transport.send(
      chatId,
      queued.length === 0
        ? "No orders queued. The isles wait — speak an order like\n  attack tile 5 with 120 flux"
        : "Queued for tick close:\n" +
            queued
              .map((o) => `• attack tile ${o.intent.tileId} with ${o.intent.committed} Flux`)
              .join("\n"),
      { buttons: this.menu(handle) },
    );
  }

  private sendMap(chatId: number | string, handle: string): Promise<void> {
    if (!this.mapUrl) {
      return this.transport.send(chatId, "The live map isn't wired on this node yet.");
    }
    return this.transport.send(
      chatId,
      "🗺️ The Sundered Isles, live from the chain:",
      { buttons: [[{ text: "Open the map", url: this.mapUrl(this.addrFor(handle)) }]] },
    );
  }
}

/** dependency-free long-polling transport (token via env, never in code) */
export class HttpTelegramTransport implements TelegramTransport {
  private offset = 0;
  private running = false;

  constructor(private readonly token: string) {}

  private api(method: string): string {
    return `https://api.telegram.org/bot${this.token}/${method}`;
  }

  private toMarkup(buttons?: Keyboard): unknown {
    if (!buttons) return undefined;
    return {
      inline_keyboard: buttons.map((row) =>
        row.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data ?? "" })),
      ),
    };
  }

  async send(chatId: number | string, text: string, opts: SendOpts = {}): Promise<void> {
    const body: Record<string, unknown> = { chat_id: chatId, text };
    const markup = this.toMarkup(opts.buttons);
    if (markup) body.reply_markup = markup;
    const res = await fetch(this.api("sendMessage"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`sendMessage failed: ${res.status} ${await res.text()}`);
    }
  }

  async answerCallback(id: string, text?: string): Promise<void> {
    await fetch(this.api("answerCallbackQuery"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ callback_query_id: id, ...(text ? { text } : {}) }),
    }).catch(() => {});
  }

  /** register the “/” command menu (best-effort; never blocks startup) */
  async setCommands(commands: Array<{ command: string; description: string }>): Promise<void> {
    await fetch(this.api("setMyCommands"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ commands }),
    }).catch(() => {});
  }

  /** long-poll loop; resolves when stop() is called */
  async poll(
    onMessage: (msg: IncomingMessage) => Promise<void>,
    onCallback?: (cb: IncomingCallback) => Promise<void>,
  ): Promise<void> {
    this.running = true;
    while (this.running) {
      try {
        const res = await fetch(this.api("getUpdates"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ offset: this.offset, timeout: 30 }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          result: Array<{
            update_id: number;
            message?: {
              chat: { id: number };
              from?: { id: number; username?: string };
              text?: string;
            };
            callback_query?: {
              id: string;
              data?: string;
              from?: { id: number; username?: string };
              message?: { chat: { id: number } };
            };
          }>;
        };
        if (!data.ok) continue;
        for (const u of data.result) {
          this.offset = u.update_id + 1;
          const m = u.message;
          if (m?.text && m.from) {
            await onMessage({
              chatId: m.chat.id,
              userId: m.from.id,
              username: m.from.username,
              text: m.text,
            });
          }
          const cb = u.callback_query;
          if (cb?.data && cb.from && cb.message && onCallback) {
            await onCallback({
              id: cb.id,
              chatId: cb.message.chat.id,
              userId: cb.from.id,
              username: cb.from.username,
              data: cb.data,
            });
          }
        }
      } catch {
        // transient network failure: back off, keep polling
        await new Promise((r) => setTimeout(r, 3_000));
      }
    }
  }

  stop(): void {
    this.running = false;
  }
}
