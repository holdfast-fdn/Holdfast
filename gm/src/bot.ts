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

import type { NLIntentParser } from "./types.js";
import type { IntentPool } from "./intentPool.js";

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
}

const HELP = [
  "I am the Herald. Speak your orders and I carry them to the isles.",
  "",
  "Examples:",
  "  attack tile 5 with 120 flux",
  "  raid tile_03, commit 80",
  "",
  "/play   — how to play, step by step",
  "/orders — what you have queued for the next tick",
  "/wallet — your on-chain identity in the isles",
  "/map    — open the live map of the isles",
  "/help   — this message",
  "",
  "Orders lock at tick close. The chain decides; I only carry the word.",
].join("\n");

const HOWTO = [
  "⚔️ How to play, in three breaths:",
  "",
  "1. Claim your seal — tap 🔑 My Wallet. The Herald grants your starting Flux.",
  "2. Speak an order in plain words, e.g.:",
  "     attack tile 5 with 120 flux",
  "3. At tick close your order is signed, the world resolves on-chain, and I",
  "   return with news. Watch it live on 🗺️ the map.",
  "",
  "The chain decides every outcome — not me, not anyone. I only carry the word.",
].join("\n");

/** the Telegram bot command list (shown in the “/” menu) */
export const BOT_COMMANDS: Array<{ command: string; description: string }> = [
  { command: "start", description: "Open the Herald's menu" },
  { command: "play", description: "How to play, step by step" },
  { command: "wallet", description: "Your on-chain identity & Flux" },
  { command: "orders", description: "Orders queued for the next tick" },
  { command: "map", description: "Open the live map of the isles" },
  { command: "help", description: "What the Herald understands" },
];

export class HoldfastBot {
  private readonly mapUrl?: (address?: string) => string;

  constructor(
    private readonly transport: TelegramTransport,
    private readonly parser: NLIntentParser,
    private readonly pool: IntentPool,
    /** optional — enables /wallet; without it the command explains it's off */
    private readonly signer?: WalletResolver,
    opts: BotOpts = {},
  ) {
    this.mapUrl = opts.mapUrl;
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
      `Order taken: attack tile ${parsed.tileId} with ` +
        `${parsed.committed} Flux. It locks at tick close — ` +
        `the chain will decide.`,
      { buttons: [[{ text: "📜 My Orders", data: "orders" }, ...(this.mapUrl ? [{ text: "🗺️ Live Map", url: this.mapUrl(this.addrFor(handle)) }] : [])]] },
    );
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

  private sendWallet(chatId: number | string, handle: string): Promise<void> {
    if (!this.signer) {
      return this.transport.send(
        chatId,
        "Your isles identity is not provisioned yet — the Herald will " +
          "tell you when the world opens.",
      );
    }
    const addr = this.signer.wallet(handle).address;
    return this.transport.send(
      chatId,
      "Your standard flies under this seal in the isles:\n" +
        addr +
        "\n\nThe Herald grants your starting Flux to it before the world opens.",
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
