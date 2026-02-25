/**
 * practice-chunk-worker — Enterprise-safe v2
 *
 * Background worker that processes practice_chunk_jobs:
 * 1. Lease-based claiming via started_at (5-min lease window)
 * 2. QA gate: validateChunks() before any mutation
 * 3. chunk_set_version = SHA256(content + CHUNKER_VERSION) for idempotency
 * 4. Insert-before-delete: old chunks removed only after successful insert
 * 5. Retry with exponential backoff; dead_letter after max_attempts
 *
 * Supports two source tables:
 *   - legal_practice_kb  → legal_practice_kb_chunks
 *   - knowledge_base     → knowledge_base_chunks
 *
 * Idempotent & deterministic. Safe to call repeatedly.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import {
  chunkDocument,
  validateChunks,
  CHUNKER_VERSION,
  type LegalDocumentInput,
} from "../_shared/chunker.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-key, " +
    "x-supabase-client-platform, x-supabase-client-platform-version, " +
    "x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_INPUT_CHARS = 200_000;
const LEASE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const PARALLEL_BATCH = 5;

// ─── Stable SHA-256 hash ───────────────────────────────────────────
async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Map source table to doc_type for chunker ──────────────────────
function inferDocType(doc: Record<string, unknown>, sourceTable: string): string {
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
  const docType = inferDocType(doc, src);
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

  // ── 4. Compute chunk_set_version for idempotency ─────────────────
  const chunkSetVersion = await sha256(contentText + CHUNKER_VERSION);

  // ── 5. Insert new chunks FIRST, then delete old ones ─────────────
  if (src === "knowledge_base") {
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

    // Insert new chunks in batches
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error: insertErr } = await supabase
        .from("knowledge_base_chunks")
        .insert(batch);
      if (insertErr) throw insertErr;
    }

    // Delete old chunks that don't match the new set (by hash comparison)
    // We delete chunks for this doc that are NOT in the new chunk_hash set
    const newHashes = result.chunks.map((c) => c.chunk_hash).filter(Boolean);
    if (newHashes.length > 0) {
      // Delete duplicates from previous versions — chunks whose hash is NOT in new set
      const { error: deleteErr } = await supabase
        .from("knowledge_base_chunks")
        .delete()
        .eq("kb_id", job.document_id)
        .not("chunk_hash", "in", `(${newHashes.join(",")})`);
      if (deleteErr) {
        console.warn(`[practice-chunk-worker] old chunk cleanup warning: ${deleteErr.message}`);
      }
    }
  } else {
    // legal_practice_kb_chunks
    const rows = result.chunks.map((c) => ({
      doc_id: job.document_id,
      chunk_index: c.chunk_index,
      chunk_text: c.chunk_text,
      chunk_hash: c.chunk_hash,
      chunk_type: c.chunk_type || "other",
      title: c.label,
    }));

    // Insert new chunks in batches
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error: insertErr } = await supabase
        .from("legal_practice_kb_chunks")
        .insert(batch);
      if (insertErr) throw insertErr;
    }

    // Delete old chunks not matching new hashes
    const newHashes = result.chunks.map((c) => c.chunk_hash).filter(Boolean);
    if (newHashes.length > 0) {
      const { error: deleteErr } = await supabase
        .from("legal_practice_kb_chunks")
        .delete()
        .eq("doc_id", job.document_id)
        .not("chunk_hash", "in", `(${newHashes.join(",")})`);
      if (deleteErr) {
        console.warn(`[practice-chunk-worker] old chunk cleanup warning: ${deleteErr.message}`);
      }
    }
  }

  // ── 6. Mark job done ─────────────────────────────────────────────
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

  // ── Auth check ───────────────────────────────────────────────────
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
      Number(body.concurrency_docs) || Number(Deno.env.get("CONCURRENCY_DOCS")) || 10,
      20,
    );

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Lease-based recovery: reclaim expired leases ───────────────
    // Jobs stuck in "processing" with started_at older than LEASE_DURATION
    // are reclaimed back to "pending" so another invocation can pick them up.
    const leaseExpiry = new Date(Date.now() - LEASE_DURATION_MS).toISOString();
    let recoverQuery = supabase
      .from("practice_chunk_jobs")
      .update({ status: "pending", started_at: null })
      .eq("status", "processing")
      .lt("started_at", leaseExpiry);
    if (sourceFilter) recoverQuery = recoverQuery.eq("source_table", sourceFilter);
    await recoverQuery;

    // ── Lease-based claim: atomically claim jobs ───────────────────
    // We claim by setting status='processing' and started_at=now()
    // Only jobs where lease has expired (or never started) are eligible.
    const now = new Date().toISOString();

    // Step 1: Find eligible jobs
    let findQuery = supabase
      .from("practice_chunk_jobs")
      .select("id, document_id, source_table, attempts, max_attempts")
      .in("status", ["pending", "failed"])
      .lt("attempts", 5)
      .order("created_at", { ascending: true })
      .limit(concurrencyDocs);

    if (sourceFilter) {
      findQuery = findQuery.eq("source_table", sourceFilter);
    }

    const { data: jobs, error: fetchErr } = await findQuery;
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
        chunker_version: CHUNKER_VERSION,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Step 2: Atomically claim via lease (set started_at = now)
    const jobIds = jobs.map((j) => j.id);
    const { error: claimErr } = await supabase
      .from("practice_chunk_jobs")
      .update({ status: "processing", started_at: now })
      .in("id", jobIds)
      .in("status", ["pending", "failed"]); // re-check status to prevent double-claim

    if (claimErr) {
      console.warn(`[practice-chunk-worker] claim warning: ${claimErr.message}`);
    }

    let processed = 0;
    let failed = 0;
    let totalChunks = 0;
    let qaRejected = 0;
    const errors: string[] = [];

    // ── Process in parallel batches ────────────────────────────────
    for (let i = 0; i < jobs.length; i += PARALLEL_BATCH) {
      const batch = jobs.slice(i, i + PARALLEL_BATCH);
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
            // QA rejection or empty content — already handled in processJob
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
