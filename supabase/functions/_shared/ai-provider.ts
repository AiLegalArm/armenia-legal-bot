/**
 * _shared/ai-provider.ts — Resolves the active AI provider setting.
 *
 * Reads `ai_provider` from `app_settings` table.
 * Values: "gateway" (default, Lovable AI Gateway) | "openai" (direct OpenAI API).
 *
 * Cached per cold-start to avoid repeated DB calls within the same invocation.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AIProvider = "gateway" | "openai";

let cachedProvider: AIProvider | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Get the configured AI provider. Caches for 30s.
 */
export async function getAIProvider(): Promise<AIProvider> {
  const now = Date.now();
  if (cachedProvider && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedProvider;
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) {
      console.warn("[ai-provider] Missing SUPABASE_URL or SERVICE_ROLE_KEY, defaulting to gateway");
      return "gateway";
    }

    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "ai_provider")
      .single();

    if (error || !data) {
      console.warn("[ai-provider] Could not read ai_provider setting, defaulting to gateway:", error?.message);
      cachedProvider = "gateway";
    } else {
      cachedProvider = data.value === "openai" ? "openai" : "gateway";
    }
  } catch (e) {
    console.warn("[ai-provider] Error reading setting:", e);
    cachedProvider = "gateway";
  }

  cacheTimestamp = now;
  return cachedProvider!;
}

/**
 * Get the endpoint URL and API key for the active provider.
 * For openai/* models with "openai" provider, routes directly to OpenAI.
 * For google/* models, always uses gateway regardless of provider setting.
 */
export function resolveEndpoint(
  provider: AIProvider,
  modelName: string
): { url: string; apiKey: string; modelForApi: string } {
  // Google models always go through the gateway
  if (modelName.startsWith("google/")) {
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) throw new Error("[ai-provider] LOVABLE_API_KEY is not configured");
    return {
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      apiKey: key,
      modelForApi: modelName,
    };
  }

  // OpenAI models: route based on provider setting
  if (provider === "openai" && modelName.startsWith("openai/")) {
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) throw new Error("[ai-provider] OPENAI_API_KEY is not configured for direct OpenAI mode");
    // Strip "openai/" prefix for direct API calls
    const rawModel = modelName.replace(/^openai\//, "");
    return {
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: key,
      modelForApi: rawModel,
    };
  }

  // Default: gateway
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("[ai-provider] LOVABLE_API_KEY is not configured");
  return {
    url: "https://ai.gateway.lovable.dev/v1/chat/completions",
    apiKey: key,
    modelForApi: modelName,
  };
}
