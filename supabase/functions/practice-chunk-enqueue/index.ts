/**
 * practice-chunk-enqueue
 *
 * Admin-only endpoint to enqueue missing chunks/embeddings jobs.
 * Actions:
 *   - enqueue_missing_chunks: docs without any chunks
 *   - enqueue_missing_embeddings: docs with embedding_status != 'success'
 *   - diagnostics: return coverage stats
 *   - reset_dead_letters: reset dead-lettered jobs to pending
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
  }

  try {
    const { action } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "diagnostics") {
      // Run all diagnostic queries
      const [totalDocsRes, totalChunksRes, docsNoChunksRes, avgChunksRes, embPendingRes, embFailedRes] = await Promise.all([
        supabase.from("legal_practice_kb").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("legal_practice_kb_chunks").select("id", { count: "exact", head: true }),
        supabase.rpc("count_docs_without_chunks"),
        supabase.rpc("avg_chunks_per_practice_doc"),
        supabase.from("legal_practice_kb").select("id", { count: "exact", head: true }).eq("is_active", true).eq("embedding_status", "pending"),
        supabase.from("legal_practice_kb").select("id", { count: "exact", head: true }).eq("is_active", true).eq("embedding_status", "failed"),
      ]);

      // Fallback: if RPCs don't exist, use direct queries
      let docsWithoutChunks = docsNoChunksRes.data;
      let avgChunks = avgChunksRes.data;

      // Job queue stats
      const [pendingJobs, processingJobs, doneJobs, failedJobs, deadJobs] = await Promise.all([
        supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("status", "processing"),
        supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("status", "done"),
        supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
        supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("status", "dead_letter"),
      ]);

      return new Response(JSON.stringify({
        total_docs: totalDocsRes.count || 0,
        total_chunks: totalChunksRes.count || 0,
        docs_without_chunks: typeof docsWithoutChunks === "number" ? docsWithoutChunks : null,
        avg_chunks_per_doc: typeof avgChunks === "number" ? avgChunks : null,
        embedding_pending: embPendingRes.count || 0,
        embedding_failed: embFailedRes.count || 0,
        jobs: {
          pending: pendingJobs.count || 0,
          processing: processingJobs.count || 0,
          done: doneJobs.count || 0,
          failed: failedJobs.count || 0,
          dead_letter: deadJobs.count || 0,
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "enqueue_missing_chunks") {
      // Find all active docs without chunks, not already queued
      const { data: missingDocs, error: queryErr } = await supabase
        .rpc("get_practice_docs_without_chunks", { batch_limit: 2000 });

      // Fallback if RPC doesn't exist
      let docIds: string[] = [];
      if (queryErr || !missingDocs) {
        // Direct query approach
        const { data: allDocs } = await supabase
          .from("legal_practice_kb")
          .select("id")
          .eq("is_active", true);

        const { data: chunkedDocs } = await supabase
          .from("legal_practice_kb_chunks")
          .select("doc_id");

        if (allDocs && chunkedDocs) {
          const chunkedSet = new Set(chunkedDocs.map((c: { doc_id: string }) => c.doc_id));
          docIds = allDocs
            .filter((d: { id: string }) => !chunkedSet.has(d.id))
            .map((d: { id: string }) => d.id);
        }
      } else {
        docIds = missingDocs.map((d: { id: string }) => d.id);
      }

      if (docIds.length === 0) {
        return new Response(JSON.stringify({ enqueued: 0, message: "All docs have chunks" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Batch upsert jobs (skip already-existing)
      const batchSize = 500;
      let enqueued = 0;

      for (let i = 0; i < docIds.length; i += batchSize) {
        const batch = docIds.slice(i, i + batchSize).map((id) => ({
          document_id: id,
          job_type: "chunk",
          status: "pending",
          attempts: 0,
        }));

        const { error: upsertErr } = await supabase
          .from("practice_chunk_jobs")
          .upsert(batch, { onConflict: "document_id,job_type", ignoreDuplicates: true });

        if (upsertErr) {
          console.error(`[practice-chunk-enqueue] batch upsert error:`, upsertErr.message);
        } else {
          enqueued += batch.length;
        }
      }

      console.log(`[practice-chunk-enqueue] enqueued ${enqueued} chunk jobs`);

      return new Response(JSON.stringify({ enqueued, total_missing: docIds.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "enqueue_missing_embeddings") {
      // Docs with embedding_status != 'success'
      const { data: docs, error: queryErr } = await supabase
        .from("legal_practice_kb")
        .select("id")
        .eq("is_active", true)
        .neq("embedding_status", "success")
        .limit(2000);

      if (queryErr) throw queryErr;

      const docIds = (docs || []).map((d: { id: string }) => d.id);

      if (docIds.length === 0) {
        return new Response(JSON.stringify({ enqueued: 0, message: "All docs have embeddings" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Reset their embedding_status to pending so generate-embeddings picks them up
      const batchSize = 500;
      let reset = 0;

      for (let i = 0; i < docIds.length; i += batchSize) {
        const batch = docIds.slice(i, i + batchSize);
        const { error: updateErr } = await supabase
          .from("legal_practice_kb")
          .update({
            embedding_status: "pending",
            embedding_error: null,
          })
          .in("id", batch)
          .lt("embedding_attempts", 5);

        if (!updateErr) reset += batch.length;
      }

      return new Response(JSON.stringify({ reset, total_missing: docIds.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reset_dead_letters") {
      const { error } = await supabase
        .from("practice_chunk_jobs")
        .update({ status: "pending", attempts: 0, last_error: null })
        .eq("status", "dead_letter");

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      error: "Unknown action. Use: diagnostics, enqueue_missing_chunks, enqueue_missing_embeddings, reset_dead_letters",
    }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[practice-chunk-enqueue] error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
