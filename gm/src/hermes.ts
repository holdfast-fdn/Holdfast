/**
 * Hermes Agent client — the brain behind the GM's three non-deterministic
 * jobs (faction moves, NL->intent, narration).
 *
 * OpenAI-compatible chat completions, because the Nous Research inference API
 * (https://inference-api.nousresearch.com/v1) speaks that format, as does
 * OpenRouter and a locally-served Hermes. Config is env-only — point it
 * anywhere. No SDK dependency; just fetch.
 *
 * TWO invariants the rest of the system relies on:
 *   1. The LLM never decides an outcome. Every call here returns a PROPOSAL
 *      (a move, an intent, prose) that the caller validates and the chain
 *      disposes. A jailbroken Hermes can still only choose where to commit.
 *   2. A tick never blocks on the LLM. Every call has a timeout; callers
 *      fall back to a deterministic stand-in on any failure (CLAUDE.md:
 *      Hermes reliability — "rules are suggestions, not laws").
 */

export interface HermesConfig {
  baseUrl: string;     // e.g. https://inference-api.nousresearch.com/v1
  apiKey: string;
  model: string;       // e.g. a Hermes model id served by the provider
  timeoutMs: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOpts {
  temperature?: number;
  maxTokens?: number;
  json?: boolean;      // request strict JSON output
}

export class HermesClient {
  constructor(private readonly cfg: HermesConfig) {}

  /** raw completion -> assistant text */
  async chat(messages: ChatMessage[], opts: ChatOpts = {}): Promise<string> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
    try {
      const body: Record<string, unknown> = {
        model: this.cfg.model,
        messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 600,
      };
      if (opts.json) body.response_format = { type: "json_object" };
      const res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        throw new Error(`Hermes ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error("Hermes returned no content");
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  /** completion -> validated JSON. `validate` throws on a bad shape. */
  async chatJson<T>(
    messages: ChatMessage[],
    validate: (raw: unknown) => T,
    opts: ChatOpts = {},
  ): Promise<T> {
    const text = await this.chat(messages, { ...opts, json: true });
    return validate(extractJson(text));
  }
}

/** Pull a JSON object out of a possibly-chatty completion (handles ```json
 *  fences and leading prose). Throws if none is parseable. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("no JSON object in Hermes output");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

/** Build a client from env, or null if Hermes isn't configured (slots then
 *  fall back to their deterministic stand-ins). */
export function hermesFromEnv(
  env: Record<string, string | undefined> = process.env,
): HermesClient | null {
  const baseUrl = env.HERMES_BASE_URL;
  const apiKey = env.HERMES_API_KEY;
  const model = env.HERMES_MODEL;
  if (!baseUrl || !apiKey || !model) return null;
  return new HermesClient({
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey,
    model,
    timeoutMs: Number(env.HERMES_TIMEOUT_MS ?? "12000"),
  });
}
