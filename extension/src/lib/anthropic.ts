/**
 * Minimal Anthropic Messages API client for the side panel.
 *
 * BYOK for now — the user pastes their key in Settings and it's stored in
 * chrome.storage.local. Direct browser calls are enabled via
 * `anthropic-dangerous-direct-browser-access: true`. Tradeoff: the key is
 * present in the extension context. For a public-facing build we'd proxy
 * through a Supabase Edge Function so the key never leaves the server.
 */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CompleteOptions {
  apiKey: string;
  model: string;
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface CompleteResult {
  content: string;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export const complete = async (opts: CompleteOptions): Promise<CompleteResult> => {
  const body = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 0.7,
    system: opts.system,
    messages: opts.messages,
  };

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const json = JSON.parse(text);
      msg = json.error?.message ?? text;
    } catch {
      /* ignore */
    }
    throw new Error(`Anthropic ${res.status}: ${msg}`);
  }

  const json = await res.json();
  // content is an array of blocks; concatenate the text blocks.
  const content = (json.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");

  return {
    content,
    stopReason: json.stop_reason ?? null,
    inputTokens: json.usage?.input_tokens ?? 0,
    outputTokens: json.usage?.output_tokens ?? 0,
  };
};

export const DEFAULT_MODEL = "claude-sonnet-4-6";

/** Models the user can pick. Keep ordered cheap→capable. */
export const MODELS = [
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5 — fastest, cheapest" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 — balanced (recommended)" },
  { id: "claude-opus-4-7", label: "Opus 4.7 — most capable" },
] as const;
