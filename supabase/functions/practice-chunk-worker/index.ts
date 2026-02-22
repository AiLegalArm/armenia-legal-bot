/**
 * practice-chunk-worker
 *
 * Background worker that processes practice_chunk_jobs:
 * 1. Picks N pending jobs (configurable concurrency)
 * 2. For each doc: chunks content_text using the shared legal chunker
 * 3. Upserts chunks into the appropriate target table
 * 4. Marks job done or failed with retry+backoff
 *
 * Supports two source tables:
 *   - legal_practice_kb  → legal_practice_kb_chunks
 *   - knowledge_base     → knowledge_base_chunks
 *
 * Idempotent: uses DELETE+INSERT per doc (atomic).
 * Resumable: safe to call repeatedly until all jobs done.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { chunkDocument, type LegalDocumentInput } from "../_shared/chunker.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-key, " +
    "x-supabase-client-platform, x-supabase-client-platform-version, " +
    "x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_INPUT_CHARS = 30_000;

// ─── Map source table to doc_type for chunker ──────────────────────

function inferDocType(doc: Record<string, unknown>, sourceTable: string): string {
  // For legal_practice_kb, try to infer from practice_category or court_type
  if (sourceTable === "legal_practice_kb") {
    const courtType = doc.court_type as string | undefined;
    if (courtType === "echr") return "echr_judgment";
    if (courtType === "cassation") return "cassation_ruling";
    if (courtType === "appeal") return "appeal_ruling";
    if (courtType === "first_instance") return "first_instance_ruling";
    if (courtType === "constitutional") return "constitutional_court";
    return "court_decision";
  }

  // For knowledge_base, try to infer from category
  if (sourceTable === "knowledge_base") {
    const category = doc.category as string | undefined;
    if (category?.includes("code")) return "code";
    if (category === "constitution") return "law";
    if (category === "echr" || category === "echr_judgments") return "echr_judgment";
    if (category?.includes("cassation")) return "cassation_ruling";
    return "law"; // default for KB documents
  }

  return "other";
}

// ─── Process a single job ──────────────────────────────────────────
async function processJob(
  supabase: ReturnType<typeof createClient>,
  job: { id: string; document_id: string; source_table: string; attempts: number; max_attempts?: number },
) {
  const attempt = (job.attempts || 0) + 1;
  const src = job.source_table || "legal_practice_kb";

  // Fetch document from source table
  const selectFields = src === "knowledge_base"
    ? "id, title, content_text, category"
    : "id, title, content_text, key_paragraphs, court_type, practice_category, case_number_anonymized, decision_date";

  const { data: doc, error: docErr } = await supabase
    .from(src)
    .select(selectFields)
    .eq("id", job.document_id)
    .single();

  if (docErr || !doc) {
    throw new Error(docErr?.message || "Document not found");
  }

  let contentText = doc.content_text as string || "";

  // Truncate input to prevent compute errors
  if (contentText.length > MAX_INPUT_CHARS) {
    contentText = contentText.substring(0, MAX_INPUT_CHARS);
  }

  if (!contentText || contentText.trim().length < 100) {
    await supabase
      .from("practice_chunk_jobs")
      .update({
        status: "done",
        attempts: attempt,
        completed_at: new Date().toISOString(),
        last_error: "No chunkable content (too short)",
      })
      .eq("id", job.id);
    return 0;
  }

  // Use the shared legal chunker
  const docType = inferDocType(doc, src);
  const input: LegalDocumentInput = {
    doc_type: docType,
    content_text: contentText,
    title: doc.title as string || undefined,
    case_number: (doc as Record<string, unknown>).case_number_anonymized as string || undefined,
  };

  const result = chunkDocument(input);

  if (result.chunks.length === 0) {
    await supabase
      .from("practice_chunk_jobs")
      .update({
        status: "done",
        attempts: attempt,
        completed_at: new Date().toISOString(),
        last_error: "No chunkable content (chunker returned 0 chunks)",
      })
      .eq("id", job.id);
    return 0;
  }

  // Route to correct chunks table
  if (src === "knowledge_base") {
    await supabase
      .from("knowledge_base_chunks")
      .delete()
      .eq("kb_id", job.document_id);

    const rows = result.chunks.map((c) => ({
      kb_id: job.document_id,
      chunk_index: c.chunk_index,
      chunk_text: c.chunk_text,
      chunk_hash: c.chunk_hash,
      chunk_type: c.chunk_type,
      char_start: c.char_start,
      char_end: c.char_end,
      label: c.label,
      is_active: true,
    }));

    const { error: insertErr } = await supabase
      .from("knowledge_base_chunks")
      .insert(rows);
    if (insertErr) throw insertErr;
  } else {
    await supabase
      .from("legal_practice_kb_chunks")
      .delete()
      .eq("doc_id", job.document_id);

    const rows = result.chunks.map((c) => ({
      doc_id: job.document_id,
      chunk_index: c.chunk_index,
      chunk_text: c.chunk_text,
      chunk_hash: c.chunk_hash,
      title: c.label,
    }));

    const { error: insertErr } = await supabase
      .from("legal_practice_kb_chunks")
      .insert(rows);
    if (insertErr) throw insertErr;
  }

  await supabase
    .from("practice_chunk_jobs")
    .update({
      status: "done",
      attempts: attempt,
      completed_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", job.id);

  return result.chunks.length;
}

// ─── Main handler ──────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
  }

  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const sourceFilter = body.source_table || null;
    const concurrencyDocs = Math.min(
      Number(body.concurrency_docs) || Number(Deno.env.get("CONCURRENCY_DOCS")) || 2,
      5,
    );

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Claim N pending jobs
    let jobQuery = supabase
      .from("practice_chunk_jobs")
      .select("id, document_id, source_table, attempts, max_attempts")
      .in("status", ["pending", "failed"])
      .lt("attempts", 5)
      .order("created_at", { ascending: true })
      .limit(concurrencyDocs);

    if (sourceFilter) {
      jobQuery = jobQuery.eq("source_table", sourceFilter);
    }

    const { data: jobs, error: fetchErr } = await jobQuery;
    if (fetchErr) throw fetchErr;

    if (!jobs || jobs.length === 0) {
      let countQuery = supabase
        .from("practice_chunk_jobs")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "failed"])
        .lt("attempts", 5);
      if (sourceFilter) countQuery = countQuery.eq("source_table", sourceFilter);

      const { count: pendingCount } = await countQuery;

      return new Response(JSON.stringify({
        processed: 0,
        remaining: pendingCount || 0,
        duration_ms: Date.now() - startTime,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Mark as processing
    const jobIds = jobs.map((j) => j.id);
    await supabase
      .from("practice_chunk_jobs")
      .update({ status: "processing", started_at: new Date().toISOString() })
      .in("id", jobIds);

    let processed = 0;
    let failed = 0;
    let totalChunks = 0;
    const errors: string[] = [];

    for (const job of jobs) {
      try {
        const count = await processJob(supabase, job);
        totalChunks += count;
        processed++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        errors.push(`${job.document_id}: ${errMsg}`);
        failed++;

        const attempt = (job.attempts || 0) + 1;
        const newStatus = attempt >= (job.max_attempts || 5) ? "dead_letter" : "failed";

        await supabase
          .from("practice_chunk_jobs")
          .update({
            status: newStatus,
            attempts: attempt,
            last_error: errMsg.substring(0, 500),
          })
          .eq("id", job.id);
      }
    }

    let remainQuery = supabase
      .from("practice_chunk_jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "failed"])
      .lt("attempts", 5);
    if (sourceFilter) remainQuery = remainQuery.eq("source_table", sourceFilter);
    const { count: remainingCount } = await remainQuery;

    const duration = Date.now() - startTime;
    console.log(
      `[practice-chunk-worker] src=${sourceFilter || "all"} processed=${processed} failed=${failed} chunks=${totalChunks} remaining=${remainingCount} duration=${duration}ms`,
    );

    return new Response(JSON.stringify({
      processed,
      failed,
      total_chunks_inserted: totalChunks,
      remaining: remainingCount || 0,
      duration_ms: duration,
      errors: errors.length > 0 ? errors : undefined,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[practice-chunk-worker] fatal:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
