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

/**
 * Stream variant: parses the Messages SSE stream into delta chunks.
 *
 * Yields one of:
 *   { delta: string }                — text chunk to append to the message
 *   { done: { stopReason, inputTokens, outputTokens } }
 *
 * The caller can `break` early to cancel; pass `signal` from an
 * AbortController to also tear down the underlying fetch.
 */
export interface StreamChunk {
  delta?: string;
  done?: {
    stopReason: string | null;
    inputTokens: number;
    outputTokens: number;
  };
}

export async function* streamComplete(
  opts: CompleteOptions & { signal?: AbortSignal }
): AsyncGenerator<StreamChunk, void, void> {
  const body = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 0.7,
    system: opts.system,
    messages: opts.messages,
    stream: true,
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
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text();
    let msg = text;
    try {
      msg = JSON.parse(text).error?.message ?? text;
    } catch { /* ignore */ }
    throw new Error(`Anthropic ${res.status}: ${msg}`);
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason: string | null = null;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by blank lines.
      let sepIdx: number;
      while ((sepIdx = buffer.indexOf("\n\n")) >= 0) {
        const eventBlock = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        const dataLine = eventBlock
          .split("\n")
          .find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        const data = dataLine.slice(6).trim();
        if (!data || data === "[DONE]") continue;

        let parsed: any;
        try { parsed = JSON.parse(data); } catch { continue; }

        switch (parsed.type) {
          case "message_start":
            inputTokens = parsed.message?.usage?.input_tokens ?? 0;
            break;
          case "content_block_delta":
            if (parsed.delta?.type === "text_delta" && typeof parsed.delta.text === "string") {
              yield { delta: parsed.delta.text };
            }
            break;
          case "message_delta":
            if (parsed.delta?.stop_reason) stopReason = parsed.delta.stop_reason;
            if (parsed.usage?.output_tokens != null) outputTokens = parsed.usage.output_tokens;
            break;
          case "message_stop":
            // emit final done and return
            yield { done: { stopReason, inputTokens, outputTokens } };
            return;
          case "error":
            throw new Error(`Anthropic stream error: ${parsed.error?.message ?? "unknown"}`);
        }
      }
    }
    // If we exited without message_stop, still emit a done.
    yield { done: { stopReason, inputTokens, outputTokens } };
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
}

export const DEFAULT_MODEL = "claude-sonnet-4-6";

/** Models the user can pick. Keep ordered cheap→capable. */
export const MODELS = [
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5 — fastest, cheapest" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 — balanced (recommended)" },
  { id: "claude-opus-4-7", label: "Opus 4.7 — most capable" },
] as const;
