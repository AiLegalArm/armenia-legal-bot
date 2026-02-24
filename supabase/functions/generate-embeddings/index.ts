import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

// ─── Config ────────────────────────────────────────────────────────────────
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const EMBEDDING_MODEL = "openai/text-embedding-3-large";
const EMBEDDING_DIMENSIONS = 3072;
const MAX_ATTEMPTS_BEFORE_DEAD_LETTER = 5;
const MAX_CHARS_PER_TEXT = 32_000;
const MAX_RETRIES = 3;

// ─── CORS ──────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-key, " +
    "x-supabase-client-platform, x-supabase-client-platform-version, " +
    "x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Retry helper ──────────────────────────────────────────────────────────
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  delayMs = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

// ─── OpenRouter embedding call ─────────────────────────────────────────────
async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  // Truncate texts to max chars
  const truncated = texts.map((t) => t.substring(0, MAX_CHARS_PER_TEXT));

  const response = await withRetry(async () => {
    const res = await fetch(`${OPENROUTER_BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ailegalarmenia.lovable.app",
        "X-Title": "AI Legal Armenia",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: truncated,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter embeddings error ${res.status}: ${errText}`);
    }

    return res;
  });

  const json = await response.json();

  if (!json.data || !Array.isArray(json.data)) {
    throw new Error("Unexpected response format from OpenRouter embeddings");
  }

  const sorted = [...json.data].sort(
    (a: { index: number }, b: { index: number }) => a.index - b.index,
  );
  return sorted.map((d: { embedding: number[] }) => d.embedding);
}

// ─── Main handler ─────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: internal key OR Bearer JWT
  const internalKey = req.headers.get("x-internal-key");
  const expectedKey = Deno.env.get("INTERNAL_INGEST_KEY");
  const isInternalAuth = internalKey && expectedKey && internalKey === expectedKey;

  if (!isInternalAuth) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !data?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const { table, batchLimit = 10 } = await req.json();

    const validTables = [
      "knowledge_base", "legal_practice_kb",
      "knowledge_base_chunks", "legal_practice_kb_chunks",
    ];
    if (!table || !validTables.includes(table)) {
      return new Response(
        JSON.stringify({ error: `Invalid table. Use one of: ${validTables.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const isChunkTable = table.endsWith("_chunks");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Build query based on table type
    const selectFields = isChunkTable
      ? "id, chunk_text, chunk_type, embedding_attempts"
      : "id, title, content_text, embedding_attempts";

    const activeFilter = isChunkTable && table === "legal_practice_kb_chunks"
      ? supabase.from(table).select(selectFields)
      : supabase.from(table).select(selectFields).eq("is_active", true);

    // Fetch documents/chunks pending embedding
    const { data: docs, error: fetchError } = await activeFilter
      .or(
        `embedding_status.eq.pending,and(embedding_status.eq.failed,embedding_attempts.lt.${MAX_ATTEMPTS_BEFORE_DEAD_LETTER})`,
      )
      .order("embedding_attempts", { ascending: true })
      .limit(batchLimit);

    if (fetchError) throw fetchError;

    if (!docs || docs.length === 0) {
      const countBase = isChunkTable && table === "legal_practice_kb_chunks"
        ? supabase.from(table).select("id", { count: "exact", head: true })
        : supabase.from(table).select("id", { count: "exact", head: true }).eq("is_active", true);

      const { count } = await countBase
        .or(
          `embedding_status.eq.pending,and(embedding_status.eq.failed,embedding_attempts.lt.${MAX_ATTEMPTS_BEFORE_DEAD_LETTER})`,
        );

      const deadBase = isChunkTable && table === "legal_practice_kb_chunks"
        ? supabase.from(table).select("id", { count: "exact", head: true })
        : supabase.from(table).select("id", { count: "exact", head: true }).eq("is_active", true);

      const { count: deadCount } = await deadBase
        .eq("embedding_status", "failed")
        .gte("embedding_attempts", MAX_ATTEMPTS_BEFORE_DEAD_LETTER);

      return new Response(
        JSON.stringify({
          processedDocs: 0,
          totalRemaining: count || 0,
          deadLetterCount: deadCount || 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let processed = 0;
    const errors: string[] = [];
    const now = new Date().toISOString();

    // Batch all texts together for efficiency
    // For chunk tables: use chunk_text directly (already segmented)
    // For parent tables: use title + content_text
    const MAX_TEXT_CHARS = isChunkTable ? 3500 : 8000;
    const texts = docs.map((doc) => {
      if (isChunkTable) {
        const prefix = doc.chunk_type ? `[${doc.chunk_type}] ` : "";
        return `${prefix}${(doc.chunk_text || "").substring(0, MAX_TEXT_CHARS)}`;
      }
      return `${doc.title}\n\n${(doc.content_text || "").substring(0, MAX_TEXT_CHARS)}`;
    });

    let vectors: number[][] | null = null;
    try {
      vectors = await getEmbeddings(texts);
      console.log(
        `[generate-embeddings] Got ${vectors.length} vectors (dim=${vectors[0]?.length}) for table=${table}`,
      );
    } catch (batchErr) {
      // If batch fails, fall back to one-by-one
      console.error("[generate-embeddings] Batch embedding failed, falling back to individual:", batchErr);
    }

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      const attempts = (doc.embedding_attempts || 0) + 1;

      try {
        let embedding: number[];

        if (vectors && vectors[i]) {
          embedding = vectors[i];
        } else {
          // Individual fallback
          const fallbackText = isChunkTable
            ? `${doc.chunk_type ? `[${doc.chunk_type}] ` : ""}${(doc.chunk_text || "").substring(0, MAX_TEXT_CHARS)}`
            : `${doc.title}\n\n${(doc.content_text || "").substring(0, MAX_TEXT_CHARS)}`;
          const fallback = await getEmbeddings([fallbackText]);
          embedding = fallback[0];
        }

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
        errors.push(`${doc.id}: ${errMsg}`);
        console.error(`[generate-embeddings] doc ${doc.id} failed:`, errMsg);

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

    const remainBase = isChunkTable && table === "legal_practice_kb_chunks"
      ? supabase.from(table).select("id", { count: "exact", head: true })
      : supabase.from(table).select("id", { count: "exact", head: true }).eq("is_active", true);

    const { count: remaining } = await remainBase
      .or(
        `embedding_status.eq.pending,and(embedding_status.eq.failed,embedding_attempts.lt.${MAX_ATTEMPTS_BEFORE_DEAD_LETTER})`,
      );

    const deadBase2 = isChunkTable && table === "legal_practice_kb_chunks"
      ? supabase.from(table).select("id", { count: "exact", head: true })
      : supabase.from(table).select("id", { count: "exact", head: true }).eq("is_active", true);

    const { count: deadLetterCount } = await deadBase2
      .eq("embedding_status", "failed")
      .gte("embedding_attempts", MAX_ATTEMPTS_BEFORE_DEAD_LETTER);

    console.log(
      `[generate-embeddings] processed=${processed}, remaining=${remaining}, deadLetter=${deadLetterCount}, model=${EMBEDDING_MODEL}`,
    );

    return new Response(
      JSON.stringify({
        processedDocs: processed,
        totalRemaining: remaining || 0,
        deadLetterCount: deadLetterCount || 0,
        model: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[generate-embeddings] error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
