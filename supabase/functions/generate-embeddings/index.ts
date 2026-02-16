import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";


const DIM = 768;
const MAX_ATTEMPTS_BEFORE_DEAD_LETTER = 5;

// ─── Deterministic text embedding via n-gram hashing ─────────────────────────
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return hash;
}

function generateEmbedding(text: string): number[] {
  const vec = new Float64Array(DIM);
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  
  for (let i = 0; i < normalized.length - 2; i++) {
    const trigram = normalized.substring(i, i + 3);
    const h = Math.abs(hashCode(trigram));
    const idx = h % DIM;
    const sign = hashCode(trigram + "_s") > 0 ? 1 : -1;
    vec[idx] += sign;
  }

  const words = normalized.split(/\s+/);
  for (const word of words) {
    if (word.length < 2) continue;
    const h = Math.abs(hashCode("w_" + word));
    const idx = h % DIM;
    const sign = hashCode("ws_" + word) > 0 ? 1 : -1;
    vec[idx] += sign * 2;
  }

  for (let i = 0; i < words.length - 1; i++) {
    const bigram = words[i] + " " + words[i + 1];
    const h = Math.abs(hashCode("b_" + bigram));
    const idx = h % DIM;
    const sign = hashCode("bs_" + bigram) > 0 ? 1 : -1;
    vec[idx] += sign * 1.5;
  }

  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm === 0) norm = 1;

  const result: number[] = new Array(DIM);
  for (let i = 0; i < DIM; i++) {
    result[i] = Math.round((vec[i] / norm) * 1e6) / 1e6;
  }
  return result;
}

// ─── Main handler ────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Accept both internal-key and authenticated user (admin)
  const internalKey = req.headers.get("x-internal-key");
  const expectedKey = Deno.env.get("INTERNAL_INGEST_KEY");
  const isInternalAuth = internalKey && expectedKey && internalKey === expectedKey;

  if (!isInternalAuth) {
    // Fall back to JWT auth
    const authHeader = req.headers.get("Authorization") ?? "";
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const { table, batchLimit = 10 } = await req.json();

    if (!table || !["knowledge_base", "legal_practice_kb"].includes(table)) {
      return new Response(
        JSON.stringify({ error: "Invalid table. Use 'knowledge_base' or 'legal_practice_kb'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
      .order("embedding_attempts", { ascending: true })
      .limit(batchLimit);

    if (fetchError) throw fetchError;

    if (!docs || docs.length === 0) {
      const { count } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .or(`embedding_status.eq.pending,and(embedding_status.eq.failed,embedding_attempts.lt.${MAX_ATTEMPTS_BEFORE_DEAD_LETTER})`);

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
        const textForEmbedding = `${doc.title}\n\n${(doc.content_text || "").substring(0, 4000)}`;
        const embedding = generateEmbedding(textForEmbedding);
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

    const { count: remaining } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .or(`embedding_status.eq.pending,and(embedding_status.eq.failed,embedding_attempts.lt.${MAX_ATTEMPTS_BEFORE_DEAD_LETTER})`);

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
