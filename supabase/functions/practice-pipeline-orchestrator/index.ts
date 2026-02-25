/**
 * practice-pipeline-orchestrator
 * 
 * Cron-triggered (every minute) orchestrator that drives the full pipeline:
 *   1. Chunking  → practice-chunk-worker
 *   2. Embedding → practice-embed-worker
 *   3. Enrichment → practice-ai-enrich-worker
 * 
 * Priority: chunk > embed > enrich (only one stage per invocation).
 * Auth: x-internal-key (INTERNAL_INGEST_KEY or CRON_WORKER_KEY).
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

  // Auth: accept x-internal-key (INTERNAL_INGEST_KEY or CRON_WORKER_KEY)
  const internalKey = req.headers.get("x-internal-key");
  const expectedKey = Deno.env.get("INTERNAL_INGEST_KEY");
  const cronKey = Deno.env.get("CRON_WORKER_KEY");
  const isInternalAuth = internalKey && (
    (expectedKey && internalKey === expectedKey) ||
    (cronKey && internalKey === cronKey)
  );

  if (!isInternalAuth) {
    // Also accept Bearer token as fallback
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Count pending jobs by type
    const [chunkRes, embedRes, enrichRes] = await Promise.all([
      supabase
        .from("practice_chunk_jobs")
        .select("id", { count: "exact", head: true })
        .eq("job_type", "chunk")
        .in("status", ["pending", "failed"])
        .lt("attempts", 5)
        .lte("next_run_at", new Date().toISOString()),
      supabase
        .from("practice_chunk_jobs")
        .select("id", { count: "exact", head: true })
        .eq("job_type", "embed")
        .in("status", ["pending", "failed"])
        .lt("attempts", 5)
        .lte("next_run_at", new Date().toISOString()),
      supabase
        .from("practice_chunk_jobs")
        .select("id", { count: "exact", head: true })
        .eq("job_type", "enrich")
        .in("status", ["pending", "failed"])
        .lt("attempts", 5)
        .lte("next_run_at", new Date().toISOString()),
    ]);

    // Also count stale processing jobs (lease expired)
    const now = new Date().toISOString();
    const [chunkStale, embedStale, enrichStale] = await Promise.all([
      supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true })
        .eq("job_type", "chunk").eq("status", "processing").lt("lease_expires_at", now),
      supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true })
        .eq("job_type", "embed").eq("status", "processing").lt("lease_expires_at", now),
      supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true })
        .eq("job_type", "enrich").eq("status", "processing").lt("lease_expires_at", now),
    ]);

    const chunkPending = (chunkRes.count || 0) + (chunkStale.count || 0);
    const embedPending = (embedRes.count || 0) + (embedStale.count || 0);
    const enrichPending = (enrichRes.count || 0) + (enrichStale.count || 0);

    let stageTriggered = "idle";
    let workerResponse: Record<string, unknown> | null = null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const internalKey = Deno.env.get("INTERNAL_INGEST_KEY")!;

    const callWorker = async (functionName: string): Promise<Record<string, unknown>> => {
      const url = `${supabaseUrl}/functions/v1/${functionName}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": internalKey,
        },
        body: JSON.stringify({ concurrency_docs: 25 }),
      });
      const data = await res.json().catch(() => ({ status: res.status }));
      return data;
    };

    // Priority dispatch
    if (chunkPending > 0) {
      stageTriggered = "chunk";
      workerResponse = await callWorker("practice-chunk-worker");
    } else if (embedPending > 0) {
      stageTriggered = "embed";
      workerResponse = await callWorker("practice-embed-worker");
    } else if (enrichPending > 0) {
      stageTriggered = "enrich";
      workerResponse = await callWorker("practice-ai-enrich-worker");
    }

    const duration = Date.now() - startTime;
    console.log(
      `[pipeline-orchestrator] chunk=${chunkPending} embed=${embedPending} enrich=${enrichPending} stage=${stageTriggered} duration=${duration}ms`,
    );

    return new Response(JSON.stringify({
      chunk_pending: chunkPending,
      embed_pending: embedPending,
      enrich_pending: enrichPending,
      stage_triggered: stageTriggered,
      worker_result: workerResponse,
      duration_ms: duration,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[pipeline-orchestrator] error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
