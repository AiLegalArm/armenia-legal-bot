/**
 * practice-embed-worker — Lease-based embedding worker
 * 
 * Claims up to 25 "embed" jobs from practice_chunk_jobs,
 * generates embeddings via OpenRouter, updates the source table.
 * 
 * Auth: x-internal-key only (called by orchestrator).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-key, " +
    "x-supabase-client-platform, x-supabase-client-platform-version, " +
    "x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const EMBEDDING_MODEL = "openai/text-embedding-3-large";
const EMBEDDING_DIMENSIONS = 3072;
const MAX_CHARS_PER_TEXT = 8000;
const MAX_RETRIES = 3;
const DEFAULT_BATCH = 25;

async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES, delayMs = 1000): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn(); } catch (err) {
      lastError = err;
      if (attempt < retries) await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  const truncated = texts.map(t => t.substring(0, MAX_CHARS_PER_TEXT));

  const response = await withRetry(async () => {
    const res = await fetch(`${OPENROUTER_BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ailegalarmenia.lovable.app",
        "X-Title": "AI Legal Armenia",
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: truncated, dimensions: EMBEDDING_DIMENSIONS }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Embeddings error ${res.status}: ${errText}`);
    }
    return res;
  });

  const json = await response.json();
  if (!json.data || !Array.isArray(json.data)) throw new Error("Unexpected embeddings response");

  return [...json.data].sort((a: { index: number }, b: { index: number }) => a.index - b.index)
    .map((d: { embedding: number[] }) => d.embedding);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: x-internal-key
  const internalKey = req.headers.get("x-internal-key");
  const expectedKey = Deno.env.get("INTERNAL_INGEST_KEY");
  const cronKey = Deno.env.get("CRON_WORKER_KEY");
  const isAuth = internalKey && ((expectedKey && internalKey === expectedKey) || (cronKey && internalKey === cronKey));
  if (!isAuth) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(Number(body.concurrency_docs) || DEFAULT_BATCH, 50);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Claim jobs atomically
    const { data: claimedRows, error: claimErr } = await supabase.rpc("claim_pipeline_jobs", {
      p_job_type: "embed",
      p_limit: batchSize,
      p_lease_minutes: 10,
    });

    if (claimErr) {
      console.error(`[embed-worker] claim error: ${claimErr.message}`);
      return new Response(JSON.stringify({ error: claimErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jobs = (claimedRows || []) as Array<{
      id: string; document_id: string; source_table: string; attempts: number; max_attempts: number;
    }>;

    if (jobs.length === 0) {
      return new Response(JSON.stringify({ picked: 0, processed_ok: 0, pending_remaining: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processedOk = 0;
    let processedFailed = 0;
    const errors: string[] = [];

    // Group by source_table for efficiency
    for (const job of jobs) {
      const attempt = (job.attempts || 0) + 1;
      try {
        const src = job.source_table || "knowledge_base";
        const { data: doc, error: docErr } = await supabase
          .from(src)
          .select("id, title, content_text")
          .eq("id", job.document_id)
          .single();

        if (docErr || !doc) throw new Error(docErr?.message || "Document not found");

        const text = `${doc.title}\n\n${(doc.content_text || "").substring(0, MAX_CHARS_PER_TEXT)}`;
        const [embedding] = await getEmbeddings([text]);
        const vectorStr = `[${embedding.join(",")}]`;

        const { error: updateErr } = await supabase
          .from(src)
          .update({
            embedding: vectorStr,
            embedding_status: "success",
            embedding_attempts: attempt,
            embedding_last_attempt: new Date().toISOString(),
            embedding_error: null,
          })
          .eq("id", job.document_id);

        if (updateErr) throw new Error(`Update failed: ${updateErr.message}`);

        // Mark job done
        await supabase.from("practice_chunk_jobs").update({
          status: "done", attempts: attempt, completed_at: new Date().toISOString(), last_error: null,
        }).eq("id", job.id);

        processedOk++;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "Unknown error";
        errors.push(`${job.document_id}: ${errMsg}`);
        processedFailed++;

        if (attempt >= (job.max_attempts || 5)) {
          await supabase.from("practice_chunk_jobs").update({
            status: "dead_letter", attempts: attempt, last_error: errMsg.substring(0, 500),
            lease_expires_at: null,
          }).eq("id", job.id);
        } else {
          // Exponential backoff
          const backoffMinutes = attempt * 2;
          await supabase.from("practice_chunk_jobs").update({
            status: "pending", attempts: attempt, started_at: null, lease_expires_at: null,
            last_error: errMsg.substring(0, 500),
            next_run_at: new Date(Date.now() + backoffMinutes * 60000).toISOString(),
          }).eq("id", job.id);
        }
      }
    }

    // Count remaining
    const { count: remaining } = await supabase
      .from("practice_chunk_jobs")
      .select("id", { count: "exact", head: true })
      .eq("job_type", "embed")
      .in("status", ["pending", "failed"])
      .lt("attempts", 5);

    const duration = Date.now() - startTime;
    console.log(`[embed-worker] picked=${jobs.length} ok=${processedOk} failed=${processedFailed} remaining=${remaining} duration=${duration}ms`);

    return new Response(JSON.stringify({
      picked: jobs.length, processed_ok: processedOk, processed_failed: processedFailed,
      pending_remaining: remaining || 0, duration_ms: duration,
      errors: errors.length > 0 ? errors : undefined,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[embed-worker] fatal:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
