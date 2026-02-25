/**
 * kb-backfill-chunks — v4 (enterprise-hardened)
 *
 * Changes from v3:
 * 1. Uses chunker v2.2.0: SHA-256 hashes, no table chunks, strict slice invariant.
 * 2. Renamed resolveDocType → resolveDocTypeFromRow (no collision with chunker export).
 * 3. DELETE-ALL-then-INSERT: proven UNIQUE constraints on both tables.
 * 4. legal_practice_kb_chunks: NO chunk_type, char_start, char_end columns (proven).
 * 5. Strict admin JWT validation via getClaims.
 * 6. N+1 eliminated: batch check for existing chunks.
 * 7. No trimming of content before chunkDocument (except "is empty" check).
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  chunkDocument,
  validateChunks,
  CHUNKER_VERSION,
  type LegalDocumentInput,
  type LegalChunk,
} from "../_shared/chunker.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type BackfillBody = {
  table?: "legal_practice_kb" | "knowledge_base";
  docId?: string;
  docIds?: string[];
  chunkSize?: number;
  dryRun?: boolean;
  batchLimit?: number;
};

type KbDoc = {
  id: string;
  title: string | null;
  content_text: string | null;
  category?: string | null;
  court_type?: string | null;
  case_number_anonymized?: string | null;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const INSERT_BATCH_SIZE = 200;

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

async function requireAdmin(req: Request) {
  const token = getBearerToken(req);
  if (!token) throw { status: 401, code: "UNAUTHORIZED", message: "Missing Bearer token" };

  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: claimsData, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims) {
    throw { status: 401, code: "UNAUTHORIZED", message: "Invalid token" };
  }

  const userId = claimsData.claims.sub as string;
  const role = (claimsData.claims.app_metadata as Record<string, unknown> | undefined)?.role;
  if (role === "admin") return { token, userId };

  const { data: isAdmin } = await supabaseAuth.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin) return { token, userId };

  throw { status: 403, code: "FORBIDDEN", message: "Admin only" };
}

// ─── Row-based doc type resolver (NOT text inference) ──────────────

const CATEGORY_TO_DOC_TYPE: Record<string, string> = {
  constitution: "law",
  civil_code: "code",
  criminal_code: "code",
  labor_code: "code",
  family_code: "code",
  administrative_code: "code",
  tax_code: "code",
  criminal_procedure_code: "code",
  civil_procedure_code: "code",
  administrative_procedure_code: "code",
  administrative_violations_code: "code",
  land_code: "code",
  forest_code: "code",
  water_code: "code",
  urban_planning_code: "code",
  electoral_code: "code",
  eaeu_customs_code: "code",
  court_practice: "court_decision",
  echr: "echr_judgment",
  echr_judgments: "echr_judgment",
};

function resolveDocTypeFromRow(doc: KbDoc, isKB: boolean): string {
  if (isKB) {
    const cat = doc.category ?? "";
    return CATEGORY_TO_DOC_TYPE[cat] || "law";
  }
  const ct = doc.court_type;
  if (ct === "echr") return "echr_judgment";
  if (ct === "cassation") return "cassation_ruling";
  if (ct === "appeal") return "appeal_ruling";
  if (ct === "first_instance") return "first_instance_ruling";
  if (ct === "constitutional") return "constitutional_court";
  return "court_decision";
}

// ─── Chunk a single document (shared logic for dryRun & write) ─────

interface ChunkPlan {
  chunks: LegalChunk[];
  strategy: string;
  qaOk: boolean;
  qaErrors: string[];
}

function chunkDoc(doc: KbDoc, isKB: boolean): ChunkPlan {
  const text = doc.content_text ?? "";
  // Only skip if truly empty — do NOT trim before passing to chunker
  if (text.length < 50) {
    return { chunks: [], strategy: "skip", qaOk: true, qaErrors: [] };
  }

  const docType = resolveDocTypeFromRow(doc, isKB);
  const input: LegalDocumentInput = {
    doc_type: docType,
    content_text: text,
    title: doc.title ?? undefined,
    case_number: doc.case_number_anonymized ?? undefined,
  };

  const result = chunkDocument(input);
  const qa = validateChunks(text, result.chunks);

  return {
    chunks: result.chunks,
    strategy: result.strategy,
    qaOk: qa.ok,
    qaErrors: qa.errors,
  };
}

// ─── Main handler ──────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

    await requireAdmin(req);

    const body = (await req.json().catch(() => ({}))) as BackfillBody;
    const table = body.table || "legal_practice_kb";
    const docId = typeof body.docId === "string" && body.docId.trim() ? body.docId.trim() : undefined;
    const docIds = Array.isArray(body.docIds) ? body.docIds.filter((x) => typeof x === "string" && x.trim()) : [];
    const dryRun = body.dryRun === true;
    const batchLimit = Math.min(Math.max(typeof body.batchLimit === "number" ? body.batchLimit : 5, 1), 100);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const isKB = table === "knowledge_base";
    const sourceTable = isKB ? "knowledge_base" : "legal_practice_kb";
    const chunksTable = isKB ? "knowledge_base_chunks" : "legal_practice_kb_chunks";
    const fkColumn = isKB ? "kb_id" : "doc_id";
    const selectCols = isKB
      ? "id,title,content_text,category"
      : "id,title,content_text,court_type,case_number_anonymized";

    // ── 1. Fetch documents ─────────────────────────────────────────
    let docs: KbDoc[] = [];

    if (docId) {
      const { data, error } = await supabase
        .from(sourceTable)
        .select(selectCols)
        .eq("id", docId)
        .limit(1);
      if (error) throw { status: 500, code: "DB_ERROR", message: error.message };
      docs = (data ?? []) as KbDoc[];
      if (docs.length === 0) return json(404, { error: "DOC_NOT_FOUND", docId });
    } else if (docIds.length > 0) {
      const batch = docIds.slice(0, batchLimit);
      const { data, error } = await supabase
        .from(sourceTable)
        .select(selectCols)
        .in("id", batch);
      if (error) throw { status: 500, code: "DB_ERROR", message: error.message };
      docs = (data ?? []) as KbDoc[];
    } else {
      // Auto-discover: docs without chunks — batch query (no N+1)
      const { data: candidates, error: e1 } = await supabase
        .from(sourceTable)
        .select(selectCols)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(batchLimit * 4);
      if (e1) throw { status: 500, code: "DB_ERROR", message: e1.message };

      const allCandidates = (candidates ?? []) as KbDoc[];

      if (allCandidates.length > 0) {
        const candidateIds = allCandidates.map(d => d.id);
        const { data: existingChunks, error: chunkErr } = await supabase
          .from(chunksTable)
          .select(fkColumn)
          .in(fkColumn, candidateIds);

        if (chunkErr) throw { status: 500, code: "DB_ERROR", message: chunkErr.message };

        const docsWithChunks = new Set<string>();
        for (const row of (existingChunks ?? [])) {
          docsWithChunks.add((row as Record<string, string>)[fkColumn]);
        }

        const pending: KbDoc[] = [];
        for (const doc of allCandidates) {
          if (pending.length >= batchLimit) break;
          if (!docsWithChunks.has(doc.id)) pending.push(doc);
        }
        docs = pending;
      }
    }

    // ── 2. Count totalRemaining ────────────────────────────────────
    let totalRemaining = docs.length;
    if (!docId && docIds.length === 0) {
      const { count: totalActive } = await supabase
        .from(sourceTable)
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);

      const { data: chunkDocs } = await supabase
        .from(chunksTable)
        .select(fkColumn)
        .limit(50000);

      const docsWithChunks = new Set<string>();
      if (chunkDocs) {
        for (const row of chunkDocs) {
          docsWithChunks.add((row as Record<string, string>)[fkColumn]);
        }
      }
      totalRemaining = Math.max(0, (totalActive ?? 0) - docsWithChunks.size);
    }

    // ── 3. Plan: chunk every document via structural chunker ───────
    const plan: Array<{
      docId: string;
      title: string | null;
      action: string;
      chunks: number;
      strategy?: string;
      qaOk?: boolean;
      qaErrors?: string[];
    }> = [];
    let totalChunks = 0;

    for (const d of docs) {
      const text = d.content_text ?? "";
      if (text.length < 50) {
        plan.push({ docId: d.id, title: d.title, action: "skip_empty_content", chunks: 0 });
        continue;
      }

      const cp = chunkDoc(d, isKB);
      totalChunks += cp.chunks.length;
      plan.push({
        docId: d.id,
        title: d.title,
        action: cp.qaOk ? "create_chunks" : "qa_failed",
        chunks: cp.chunks.length,
        strategy: cp.strategy,
        qaOk: cp.qaOk,
        qaErrors: cp.qaErrors.length > 0 ? cp.qaErrors.slice(0, 5) : undefined,
      });
    }

    // ── 4. Dry-run response ────────────────────────────────────────
    if (dryRun) {
      return json(200, {
        dryRun: true,
        table,
        docCount: docs.length,
        totalRemaining,
        batchLimit,
        plannedTotalChunks: totalChunks,
        chunkerVersion: CHUNKER_VERSION,
        plan,
      });
    }

    // ── 5. Write chunks ────────────────────────────────────────────
    const writeResults: Array<{
      docId: string;
      inserted?: number;
      status: string;
      qaErrors?: string[];
    }> = [];

    for (const d of docs) {
      const text = d.content_text ?? "";
      if (text.length < 50) {
        writeResults.push({ docId: d.id, status: "skipped_empty" });
        continue;
      }

      const cp = chunkDoc(d, isKB);

      // QA GATE: skip mutation if validation fails
      if (!cp.qaOk) {
        console.warn(
          `[kb-backfill] QA FAILED doc=${d.id} errors=${cp.qaErrors.slice(0, 3).join("; ")}`,
        );
        writeResults.push({
          docId: d.id,
          status: "qa_failed",
          qaErrors: cp.qaErrors.slice(0, 5),
        });
        continue;
      }

      if (cp.chunks.length === 0) {
        writeResults.push({ docId: d.id, status: "skipped_no_chunks" });
        continue;
      }

      // DELETE ALL existing chunks for this document first
      const { error: delErr } = await supabase
        .from(chunksTable)
        .delete()
        .eq(fkColumn, d.id);

      if (delErr) {
        console.warn(`[kb-backfill] delete error for ${d.id}: ${delErr.message}`);
        writeResults.push({ docId: d.id, status: "delete_failed" });
        continue;
      }

      // Build rows — schema-aware mapping
      let rows: Record<string, unknown>[];

      if (isKB) {
        // knowledge_base_chunks: has chunk_type, char_start, char_end, label, is_active
        rows = cp.chunks.map((c) => ({
          kb_id: d.id,
          chunk_index: c.chunk_index,
          chunk_type: c.chunk_type,
          chunk_text: c.chunk_text,
          label: c.label,
          char_start: c.char_start,
          char_end: c.char_end,
          chunk_hash: c.chunk_hash,
          is_active: true,
        }));
      } else {
        // legal_practice_kb_chunks — PROVEN schema:
        // id, doc_id, chunk_index, chunk_text, chunk_hash, title, created_at
        // NO chunk_type, NO char_start, NO char_end, NO is_active
        rows = cp.chunks.map((c) => ({
          doc_id: d.id,
          chunk_index: c.chunk_index,
          chunk_text: c.chunk_text,
          chunk_hash: c.chunk_hash,
          title: c.label,
        }));
      }

      // INSERT new chunks in batches
      let insertedCount = 0;
      for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
        const batch = rows.slice(i, i + INSERT_BATCH_SIZE);
        const { error: insErr } = await supabase.from(chunksTable).insert(batch);
        if (insErr) {
          console.error(`[kb-backfill] insert error for ${d.id} batch ${i}: ${insErr.message}`);
          writeResults.push({ docId: d.id, status: "insert_failed", inserted: insertedCount });
          break;
        }
        insertedCount += batch.length;
      }

      if (insertedCount === rows.length) {
        writeResults.push({ docId: d.id, inserted: rows.length, status: "ok" });
      }
    }

    const insertedTotal = writeResults.reduce(
      (s, r) => s + (r.inserted ?? 0), 0,
    );
    const processedOk = writeResults.filter((r) => r.status === "ok").length;

    return json(200, {
      dryRun: false,
      table,
      processedDocs: docs.length,
      processedOk,
      totalRemaining: Math.max(0, totalRemaining - processedOk),
      batchLimit,
      totalChunksInserted: insertedTotal,
      chunkerVersion: CHUNKER_VERSION,
      results: writeResults,
      hint: totalRemaining > processedOk
        ? "More documents remain. Call again to process the next batch."
        : "All documents processed.",
    });
  } catch (e) {
    const edgeErr = e as { status?: number; code?: string; message?: string } | undefined;
    const status = typeof edgeErr?.status === "number" ? edgeErr.status : 500;
    return json(status, {
      error: edgeErr?.code ?? "INTERNAL_ERROR",
      message: edgeErr?.message ?? String(e),
    });
  }
});
