/**
 * practice-chunk-worker — v5 (enterprise-hardened)
 *
 * Changes from v4:
 * 1. Renamed local inferDocType → resolveDocTypeFromRow (no collision with chunker export).
 * 2. Uses chunker v2.2.0: SHA-256 hashes, no table chunks, strict slice invariant.
 * 3. TRUE ATOMIC CLAIM via claim_chunk_jobs() RPC (FOR UPDATE SKIP LOCKED).
 * 4. DELETE-ALL-then-INSERT: proven UNIQUE(doc_id, chunk_index) / UNIQUE(kb_id, chunk_index).
 * 5. Schema-proven inserts: legal_practice_kb_chunks has NO chunk_type, char_start, char_end.
 * 6. Strict internal-only auth via validateInternalRequest.
 *
 * Supports two source tables:
 *   - legal_practice_kb  → legal_practice_kb_chunks
 *   - knowledge_base     → knowledge_base_chunks
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { handleCors, validateInternalRequest } from "../_shared/edge-security.ts";
import {
  chunkDocument,
  validateChunks,
  CHUNKER_VERSION,
  type LegalDocumentInput,
} from "../_shared/chunker.ts";

const MAX_INPUT_CHARS = 200_000;
const PARALLEL_BATCH = 5;

// ─── Row-based doc type resolver (NOT text inference) ──────────────
function resolveDocTypeFromRow(doc: Record<string, unknown>, sourceTable: string): string {
  if (sourceTable === "legal_practice_kb") {
    const courtType = doc.court_type as string | undefined;
    if (courtType === "echr") return "echr_judgment";
    if (courtType === "cassation") return "cassation_ruling";
    if (courtType === "appeal") return "appeal_ruling";
    if (courtType === "first_instance") return "first_instance_ruling";
    if (courtType === "constitutional") return "constitutional_court";
    return "court_decision";
  }

  if (sourceTable === "knowledge_base") {
    const category = doc.category as string | undefined;
    if (category?.includes("code")) return "code";
    if (category === "constitution") return "law";
    if (category === "echr" || category === "echr_judgments") return "echr_judgment";
    if (category?.includes("cassation")) return "cassation_ruling";
    return "law";
  }

  return "other";
}

// ─── Process a single job ──────────────────────────────────────────
interface JobRecord {
  id: string;
  document_id: string;
  source_table: string;
  attempts: number;
  max_attempts?: number;
}

async function processJob(
  supabase: ReturnType<typeof createClient>,
  job: JobRecord,
) {
  const attempt = (job.attempts || 0) + 1;
  const src = job.source_table || "legal_practice_kb";

  const selectFields = src === "knowledge_base"
    ? "id, title, content_text, category"
    : "id, title, content_text, key_paragraphs, court_type, practice_category, case_number_anonymized, decision_date";

  // ── 1. Fetch source document ─────────────────────────────────────
  const { data: doc, error: docErr } = await supabase
    .from(src)
    .select(selectFields)
    .eq("id", job.document_id)
    .single();

  if (docErr || !doc) {
    throw new Error(docErr?.message || "Document not found");
  }

  let contentText = (doc.content_text as string) || "";

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

  // ── 2. Chunk the document ────────────────────────────────────────
  const docType = resolveDocTypeFromRow(doc, src);
  const input: LegalDocumentInput = {
    doc_type: docType,
    content_text: contentText,
    title: (doc.title as string) || undefined,
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

  // ── 3. QA GATE: Validate chunks before any mutation ──────────────
  const qa = validateChunks(contentText, result.chunks);

  if (!qa.ok) {
    const errDetail = qa.errors.slice(0, 5).join("; ");
    console.warn(
      `[practice-chunk-worker] QA FAILED doc=${job.document_id} errors=${errDetail}`,
    );

    const newStatus = attempt >= (job.max_attempts || 5) ? "dead_letter" : "failed";
    await supabase
      .from("practice_chunk_jobs")
      .update({
        status: newStatus,
        attempts: attempt,
        last_error: `QA validation failed: ${errDetail}`.substring(0, 500),
      })
      .eq("id", job.id);
    return 0;
  }

  // ── 4. Atomic: DELETE ALL old chunks, then INSERT fresh ──────────
  // PROVEN: UNIQUE(doc_id, chunk_index) on legal_practice_kb_chunks
  //         UNIQUE(kb_id, chunk_index) on knowledge_base_chunks (idx_kb_chunks_unique)
  const isKB = src === "knowledge_base";
  const chunksTable = isKB ? "knowledge_base_chunks" : "legal_practice_kb_chunks";
  const fkColumn = isKB ? "kb_id" : "doc_id";

  // DELETE all existing chunks for this document
  const { error: deleteErr } = await supabase
    .from(chunksTable)
    .delete()
    .eq(fkColumn, job.document_id);

  if (deleteErr) {
    throw new Error(`Failed to delete old chunks: ${deleteErr.message}`);
  }

  // INSERT new chunks in batches — schema-proven column mapping
  if (isKB) {
    // knowledge_base_chunks: has chunk_type, char_start, char_end, label, is_active
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

    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error: insertErr } = await supabase
        .from("knowledge_base_chunks")
        .insert(batch);
      if (insertErr) throw new Error(`Failed to insert KB chunks: ${insertErr.message}`);
    }
  } else {
    // legal_practice_kb_chunks — PROVEN schema:
    // id, doc_id, chunk_index, chunk_text, chunk_hash, title, created_at
    // NO chunk_type, NO char_start, NO char_end, NO is_active
    const rows = result.chunks.map((c) => ({
      doc_id: job.document_id,
      chunk_index: c.chunk_index,
      chunk_text: c.chunk_text,
      chunk_hash: c.chunk_hash,
      title: c.label,
    }));

    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error: insertErr } = await supabase
        .from("legal_practice_kb_chunks")
        .insert(batch);
      if (insertErr) throw new Error(`Failed to insert practice chunks: ${insertErr.message}`);
    }
  }

  // ── 5. Mark job done ─────────────────────────────────────────────
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
  // ── CORS + Auth ─────────────────────────────────────────────────
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  // STRICT: Internal-only endpoint. No partial auth.
  const authErr = validateInternalRequest(req, corsHeaders);
  if (authErr) return authErr;

  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const sourceFilter = body.source_table || null;
    const concurrencyDocs = Math.min(
      Number(body.concurrency_docs) || Number(Deno.env.get("CONCURRENCY_DOCS")) || 10,
      20,
    );

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── TRUE ATOMIC CLAIM via Postgres RPC ─────────────────────────
    const { data: claimedRows, error: claimErr } = await supabase.rpc("claim_chunk_jobs", {
      p_source_table: sourceFilter,
      p_limit: concurrencyDocs,
      p_lease_minutes: 5,
    });

    if (claimErr) {
      console.error(`[practice-chunk-worker] claim error: ${claimErr.message}`);
      return new Response(JSON.stringify({ error: claimErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const claimedJobs: JobRecord[] = (claimedRows || []) as JobRecord[];

    if (claimedJobs.length === 0) {
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
        chunker_version: CHUNKER_VERSION,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let processed = 0;
    let failed = 0;
    let totalChunks = 0;
    let qaRejected = 0;
    const errors: string[] = [];

    // ── Process in parallel batches ────────────────────────────────
    for (let i = 0; i < claimedJobs.length; i += PARALLEL_BATCH) {
      const batch = claimedJobs.slice(i, i + PARALLEL_BATCH);
      const results = await Promise.allSettled(
        batch.map((job) => processJob(supabase, job)),
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const job = batch[j];

        if (result.status === "fulfilled") {
          if (result.value > 0) {
            totalChunks += result.value;
            processed++;
          } else {
            qaRejected++;
          }
        } else {
          const errMsg = result.reason instanceof Error
            ? result.reason.message
            : "Unknown error";
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
    }

    // ── Count remaining ────────────────────────────────────────────
    let remainQuery = supabase
      .from("practice_chunk_jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "failed"])
      .lt("attempts", 5);
    if (sourceFilter) remainQuery = remainQuery.eq("source_table", sourceFilter);
    const { count: remainingCount } = await remainQuery;

    const duration = Date.now() - startTime;
    console.log(
      `[practice-chunk-worker] src=${sourceFilter || "all"} processed=${processed} failed=${failed} qa_rejected=${qaRejected} chunks=${totalChunks} remaining=${remainingCount} duration=${duration}ms version=${CHUNKER_VERSION}`,
    );

    return new Response(JSON.stringify({
      processed,
      failed,
      qa_rejected: qaRejected,
      total_chunks_inserted: totalChunks,
      remaining: remainingCount || 0,
      duration_ms: duration,
      chunker_version: CHUNKER_VERSION,
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
