/**
 * _shared/gateway-bypass.ts — Centralized helper for edge functions
 * that MUST call the AI gateway directly (e.g. tool_calling, streaming).
 *
 * All bypass calls MUST resolve model/temperature/max_tokens from MODEL_MAP
 * to prevent model drift. Every call is logged with bypass_reason.
 */

import { getModelConfig, type ModelConfig } from "./openai-router.ts";

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export interface BypassOptions {
  /** Function name for MODEL_MAP lookup */
  functionName: string;
  /** Reason for bypassing the router (e.g. "tool_calling", "streaming") */
  bypassReason: string;
  /** Additional body fields (tools, tool_choice, stream, etc.) */
  extraBody?: Record<string, unknown>;
  /** Override timeout in ms (default 60000) */
  timeoutMs?: number;
}

export interface BypassResult {
  data: Record<string, unknown>;
  model_used: string;
  latency_ms: number;
  request_id: string;
}

/**
 * Build a gateway request body using MODEL_MAP config + extra fields.
 * Respects provider-aware parameter rules (max_completion_tokens for OpenAI chat).
 */
function buildBypassBody(
  cfg: ModelConfig,
  messages: Array<{ role: string; content: unknown }>,
  extraBody?: Record<string, unknown>
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    model: cfg.model,
    temperature: cfg.temperature,
    messages,
  };

  // Provider-aware max tokens
  if (cfg.model.startsWith("openai/") && !cfg.model.startsWith("openai/text-embedding-")) {
    base.max_completion_tokens = cfg.max_tokens;
  } else {
    base.max_tokens = cfg.max_tokens;
  }

  // Merge extra fields (tools, tool_choice, stream, etc.)
  if (extraBody) {
    Object.assign(base, extraBody);
  }

  return base;
}

/**
 * Execute a gateway bypass call with mandatory logging.
 */
export async function callGatewayBypass(
  messages: Array<{ role: string; content: unknown }>,
  options: BypassOptions
): Promise<BypassResult> {
  const cfg = getModelConfig(options.functionName);
  const requestId = crypto.randomUUID();
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("[gateway-bypass] LOVABLE_API_KEY is not configured");

  const body = buildBypassBody(cfg, messages, options.extraBody);
  const timeoutMs = options.timeoutMs ?? 60000;

  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const latency_ms = Date.now() - t0;

    // Mandatory bypass log
    console.log(JSON.stringify({
      fn: options.functionName,
      model: cfg.model,
      temperature: cfg.temperature,
      max_tokens: cfg.max_tokens,
      request_id: requestId,
      latency_ms,
      status: response.status,
      bypass_reason: options.bypassReason,
    }));

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw Object.assign(
        new Error(`AI Gateway error ${response.status}: ${errText.substring(0, 200)}`),
        { status: response.status }
      );
    }

    const data = await response.json();

    return {
      data,
      model_used: cfg.model,
      latency_ms,
      request_id: requestId,
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}
