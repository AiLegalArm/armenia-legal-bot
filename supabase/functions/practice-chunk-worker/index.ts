/**
 * practice-chunk-worker
 *
 * Background worker that processes practice_chunk_jobs:
 * 1. Picks N pending jobs (configurable concurrency)
 * 2. For each doc: chunks content_text using shared chunker
 * 3. Upserts chunks into legal_practice_kb_chunks
 * 4. Marks job done or failed with retry+backoff
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

// ─── Lightweight chunker for practice docs ─────────────────────────
// Practice docs are court decisions / ECHR judgments.
// We use fixed-window chunking with overlap, matching the shared chunker's approach.

const MAX_INPUT_CHARS = 80_000;
const CHUNK_SIZE = 6000;       // ~1500 tokens
const OVERLAP_CHARS = 800;     // ~200 tokens overlap
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

interface PracticeChunk {
  chunk_index: number;
  chunk_text: string;
  chunk_hash: string;
  title: string | null;
}

function chunkPracticeDoc(
  contentText: string,
  docTitle: string | null,
  keyParagraphs: unknown,
): PracticeChunk[] {
  // Pick best source text: key_paragraphs > content_text
  let sourceText = "";

  // Try key_paragraphs first (array of precedent_units with quote fields)
  if (keyParagraphs && Array.isArray(keyParagraphs) && keyParagraphs.length > 0) {
    const parts: string[] = [];
    for (const kp of keyParagraphs) {
      if (typeof kp === "string") {
        parts.push(kp);
      } else if (kp && typeof kp === "object") {
        // precedent_unit format: { principle, quote, anchor, ... }
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

  // Normalize and cap
  sourceText = normalizeWhitespace(sourceText);
  if (sourceText.length > MAX_INPUT_CHARS) {
    sourceText = sourceText.substring(0, MAX_INPUT_CHARS);
  }

  // Fixed-window chunking with overlap
  const chunks: PracticeChunk[] = [];
  let pos = 0;
  let idx = 0;

  while (pos < sourceText.length) {
    let end = Math.min(pos + CHUNK_SIZE, sourceText.length);

    // Try to break at paragraph boundary
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
        title: docTitle,
      });
    }

    // Advance with overlap
    pos = end > pos ? end - OVERLAP_CHARS : end + 1;
    if (end >= sourceText.length) break;
  }

  return chunks;
}

// ─── Main handler ──────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: internal key OR Bearer JWT (admin only)
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
    const concurrencyDocs = Math.min(
      Number(body.concurrency_docs) || Number(Deno.env.get("CONCURRENCY_DOCS")) || 5,
      20,
    );

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Claim N pending jobs (oldest first, skip dead letters)
    const { data: jobs, error: fetchErr } = await supabase
      .from("practice_chunk_jobs")
      .select("id, document_id, attempts, max_attempts")
      .in("status", ["pending", "failed"])
      .lt("attempts", 5)
      .order("created_at", { ascending: true })
      .limit(concurrencyDocs);

    if (fetchErr) throw fetchErr;

    if (!jobs || jobs.length === 0) {
      const { count: pendingCount } = await supabase
        .from("practice_chunk_jobs")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "failed"])
        .lt("attempts", 5);

      const { count: deadCount } = await supabase
        .from("practice_chunk_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "dead_letter");

      return new Response(JSON.stringify({
        processed: 0,
        remaining: pendingCount || 0,
        dead_letter: deadCount || 0,
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

    // Process each job
    for (const job of jobs) {
      const attempt = (job.attempts || 0) + 1;
      try {
        // Fetch document
        const { data: doc, error: docErr } = await supabase
          .from("legal_practice_kb")
          .select("id, title, content_text, key_paragraphs")
          .eq("id", job.document_id)
          .single();

        if (docErr || !doc) {
          throw new Error(docErr?.message || "Document not found");
        }

        // Generate chunks
        const chunks = chunkPracticeDoc(doc.content_text, doc.title, doc.key_paragraphs);

        if (chunks.length === 0) {
          // No content to chunk — mark done
          await supabase
            .from("practice_chunk_jobs")
            .update({
              status: "done",
              attempts: attempt,
              completed_at: new Date().toISOString(),
              last_error: "No chunkable content (too short)",
            })
            .eq("id", job.id);
          processed++;
          continue;
        }

        // Atomic: delete existing chunks for this doc, then insert new ones
        await supabase
          .from("legal_practice_kb_chunks")
          .delete()
          .eq("doc_id", job.document_id);

        const rows = chunks.map((c) => ({
          doc_id: job.document_id,
          chunk_index: c.chunk_index,
          chunk_text: c.chunk_text,
          chunk_hash: c.chunk_hash,
          title: c.title,
        }));

        const { error: insertErr } = await supabase
          .from("legal_practice_kb_chunks")
          .insert(rows);

        if (insertErr) throw insertErr;

        totalChunks += chunks.length;

        // Mark done
        await supabase
          .from("practice_chunk_jobs")
          .update({
            status: "done",
            attempts: attempt,
            completed_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", job.id);

        processed++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        errors.push(`${job.document_id}: ${errMsg}`);
        failed++;

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

    // Get remaining counts
    const { count: remainingCount } = await supabase
      .from("practice_chunk_jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "failed"])
      .lt("attempts", 5);

    const { count: deadLetterCount } = await supabase
      .from("practice_chunk_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "dead_letter");

    const duration = Date.now() - startTime;
    console.log(
      `[practice-chunk-worker] processed=${processed} failed=${failed} chunks=${totalChunks} remaining=${remainingCount} dead=${deadLetterCount} duration=${duration}ms`,
    );

    return new Response(JSON.stringify({
      processed,
      failed,
      total_chunks_inserted: totalChunks,
      remaining: remainingCount || 0,
      dead_letter: deadLetterCount || 0,
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
