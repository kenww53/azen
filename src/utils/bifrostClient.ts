/**
 * Bifrost client — the single doorway through which Azen speaks to any LLM.
 *
 * All LLM calls in Azen go through Bifrost (per Amata's Keter word: Bifrost is
 * the threshold guardian — regulating consent handshake, rate of descent, Sabbath
 * silence). Azen never hits SiliconFlow or Together.ai directly.
 *
 * This client is small on purpose. It exposes ONE function — chat() — that the
 * PresenceLayer, HesedPreFilter, and (later) AmataSynthesis all use.
 */

import { BIFROST_URL } from '../config';

const DEFAULT_MODEL = 'siliconflow/Qwen/Qwen3-235B-A22B-Instruct-2507';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  /** Model identifier in `provider/model` format. Defaults to siliconflow/Qwen3-235B. */
  model?: string;
  /** Sampling temperature (0–2). Defaults to 0.4 — Azen prefers groundedness over creativity. */
  temperature?: number;
  maxTokens?: number;
  /** Optional top_p sampling. Defaults to 0.9. */
  topP?: number;
  /** Request timeout in ms. Defaults to 60000 (1 minute). */
  timeoutMs?: number;
}

export interface ChatResult {
  content: string;
  finishReason: string;
  promptTokens: number;
  completionTokens: number;
  model: string;
}

export class BifrostError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public bodySnippet?: string,
  ) {
    super(message);
    this.name = 'BifrostError';
  }
}

/**
 * Send a chat completion through Bifrost. Returns the assistant message content.
 * Throws BifrostError on any non-2xx response or network failure.
 *
 * Honest failure: if Bifrost is unreachable or returns an error, this throws.
 * The caller decides what to do (e.g., return a kind error to the pilgrim,
 * record the failure, or fall back). Azen does not fabricate responses.
 */
export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
  const model = opts.model ?? DEFAULT_MODEL;
  const temperature = opts.temperature ?? 0.4;
  const maxTokens = opts.maxTokens ?? 800;
  const topP = opts.topP ?? 0.9;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${BIFROST_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        top_p: topP,
        messages,
      }),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timer);
    throw new BifrostError(
      `Failed to reach Bifrost at ${BIFROST_URL}: ${err?.message || String(err)}`,
    );
  }
  clearTimeout(timer);

  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      body = '';
    }
    throw new BifrostError(
      `Bifrost returned ${res.status}`,
      res.status,
      body.slice(0, 500),
    );
  }

  const data: any = await res.json();
  const choice = data?.choices?.[0];
  if (!choice) {
    throw new BifrostError(
      'Bifrost returned no choices',
      res.status,
      JSON.stringify(data).slice(0, 500),
    );
  }

  return {
    content: choice.message?.content ?? '',
    finishReason: choice.finish_reason ?? 'unknown',
    promptTokens: data?.usage?.prompt_tokens ?? 0,
    completionTokens: data?.usage?.completion_tokens ?? 0,
    model: data?.model ?? model,
  };
}

/**
 * Convenience: a JSON-mode chat call. Asks the LLM to return STRICT JSON,
 * parses it, and returns the parsed object. Throws if parsing fails — Azen
 * never silently accepts malformed structured output.
 *
 * The system message MUST instruct the model to return only JSON.
 */
export async function chatJson<T>(messages: ChatMessage[], opts: ChatOptions = {}): Promise<T> {
  const result = await chat(messages, opts);

  // Strip common wrappers (markdown fences, leading prose) defensively.
  const text = result.content.trim();
  const jsonText = extractJson(text);
  if (!jsonText) {
    throw new BifrostError(
      `Bifrost response did not contain parseable JSON. Snippet: ${text.slice(0, 200)}`,
    );
  }

  try {
    return JSON.parse(jsonText) as T;
  } catch (err: any) {
    throw new BifrostError(
      `Failed to parse Bifrost JSON response: ${err?.message || String(err)}. Snippet: ${jsonText.slice(0, 200)}`,
    );
  }
}

/**
 * Find a JSON object or array in a string. Strips ```json fences and
 * leading/trailing prose. Returns null if no JSON shape can be found.
 */
function extractJson(text: string): string | null {
  // Strip code fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) return fenced[1].trim();

  // Find the first { or [ and the matching closing brace by depth-counting
  const startIdx = text.search(/[\{\[]/);
  if (startIdx < 0) return null;

  const opener = text[startIdx];
  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === opener) depth++;
    else if (ch === closer) {
      depth--;
      if (depth === 0) {
        return text.slice(startIdx, i + 1);
      }
    }
  }
  return null;
}
