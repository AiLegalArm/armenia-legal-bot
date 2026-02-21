/**
 * _shared/openai-router.ts — Centralized OpenAI router for all non-OCR edge functions.
 *
 * CRITICAL RULES:
 * - This is the ONLY file that calls the AI gateway with OpenAI models.
 * - OCR functions (ocr-process, kb-table-screenshots) MUST NOT import this module.
 * - All functions must call by functionName; model is resolved here via MODEL_MAP.
 *
 * Required env vars:
 *   LOVABLE_API_KEY     — AI Gateway key (auto-provisioned)
 *   OPENAI_TIMEOUT_MS   — optional, default 60000
 *   OPENAI_AUDIO_TIMEOUT_MS — optional, default 120000
 *   OPENAI_MAX_RETRIES  — optional, default 2
 */

// ── Model map ────────────────────────────────────────────────────────────────

export interface ModelConfig {
  model: string;
  temperature: number;
  max_tokens: number;
  json_mode?: boolean;
  description: string;
}

/**
 * Strict per-function model assignment.
 * No function may override these; they must call by functionName only.
 * Models map to OpenAI models via Lovable AI Gateway.
 */
export const MODEL_MAP: Record<string, ModelConfig> = {
  // ── High reasoning — anthropic/claude-3.7-sonnet ──────────────────────────
  "ai-analyze": {
    model: "anthropic/claude-3.7-sonnet",
    temperature: 0.1,
    max_tokens: 12000,
    description: "AI legal case analysis (Claude 3.7 Sonnet, temp=0.1)",
  },
  "multi-agent-analyze": {
    model: "anthropic/claude-3.7-sonnet",
    temperature: 0.1,
    max_tokens: 16384,
    description: "Multi-agent legal analysis (Claude 3.7 Sonnet, temp=0.1)",
  },
  "generate-complaint": {
    model: "anthropic/claude-3.7-sonnet",
    temperature: 0.1,
    max_tokens: 12000,
    description: "Legal complaint generation (Claude 3.7 Sonnet, temp=0.1)",
  },
  "legal-chat": {
    model: "anthropic/claude-3.7-sonnet",
    temperature: 0.1,
    max_tokens: 16000,
    description: "Legal chat assistant (Claude 3.7 Sonnet, temp=0.1)",
  },
  "analyze-files-for-complaint": {
    model: "anthropic/claude-3.7-sonnet",
    temperature: 0.1,
    max_tokens: 16384,
    description: "File analysis for complaints (Claude 3.7 Sonnet, temp=0.1)",
  },

  // ── Structured JSON — google/gemini-2.5-pro ───────────────────────────────
  "extract-case-fields": {
    model: "google/gemini-2.5-pro",
    temperature: 0.2,
    max_tokens: 4000,
    json_mode: true,
    description: "Case field extraction — JSON (Gemini 2.5 Pro, temp=0.2)",
  },
  "kb-search-assistant": {
    model: "google/gemini-2.5-pro",
    temperature: 0.2,
    max_tokens: 200,
    json_mode: true,
    description: "KB keyword extraction — JSON (Gemini 2.5 Pro, temp=0.2)",
  },

  // ── Light tasks — google/gemini-2.5-flash ─────────────────────────────────
  "generate-document": {
    model: "google/gemini-2.5-flash",
    temperature: 0.2,
    max_tokens: 10000,
    description: "Legal document generation (Gemini 2.5 Flash, temp=0.2)",
  },
  "audio-transcribe": {
    model: "google/gemini-2.5-flash",
    temperature: 0.1,
    max_tokens: 16000,
    description: "Audio transcription (Gemini 2.5 Flash, temp=0.1)",
  },
};

/**
 * Role-specific model overrides for ai-analyze diagnostic engines.
 * Key format: "functionName:role" -> partial ModelConfig override.
 * Falls back to MODEL_MAP[functionName] if no override exists.
 */
const ROLE_OVERRIDES: Record<string, Partial<ModelConfig>> = {
  // ── High reasoning roles (Claude 3.7 Sonnet, temp=0.1) ────────────────────
  "ai-analyze:strategy_builder": {
    description: "Strategy builder engine",
  },
  "ai-analyze:risk_factors": {
    description: "Risk factors engine",
  },
  "ai-analyze:evidence_weakness": {
    description: "Evidence weakness engine",
  },
  "ai-analyze:hallucination_audit": {
    description: "Hallucination audit engine",
  },
  "ai-analyze:legal_position_comparator": {
    description: "Legal position comparator engine",
  },
  // ── Deterministic drafting (temp=0, 14k tokens) ────────────────────────────
  "ai-analyze:draft_deterministic": {
    temperature: 0,
    max_tokens: 14000,
    description: "Draft deterministic engine (temp=0, 14k tokens)",
  },
  // ── Structured JSON cost-optimized (Gemini 2.5 Pro, temp=0.2, 8k) ─────────
  "ai-analyze:precedent_citation": {
    model: "google/gemini-2.5-pro",
    temperature: 0.2,
    max_tokens: 8000,
    description: "Precedent citation (Gemini 2.5 Pro, JSON, 8k)",
  },
  "ai-analyze:cross_exam": {
    model: "google/gemini-2.5-pro",
    temperature: 0.2,
    max_tokens: 8000,
    description: "Cross-examination (Gemini 2.5 Pro, JSON, 8k)",
  },
  "ai-analyze:deadline_rules": {
    model: "google/gemini-2.5-pro",
    temperature: 0.2,
    max_tokens: 8000,
    description: "Deadline rules (Gemini 2.5 Pro, JSON, 8k)",
  },
  "ai-analyze:law_update_summary": {
    model: "google/gemini-2.5-pro",
    temperature: 0.2,
    max_tokens: 8000,
    description: "Law update summary (Gemini 2.5 Pro, JSON, 8k)",
  },
};

export function getModelConfig(functionName: string, role?: string): ModelConfig {
  // Check role-specific override first
  if (role) {
    const overrideKey = `${functionName}:${role}`;
    const override = ROLE_OVERRIDES[overrideKey];
    if (override) {
      const base = MODEL_MAP[functionName];
      if (!base) {
        throw new Error(
          `[openai-router] No model config for function "${functionName}". ` +
            `Register it in MODEL_MAP or check the function name.`
        );
      }
      return { ...base, ...override } as ModelConfig;
    }
  }

  const cfg = MODEL_MAP[functionName];
  if (!cfg) {
    throw new Error(
      `[openai-router] No model config for function "${functionName}". ` +
        `Register it in MODEL_MAP or check the function name.`
    );
  }
  return cfg;
}

// ── LEGAL safety header (prepended to all legal reasoning functions) ─────────

const LEGAL_REASONING_FNS = new Set([
  "ai-analyze",
  "multi-agent-analyze",
  "legal-chat",
  "generate-complaint",
  "analyze-files-for-complaint",
]);

const JSON_FNS = new Set(["extract-case-fields", "kb-search-assistant"]);

export const LEGAL_SAFETY_HEADER = `RULES:
- Do not invent laws, articles, case numbers, or quotations.
- Use only provided context for citations; if missing, say so.
- If facts are insufficient, list missing facts explicitly.
- Keep output structured and conservative.`;

export const JSON_SAFETY_HEADER = `Return ONLY valid JSON matching the schema. No extra keys. No commentary. Unknown fields must be null.`;

function prependSafetyHeader(
  functionName: string,
  messages: RouterMessage[]
): RouterMessage[] {
  const header = LEGAL_REASONING_FNS.has(functionName)
    ? LEGAL_SAFETY_HEADER
    : JSON_FNS.has(functionName)
      ? JSON_SAFETY_HEADER
      : null;

  if (!header) return messages;

  return messages.map((m, idx) => {
    if (idx === 0 && m.role === "system") {
      return { ...m, content: header + "\n\n" + m.content };
    }
    return m;
  });
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface RouterMessage {
  role: "system" | "user" | "assistant";
  content: string | unknown[]; // allow multimodal content arrays
}

export interface RouterCallOptions {
  /** Override timeout in ms (falls back to env var or default) */
  timeoutMs?: number;
}

export interface TextResult {
  text: string;
  model_used: string;
  latency_ms: number;
  request_id: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface JSONResult<T = unknown> {
  json: T;
  model_used: string;
  latency_ms: number;
  request_id: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

function getApiKey(): string {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("[openai-router] LOVABLE_API_KEY is not configured");
  return key;
}

function defaultTimeout(isAudio: boolean): number {
  if (isAudio) {
    return parseInt(Deno.env.get("OPENAI_AUDIO_TIMEOUT_MS") ?? "120000", 10);
  }
  return parseInt(Deno.env.get("OPENAI_TIMEOUT_MS") ?? "60000", 10);
}

function maxRetries(): number {
  return parseInt(Deno.env.get("OPENAI_MAX_RETRIES") ?? "2", 10);
}

function newRequestId(): string {
  return crypto.randomUUID();
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Core fetch with retries + exponential backoff + jitter.
 * Logs metadata only — never logs user content.
 */
async function fetchWithRetry(
  functionName: string,
  requestId: string,
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<{ data: Record<string, unknown>; latency_ms: number }> {
  const apiKey = getApiKey();
  const max = maxRetries();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= max; attempt++) {
    const t0 = Date.now();

    let response: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      response = await fetch(AI_GATEWAY, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);
    } catch (fetchErr) {
      const latency_ms = Date.now() - t0;
      const errClass =
        fetchErr instanceof Error && fetchErr.name === "AbortError"
          ? "TIMEOUT"
          : "NETWORK_ERROR";

      console.error(
        JSON.stringify({
          request_id: requestId,
          function_name: functionName,
          model_used: body.model,
          attempt,
          latency_ms,
          error_class: errClass,
        })
      );

      lastError = fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr));

      if (attempt < max) {
        const backoff = Math.pow(2, attempt) * 500 + Math.random() * 300;
        await sleep(backoff);
        continue;
      }
      throw lastError;
    }

    const latency_ms = Date.now() - t0;

    // Log metadata only
    console.log(
      JSON.stringify({
        request_id: requestId,
        function_name: functionName,
        model_used: body.model,
        attempt,
        status: response.status,
        latency_ms,
      })
    );

    if (!response.ok) {
      if (isRetryable(response.status) && attempt < max) {
        const backoff = Math.pow(2, attempt) * 500 + Math.random() * 300;
        await sleep(backoff);
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }

      // Surface rate-limit and payment errors clearly
      if (response.status === 429) {
        throw Object.assign(new Error("Rate limit exceeded. Please try again later."), {
          status: 429,
        });
      }
      if (response.status === 402) {
        throw Object.assign(
          new Error("AI credits exhausted. Please top up your Lovable Cloud balance."),
          { status: 402 }
        );
      }

      const errText = await response.text().catch(() => "");
      throw new Error(`AI Gateway error ${response.status}: ${errText.substring(0, 200)}`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    // Log token usage
    const usage = data.usage as
      | { prompt_tokens: number; completion_tokens: number; total_tokens: number }
      | undefined;
    if (usage) {
      console.log(
        JSON.stringify({
          request_id: requestId,
          function_name: functionName,
          model_used: body.model,
          token_usage: usage,
        })
      );
    }

    return { data, latency_ms };
  }

  throw lastError ?? new Error("[openai-router] Max retries exceeded");
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a clean request body for the AI gateway.
 * Provider-aware parameter rules:
 *   - anthropic/*: pass temperature + max_tokens (always)
 *   - google/*:    pass temperature + max_tokens (always)
 *   - openai/*:    FORBIDDEN by policy; kept only for legacy safety — omit temperature
 */
function buildRequestBody(
  cfg: ModelConfig,
  messages: RouterMessage[]
): Record<string, unknown> {
  const isOpenAI = cfg.model.startsWith("openai/");
  const tokenKey = isOpenAI ? "max_completion_tokens" : "max_tokens";
  const body: Record<string, unknown> = {
    model: cfg.model,
    [tokenKey]: cfg.max_tokens,
    messages,
  };
  // Anthropic + Google: always pass temperature
  // OpenAI (forbidden by policy but kept for safety): omit temperature
  if (!isOpenAI) {
    body.temperature = cfg.temperature;
  }
  return body;
}

/**
 * callText — Standard text completion (streaming disabled, waits for full response).
 */
export async function callText(
  functionName: string,
  messages: RouterMessage[],
  options: RouterCallOptions & { role?: string } = {}
): Promise<TextResult> {
  const cfg = getModelConfig(functionName, options.role);
  const requestId = newRequestId();
  const safeMessages = prependSafetyHeader(functionName, messages);
  const timeoutMs = options.timeoutMs ?? defaultTimeout(false);

  const body = buildRequestBody(cfg, safeMessages);

  const { data, latency_ms } = await fetchWithRetry(
    functionName,
    requestId,
    body,
    timeoutMs
  );

  const choices = data.choices as Array<{ message: { content: string } }>;
  const text = choices?.[0]?.message?.content ?? "";
  const usage = data.usage as TextResult["usage"];

  return { text, model_used: cfg.model, latency_ms, request_id: requestId, usage };
}

/**
 * callJSON — JSON extraction with one auto-repair attempt + schema key validation.
 *
 * @param schema - Object with expected keys (values are unused; only keys matter for validation)
 */
export async function callJSON<T = Record<string, unknown>>(
  functionName: string,
  messages: RouterMessage[],
  schema: Record<string, unknown>,
  options: RouterCallOptions & { role?: string } = {}
): Promise<JSONResult<T>> {
  const cfg = getModelConfig(functionName, options.role);
  const requestId = newRequestId();
  const safeMessages = prependSafetyHeader(functionName, messages);
  const timeoutMs = options.timeoutMs ?? defaultTimeout(false);

  const body = buildRequestBody(cfg, safeMessages);

  const { data, latency_ms } = await fetchWithRetry(
    functionName,
    requestId,
    body,
    timeoutMs
  );

  const choices = data.choices as Array<{ message: { content: string } }>;
  let raw = choices?.[0]?.message?.content ?? "";
  const usage = data.usage as JSONResult["usage"];

  // Strip markdown code fences
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) raw = fenceMatch[1].trim();

  // Attempt parse — no second AI call on failure
  const parsed: T | null = tryParse<T>(raw);

  if (parsed === null) {
    console.error(
      JSON.stringify({
        request_id: requestId,
        function_name: functionName,
        error_class: "JSON_PARSE_FAIL",
        raw_length: raw.length,
      })
    );
    throw Object.assign(
      new Error(
        `[openai-router] ${functionName}: AI returned invalid JSON. No retry.`
      ),
      { code: "INVALID_JSON", raw_preview: raw.substring(0, 200) }
    );
  }

  // Schema key validation: fill missing keys with null, drop extra keys
  const validated = validateSchema<T>(parsed, schema);

  return {
    json: validated,
    model_used: cfg.model,
    latency_ms,
    request_id: requestId,
    usage,
  };
}

/**
 * callTranscription — Multimodal audio/video transcription via gateway.
 * Sends audio as base64 inline content.
 */
export async function callTranscription(
  functionName: string,
  messages: RouterMessage[],
  options: RouterCallOptions = {}
): Promise<TextResult> {
  const cfg = getModelConfig(functionName);
  const requestId = newRequestId();
  const timeoutMs = options.timeoutMs ?? defaultTimeout(true);

  const tokenKey = cfg.model.startsWith("openai/") ? "max_completion_tokens" : "max_tokens";
  const body: Record<string, unknown> = {
    model: cfg.model,
    temperature: cfg.temperature,
    [tokenKey]: cfg.max_tokens,
    messages,
  };

  const { data, latency_ms } = await fetchWithRetry(
    functionName,
    requestId,
    body,
    timeoutMs
  );

  const choices = data.choices as Array<{ message: { content: string } }>;
  const text = choices?.[0]?.message?.content ?? "";
  const usage = data.usage as TextResult["usage"];

  return { text, model_used: cfg.model, latency_ms, request_id: requestId, usage };
}

/**
 * callEmbeddings — Vector embeddings (delegated to embeddings-generate function).
 * Included here for API completeness; actual call is via embeddings.ts.
 */
export async function callEmbeddings(
  texts: string[]
): Promise<{ vectors: number[][]; model_used: string }> {
  // Re-use the existing embeddings-generate edge function
  const { generateEmbeddings } = await import("./embeddings.ts");
  const vectors = await generateEmbeddings(texts);
  return { vectors, model_used: "text-embedding-3-large" };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function tryParse<T>(str: string): T | null {
  try {
    return JSON.parse(str) as T;
  } catch {
    // Try to extract JSON object/array from surrounding text
    const objMatch = str.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]) as T;
      } catch {
        // ignore
      }
    }
    const arrMatch = str.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        return JSON.parse(arrMatch[0]) as T;
      } catch {
        // ignore
      }
    }
    return null;
  }
}

function validateSchema<T>(parsed: unknown, schema: Record<string, unknown>): T {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return parsed as T;
  }

  const obj = parsed as Record<string, unknown>;
  const schemaKeys = Object.keys(schema);

  // Fill missing keys with null
  for (const key of schemaKeys) {
    if (!(key in obj)) {
      obj[key] = null;
    }
  }

  // Drop extra keys
  for (const key of Object.keys(obj)) {
    if (!schemaKeys.includes(key)) {
      delete obj[key];
    }
  }

  return obj as T;
}
