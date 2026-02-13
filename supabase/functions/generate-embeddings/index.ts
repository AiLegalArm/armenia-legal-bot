import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { EMBEDDING_GENERATION } from "../_shared/model-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DIM = 768;
const MAX_RETRIES = 3;
const MAX_ATTEMPTS_BEFORE_DEAD_LETTER = 5;

// ─── Retry with exponential backoff ──────────────────────────────────────────

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelayMs = 500
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 200;
        console.log(`Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms: ${lastError.message}`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ─── Embedding generation (API only, no hash fallback) ───────────────────────

async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await retryWithBackoff(async () => {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_GENERATION.model,
        input: text.substring(0, 2000),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // 429 and 5xx are transient → retry; 4xx (except 429) are permanent
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`Transient API error ${res.status}: ${body.substring(0, 200)}`);
      }
      throw new PermanentError(`API error ${res.status}: ${body.substring(0, 200)}`);
    }

    const data = await res.json();
    const embedding = data?.data?.[0]?.embedding;
    if (!embedding || !Array.isArray(embedding)) {
      throw new PermanentError("API returned no embedding array");
    }
    return embedding;
  }, MAX_RETRIES);

  // Pad or truncate to DIM
  if (response.length === DIM) return response;
  if (response.length > DIM) return response.slice(0, DIM);
  return [...response, ...new Array(DIM - response.length).fill(0)];
}

/** Permanent errors should not be retried */
class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentError";
  }
}

// ─── Main handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { table, batchLimit = 10 } = await req.json();

    if (!table || !["knowledge_base", "legal_practice_kb"].includes(table)) {
      return new Response(
        JSON.stringify({ error: "Invalid table. Use 'knowledge_base' or 'legal_practice_kb'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch documents with status 'pending' (or 'failed' with < MAX_ATTEMPTS)
    const { data: docs, error: fetchError } = await supabase
      .from(table)
      .select("id, title, content_text, embedding_attempts")
      .eq("is_active", true)
      .or(`embedding_status.eq.pending,and(embedding_status.eq.failed,embedding_attempts.lt.${MAX_ATTEMPTS_BEFORE_DEAD_LETTER})`)
      .order("embedding_attempts", { ascending: true }) // prioritize fresh docs
      .limit(batchLimit);

    if (fetchError) throw fetchError;

    if (!docs || docs.length === 0) {
      // Count remaining processable docs
      const { count } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .or(`embedding_status.eq.pending,and(embedding_status.eq.failed,embedding_attempts.lt.${MAX_ATTEMPTS_BEFORE_DEAD_LETTER})`);

      // Count dead-lettered docs
      const { count: deadCount } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("embedding_status", "failed")
        .gte("embedding_attempts", MAX_ATTEMPTS_BEFORE_DEAD_LETTER);

      return new Response(
        JSON.stringify({
          processedDocs: 0,
          totalRemaining: count || 0,
          deadLetterCount: deadCount || 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    const errors: string[] = [];
    const now = new Date().toISOString();

    for (const doc of docs) {
      const attempts = (doc.embedding_attempts || 0) + 1;
      try {
        const textForEmbedding = `${doc.title}\n\n${(doc.content_text || "").substring(0, 1900)}`;
        const embedding = await generateEmbedding(textForEmbedding, LOVABLE_API_KEY);
        const vectorStr = `[${embedding.join(",")}]`;

        const { error: updateError } = await supabase
          .from(table)
          .update({
            embedding: vectorStr,
            embedding_status: "success",
            embedding_attempts: attempts,
            embedding_last_attempt: now,
            embedding_error: null,
          })
          .eq("id", doc.id);

        if (updateError) {
          errors.push(`${doc.id}: ${updateError.message}`);
        } else {
          processed++;
        }
      } catch (docError) {
        const errMsg = docError instanceof Error ? docError.message : "Unknown error";
        const isDead = attempts >= MAX_ATTEMPTS_BEFORE_DEAD_LETTER;
        errors.push(`${doc.id}: ${errMsg}${isDead ? " [DEAD-LETTER]" : ""}`);

        // Persist failure status
        await supabase
          .from(table)
          .update({
            embedding_status: "failed",
            embedding_attempts: attempts,
            embedding_last_attempt: now,
            embedding_error: errMsg.substring(0, 500),
          })
          .eq("id", doc.id);
      }
    }

    // Count remaining processable
    const { count: remaining } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .or(`embedding_status.eq.pending,and(embedding_status.eq.failed,embedding_attempts.lt.${MAX_ATTEMPTS_BEFORE_DEAD_LETTER})`);

    // Count dead-lettered
    const { count: deadLetterCount } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("embedding_status", "failed")
      .gte("embedding_attempts", MAX_ATTEMPTS_BEFORE_DEAD_LETTER);

    console.log(`Embeddings: processed=${processed}, remaining=${remaining}, deadLetter=${deadLetterCount}, errors=${errors.length}`);

    return new Response(
      JSON.stringify({
        processedDocs: processed,
        totalRemaining: remaining || 0,
        deadLetterCount: deadLetterCount || 0,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Generate embeddings error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
