/**
 * @HoldfastGM — the Telegram surface.
 *
 * Transport is injected so the whole bot is testable without Telegram;
 * the HTTP transport long-polls getUpdates with nothing but fetch (no SDK
 * dependency). The bot itself only translates and queues — it never touches
 * an outcome.
 */

import type { NLIntentParser } from "./types.js";
import type { IntentPool } from "./intentPool.js";

export interface IncomingMessage {
  chatId: number | string;
  userId: number | string;
  username?: string;
  text: string;
}

export interface TelegramTransport {
  send(chatId: number | string, text: string): Promise<void>;
}

const HELP = [
  "I am the Herald. Speak your orders and I carry them to the isles.",
  "",
  "Examples:",
  "  attack tile 5 with 120 flux",
  "  raid tile_03, commit 80",
  "",
  "/orders — what you have queued for the next tick",
  "/help   — this message",
  "",
  "Orders lock at tick close. The chain decides; I only carry the word.",
].join("\n");

export class HoldfastBot {
  constructor(
    private readonly transport: TelegramTransport,
    private readonly parser: NLIntentParser,
    private readonly pool: IntentPool,
  ) {}

  async onMessage(msg: IncomingMessage): Promise<void> {
    const text = msg.text.trim();
    const handle = `tg:${msg.userId}`;
    const display = msg.username ?? `player-${msg.userId}`;

    if (text === "/start" || text === "/help") {
      await this.transport.send(msg.chatId, HELP);
      return;
    }
    if (text === "/orders") {
      const queued = this.pool.list(handle);
      await this.transport.send(
        msg.chatId,
        queued.length === 0
          ? "No orders queued. The isles wait."
          : "Queued for tick close:\n" +
              queued
                .map(
                  (o) =>
                    `• attack tile ${o.intent.tileId} with ` +
                    `${o.intent.committed} Flux`,
                )
                .join("\n"),
      );
      return;
    }

    const parsed = await this.parser.parse(text);
    if (parsed.kind === "unknown") {
      await this.transport.send(msg.chatId, `The Herald squints: ${parsed.reason}`);
      return;
    }

    this.pool.add({ handle, display, intent: parsed });
    await this.transport.send(
      msg.chatId,
      `Order taken: attack tile ${parsed.tileId} with ` +
        `${parsed.committed} Flux. It locks at tick close — ` +
        `the chain will decide.`,
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

  async send(chatId: number | string, text: string): Promise<void> {
    const res = await fetch(this.api("sendMessage"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      throw new Error(`sendMessage failed: ${res.status} ${await res.text()}`);
    }
  }

  /** long-poll loop; resolves when stop() is called */
  async poll(handler: (msg: IncomingMessage) => Promise<void>): Promise<void> {
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
          }>;
        };
        if (!data.ok) continue;
        for (const u of data.result) {
          this.offset = u.update_id + 1;
          const m = u.message;
          if (!m?.text || !m.from) continue;
          await handler({
            chatId: m.chat.id,
            userId: m.from.id,
            username: m.from.username,
            text: m.text,
          });
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
