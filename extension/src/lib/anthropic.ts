/**
 * Minimal Anthropic Messages API client for the side panel.
 *
 * BYOK for now — the user pastes their key in Settings and it's stored in
 * chrome.storage.local. Direct browser calls are enabled via
 * `anthropic-dangerous-direct-browser-access: true`. Tradeoff: the key is
 * present in the extension context. For a public-facing build we'd proxy
 * through a Supabase Edge Function so the key never leaves the server.
 */

import type { ToolSchema } from "./agentTools";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface ChatMessage {
  role: "user" | "assistant";
  /**
   * String content works for plain text turns.
   * Block content is required when a turn contains tool_use or tool_result.
   */
  content: string | ContentBlock[];
}

export interface CompleteOptions {
  apiKey: string;
  model: string;
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  tools?: ToolSchema[];
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
  toolUse?: { id: string; name: string; input: Record<string, unknown> };
  done?: {
    stopReason: string | null;
    inputTokens: number;
    outputTokens: number;
    /** Full assistant content array (text + tool_use blocks, ordered). */
    content: ContentBlock[];
  };
}

export async function* streamComplete(
  opts: CompleteOptions & { signal?: AbortSignal }
): AsyncGenerator<StreamChunk, void, void> {
  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 0.7,
    system: opts.system,
    messages: opts.messages,
    stream: true,
  };
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
  }

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

  // Per-content-block state. Anthropic emits blocks in order via
  // content_block_start / content_block_delta / content_block_stop.
  // Text blocks stream their `text`; tool_use blocks stream their
  // `input` field as a sequence of JSON string deltas that we
  // concatenate, then parse on content_block_stop.
  type BlockState =
    | { kind: "text"; text: string }
    | { kind: "tool_use"; id: string; name: string; partialJson: string };
  const blocks: Record<number, BlockState> = {};
  const finalContent: ContentBlock[] = [];

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
          case "content_block_start": {
            const idx = parsed.index;
            const cb = parsed.content_block;
            if (cb?.type === "text") {
              blocks[idx] = { kind: "text", text: cb.text ?? "" };
            } else if (cb?.type === "tool_use") {
              blocks[idx] = { kind: "tool_use", id: cb.id, name: cb.name, partialJson: "" };
            }
            break;
          }
          case "content_block_delta": {
            const idx = parsed.index;
            const block = blocks[idx];
            if (!block) break;
            if (parsed.delta?.type === "text_delta" && block.kind === "text") {
              const t: string = parsed.delta.text ?? "";
              block.text += t;
              if (t) yield { delta: t };
            } else if (parsed.delta?.type === "input_json_delta" && block.kind === "tool_use") {
              block.partialJson += parsed.delta.partial_json ?? "";
            }
            break;
          }
          case "content_block_stop": {
            const idx = parsed.index;
            const block = blocks[idx];
            if (!block) break;
            if (block.kind === "text") {
              finalContent.push({ type: "text", text: block.text });
            } else {
              let input: Record<string, unknown> = {};
              try {
                input = block.partialJson ? JSON.parse(block.partialJson) : {};
              } catch {
                input = { _raw: block.partialJson };
              }
              const toolBlock: ContentBlock = {
                type: "tool_use",
                id: block.id,
                name: block.name,
                input,
              };
              finalContent.push(toolBlock);
              yield { toolUse: { id: block.id, name: block.name, input } };
            }
            break;
          }
          case "message_delta":
            if (parsed.delta?.stop_reason) stopReason = parsed.delta.stop_reason;
            if (parsed.usage?.output_tokens != null) outputTokens = parsed.usage.output_tokens;
            break;
          case "message_stop":
            yield { done: { stopReason, inputTokens, outputTokens, content: finalContent } };
            return;
          case "error":
            throw new Error(`Anthropic stream error: ${parsed.error?.message ?? "unknown"}`);
        }
      }
    }
    // If we exited without message_stop, still emit a done.
    yield { done: { stopReason, inputTokens, outputTokens, content: finalContent } };
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
