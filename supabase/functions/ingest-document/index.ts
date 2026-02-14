/**
 * ingest-document
 *
 * Orchestrator edge function that:
 * 1) Parses & normalizes raw text via shared ingestion service
 * 2) Inserts canonical record into public.legal_documents (dedup by source_hash)
 * 3) Chunks via shared ingestion service
 * 4) Inserts chunks into public.legal_chunks with doc_id FK
 *
 * Auth: requires x-internal-key header (fail-closed)
 * Input: { fileName, mimeType, rawText, sourceUrl? }
 * Output: { document_id, chunks_inserted, deduplicated }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { handleCors, checkInternalAuth, checkInputSize } from "../_shared/edge-security.ts";
import {
  normalizeText,
  chunkDoc,
  type LegalDocument,
} from "../_shared/ingestion-service.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  const authErr = checkInternalAuth(req, corsHeaders);
  if (authErr) return authErr;

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const body = await req.json();
    const { fileName, mimeType, rawText, sourceUrl, dedupMode } = body;
    // dedupMode: "skip" (default) | "upsert"
    const dedup: "skip" | "upsert" = dedupMode === "upsert" ? "upsert" : "skip";

    // ── Validate input ──────────────────────────────────────────
    if (!fileName || typeof fileName !== "string") {
      return json({ error: "fileName is required (string)" }, 400);
    }
    if (!rawText || typeof rawText !== "string" || rawText.length === 0) {
      return json({ error: "rawText is required (non-empty string)" }, 400);
    }

    const sizeErr = checkInputSize(rawText, corsHeaders);
    if (sizeErr) return sizeErr;

    // ── Step 1: Normalize via ingestion service ─────────────────
    const { document, validationErrors } = await normalizeText(rawText, {
      fileName,
      mimeType: mimeType || "text/plain",
      sourceUrl,
    });

    if (validationErrors.length > 0) {
      return json({ error: "Validation failed", details: validationErrors }, 422);
    }

    // ── Step 2: Insert into legal_documents (dedup by hash) ─────
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const sourceHash = document.ingestion.source_hash;

    // Check dedup by source_hash
    if (sourceHash) {
      const { data: existing } = await supabase
        .from("legal_documents")
        .select("id")
        .eq("source_hash", sourceHash)
        .maybeSingle();

      if (existing) {
        if (dedup === "skip") {
          return json({
            document_id: existing.id,
            chunks_inserted: 0,
            deduplicated: true,
          }, 200);
        }
        // upsert: delete old doc+chunks (CASCADE), then re-insert below
        await supabase.from("legal_documents").delete().eq("id", existing.id);
      }
    }

    const { data: docRow, error: docErr } = await supabase
      .from("legal_documents")
      .insert(buildDocRow(document, sourceHash))
      .select("id")
      .single();

    if (docErr) {
      console.error(JSON.stringify({ ts: new Date().toISOString(), lvl: "error", fn: "ingest-document", msg: docErr.message }));
      await supabase.rpc("log_error", {
        _error_type: "ingest",
        _error_message: `Failed to insert document: ${docErr.message}`,
        _error_details: JSON.stringify({ fileName, sourceHash }),
      }).catch(() => {});
      return json({ error: "Failed to insert document", details: docErr.message }, 500);
    }

    const docId = docRow.id;

    // ── Step 3: Chunk via ingestion service ──────────────────────
    const chunks = chunkDoc(document);

    if (chunks.length === 0) {
      return json({ document_id: docId, chunks_inserted: 0, deduplicated: false }, 200);
    }

    // ── Step 4: Insert chunks ───────────────────────────────────
    const chunkRows = chunks.map((c) => ({
      doc_id: docId,
      doc_type: document.doc_type,
      chunk_index: c.chunk_index,
      chunk_type: c.chunk_type,
      chunk_text: c.chunk_text,
      char_start: c.char_start,
      char_end: c.char_end,
      label: c.label,
      metadata: c.locator ? { locator: c.locator } : {},
      chunk_hash: c.chunk_hash,
      norm_refs: [],
      is_active: true,
    }));

    // Insert in batches of 200
    const BATCH_SIZE = 200;
    let totalInserted = 0;

    for (let i = 0; i < chunkRows.length; i += BATCH_SIZE) {
      const batch = chunkRows.slice(i, i + BATCH_SIZE);
      const { error: chunkErr } = await supabase
        .from("legal_chunks")
        .insert(batch);

      if (chunkErr) {
        console.error(JSON.stringify({ ts: new Date().toISOString(), lvl: "error", fn: "ingest-document", msg: chunkErr.message, batch: i }));
        await supabase.rpc("log_error", {
          _error_type: "ingest",
          _error_message: `Failed to insert chunks (batch ${i}): ${chunkErr.message}`,
          _error_details: JSON.stringify({ fileName, docId, batchIndex: i }),
        }).catch(() => {});
        // Cleanup: delete the document (CASCADE removes partial chunks)
        await supabase.from("legal_documents").delete().eq("id", docId);
        return json({
          error: "Failed to insert chunks",
          details: chunkErr.message,
        }, 500);
      }
      totalInserted += batch.length;
    }

    // ── Step 5: Trigger table screenshot processing (async, non-blocking) ──
    const hasTableChunks = chunkRows.some(c => c.chunk_type === "table");
    if (hasTableChunks) {
      const internalKey = Deno.env.get("INTERNAL_API_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      fetch(`${supabaseUrl}/functions/v1/kb-table-screenshots`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": internalKey,
        },
        body: JSON.stringify({ docId }),
      }).catch((e) => {
        console.error("Failed to trigger table screenshots:", e);
      });
    }

    return json({
      document_id: docId,
      chunks_inserted: totalInserted,
      deduplicated: false,
      table_processing: hasTableChunks ? "triggered" : "none",
    }, 200);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown";
    console.error(JSON.stringify({ ts: new Date().toISOString(), lvl: "error", fn: "ingest-document", msg }));
    // Best-effort log to error_logs table
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, serviceKey);
      await sb.rpc("log_error", {
        _error_type: "ingest",
        _error_message: `ingest-document exception: ${msg}`,
      });
    } catch (_) { /* ignore */ }
    return json({
      error: msg,
    }, 500);
  }
});

// ── Helper: build DB row from LegalDocument ─────────────────────────

function buildDocRow(document: LegalDocument, sourceHash: string | null) {
  return {
    doc_type: document.doc_type,
    jurisdiction: document.jurisdiction,
    branch: document.branch,
    title: document.title,
    title_alt: document.title_alt,
    content_text: document.content_text,
    document_number: document.document_number,
    date_adopted: document.date_adopted,
    date_effective: document.date_effective,
    source_url: document.source_url,
    source_name: document.source_name,
    source_hash: sourceHash,
    court_meta: document.court ?? {},
    applied_articles: document.applied_articles ?? [],
    key_violations: document.key_violations,
    legal_reasoning_summary: document.legal_reasoning_summary,
    decision_map: document.decision_map ?? {},
    ingestion_meta: document.ingestion,
    is_active: document.is_active,
  };
}
