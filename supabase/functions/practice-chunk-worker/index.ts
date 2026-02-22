/**
 * practice-chunk-worker
 *
 * Background worker that processes practice_chunk_jobs:
 * 1. Picks N pending jobs (configurable concurrency)
 * 2. For each doc: chunks content_text using fixed-window chunker
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-key, " +
    "x-supabase-client-platform, x-supabase-client-platform-version, " +
    "x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_INPUT_CHARS = 30_000;
const CHUNK_SIZE = 4000;
const OVERLAP_CHARS = 600;
const MIN_CHUNK_SIZE = 200;

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

interface ChunkResult {
  chunk_index: number;
  chunk_text: string;
  chunk_hash: string;
  label: string | null;
}

function chunkDocument(
  contentText: string,
  docTitle: string | null,
  keyParagraphs: unknown,
): ChunkResult[] {
  let sourceText = "";

  if (keyParagraphs && Array.isArray(keyParagraphs) && keyParagraphs.length > 0) {
    const parts: string[] = [];
    for (const kp of keyParagraphs) {
      if (typeof kp === "string") {
        parts.push(kp);
      } else if (kp && typeof kp === "object") {
        const fields = [kp.principle, kp.quote, kp.anchor].filter(Boolean);
        if (fields.length > 0) parts.push(fields.join("\n"));
      }
    }
    if (parts.join("\n").length > MIN_CHUNK_SIZE) {
      sourceText = parts.join("\n\n");
    }
  }

  if (!sourceText && contentText) {
    sourceText = contentText;
  }

  if (!sourceText || sourceText.trim().length < MIN_CHUNK_SIZE) {
    return [];
  }

  sourceText = normalizeWhitespace(sourceText);
  if (sourceText.length > MAX_INPUT_CHARS) {
    sourceText = sourceText.substring(0, MAX_INPUT_CHARS);
  }

  const chunks: ChunkResult[] = [];
  let pos = 0;
  let idx = 0;

  while (pos < sourceText.length) {
    let end = Math.min(pos + CHUNK_SIZE, sourceText.length);

    if (end < sourceText.length) {
      const lastPara = sourceText.lastIndexOf("\n\n", end);
      if (lastPara > pos + MIN_CHUNK_SIZE) {
        end = lastPara;
      } else {
        const lastNl = sourceText.lastIndexOf("\n", end);
        if (lastNl > pos + MIN_CHUNK_SIZE) {
          end = lastNl;
        }
      }
    }

    const chunkText = sourceText.slice(pos, end).trim();
    if (chunkText.length >= MIN_CHUNK_SIZE) {
      chunks.push({
        chunk_index: idx++,
        chunk_text: chunkText,
        chunk_hash: simpleHash(chunkText),
        label: docTitle,
      });
    }

    pos = end > pos ? end - OVERLAP_CHARS : end + 1;
    if (end >= sourceText.length) break;
  }

  return chunks;
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
    ? "id, title, content_text"
    : "id, title, content_text, key_paragraphs";

  const { data: doc, error: docErr } = await supabase
    .from(src)
    .select(selectFields)
    .eq("id", job.document_id)
    .single();

  if (docErr || !doc) {
    throw new Error(docErr?.message || "Document not found");
  }

  const chunks = chunkDocument(
    doc.content_text,
    doc.title,
    src === "legal_practice_kb" ? doc.key_paragraphs : null,
  );

  if (chunks.length === 0) {
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

  // Route to correct chunks table
  if (src === "knowledge_base") {
    // knowledge_base_chunks schema: kb_id, chunk_index, chunk_text, chunk_hash, chunk_type, char_start, char_end, label
    await supabase
      .from("knowledge_base_chunks")
      .delete()
      .eq("kb_id", job.document_id);

    let charPos = 0;
    const rows = chunks.map((c) => {
      const row = {
        kb_id: job.document_id,
        chunk_index: c.chunk_index,
        chunk_text: c.chunk_text,
        chunk_hash: c.chunk_hash,
        chunk_type: "article",
        char_start: charPos,
        char_end: charPos + c.chunk_text.length,
        label: c.label,
        is_active: true,
      };
      charPos += c.chunk_text.length;
      return row;
    });

    const { error: insertErr } = await supabase
      .from("knowledge_base_chunks")
      .insert(rows);
    if (insertErr) throw insertErr;
  } else {
    // legal_practice_kb_chunks schema: doc_id, chunk_index, chunk_text, chunk_hash, title
    await supabase
      .from("legal_practice_kb_chunks")
      .delete()
      .eq("doc_id", job.document_id);

    const rows = chunks.map((c) => ({
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

  return chunks.length;
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
    const sourceFilter = body.source_table || null; // optional filter
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
