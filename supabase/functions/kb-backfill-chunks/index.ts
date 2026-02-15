import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { handleCors } from "../_shared/edge-security.ts";
import { chunkDocument, type LegalDocumentInput } from "../_shared/chunker.ts";

type BackfillBody = {
  table?: "legal_practice_kb" | "knowledge_base"; // NEW: which table to backfill
  docId?: string;
  chunkSize?: number;
  dryRun?: boolean;
  batchLimit?: number;
};

type KbDoc = {
  id: string;
  title: string | null;
  content_text: string | null;
  category?: string | null;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;


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

  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
  if (userErr || !userData?.user) {
    throw { status: 401, code: "UNAUTHORIZED", message: "Invalid token" };
  }

  const user = userData.user;
  const role = (user.app_metadata as Record<string, unknown> | undefined)?.role;
  if (role === "admin") return { token, user };

  const { data: isAdmin } = await supabaseAuth.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (isAdmin) return { token, user };

  throw { status: 403, code: "FORBIDDEN", message: "Admin only" };
}

// ── Simple fixed-window splitter (for legal_practice_kb) ────────────

function normalizeChunkSize(n?: number): number {
  const v = typeof n === "number" ? Math.floor(n) : 8000;
  if (!Number.isFinite(v) || v < 500) return 8000;
  if (v > 20000) return 20000;
  return v;
}

function splitIntoChunks(text: string, chunkSize: number, overlap = 200): { idx: number; text: string }[] {
  const t = text.replace(/\r\n/g, "\n");
  const chunks: { idx: number; text: string }[] = [];
  let start = 0;
  let i = 0;

  while (start < t.length) {
    const end = Math.min(start + chunkSize, t.length);
    const slice = t.slice(start, end);
    const chunkText = slice.trim();
    if (chunkText.length > 0) chunks.push({ idx: i++, text: chunkText });
    if (end === t.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

function computeHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

// ── Map KB category to doc_type for the shared chunker ──────────────

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
  echr: "court_decision",
};

function categoryToDocType(category: string | null | undefined): string {
  if (!category) return "law";
  return CATEGORY_TO_DOC_TYPE[category] || "law";
}

// ── Main handler ────────────────────────────────────────────────────

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  try {
    if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

    await requireAdmin(req);

    const body = (await req.json().catch(() => ({}))) as BackfillBody;
    const table = body.table || "legal_practice_kb";
    const docId = typeof body.docId === "string" && body.docId.trim() ? body.docId.trim() : undefined;
    const chunkSize = normalizeChunkSize(body.chunkSize);
    const dryRun = body.dryRun === true;
    const batchLimit = Math.min(Math.max(typeof body.batchLimit === "number" ? body.batchLimit : 5, 1), 10);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Determine source and target tables
    const isKB = table === "knowledge_base";
    const sourceTable = isKB ? "knowledge_base" : "legal_practice_kb";
    const chunksTable = isKB ? "knowledge_base_chunks" : "legal_practice_kb_chunks";
    const fkColumn = isKB ? "kb_id" : "doc_id";

    // 1) Fetch documents
    let docs: KbDoc[] = [];

    if (docId) {
      const selectCols = isKB
        ? "id,title,content_text,category"
        : "id,title,content_text";
      const { data, error } = await supabase
        .from(sourceTable)
        .select(selectCols)
        .eq("id", docId)
        .limit(1);

      if (error) throw { status: 500, code: "DB_ERROR", message: error.message };
      docs = (data ?? []) as KbDoc[];
      if (docs.length === 0) return json(404, { error: "DOC_NOT_FOUND", docId });
    } else {
      // Get only IDs of docs that already have chunks (lightweight query)
      const { data: existing, error: e2 } = await supabase
        .from(chunksTable)
        .select(fkColumn)
        .limit(1000);
      if (e2) throw { status: 500, code: "DB_ERROR", message: e2.message };

      const existingSet = new Set(
        (existing ?? []).map((x: Record<string, string>) => String(x[fkColumn]))
      );
      const existingIds = [...existingSet];

      // Fetch a small batch of active docs excluding already-chunked ones
      const selectCols = isKB
        ? "id,title,content_text,category"
        : "id,title,content_text";

      let query = supabase
        .from(sourceTable)
        .select(selectCols)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(batchLimit);

      // Exclude docs that already have chunks
      if (existingIds.length > 0) {
        query = query.not("id", "in", `(${existingIds.join(",")})`);
      }

      const { data: allDocs, error: e1 } = await query;
      if (e1) throw { status: 500, code: "DB_ERROR", message: e1.message };

      docs = (allDocs ?? []) as KbDoc[];
    }

    const totalRemaining = docs.length;

    // 2) Plan chunks
    const plan = [];
    let totalChunks = 0;

    for (const d of docs) {
      const text = (d.content_text ?? "").trim();
      if (!text) {
        plan.push({ docId: d.id, title: d.title, action: "skip_empty_content", chunks: 0 });
        continue;
      }

      if (isKB) {
        // Use smart chunker for knowledge_base
        const docType = categoryToDocType(d.category);
        const input: LegalDocumentInput = {
          doc_type: docType,
          content_text: text,
          title: d.title ?? undefined,
        };
        const result = chunkDocument(input);
        totalChunks += result.chunks.length;
        plan.push({
          docId: d.id,
          title: d.title,
          action: "create_chunks",
          chunks: result.chunks.length,
          strategy: result.strategy,
        });
      } else {
        const chunks = splitIntoChunks(text, chunkSize, 200);
        totalChunks += chunks.length;
        plan.push({ docId: d.id, title: d.title, action: "create_chunks", chunks: chunks.length });
      }
    }

    if (dryRun) {
      return json(200, {
        dryRun: true,
        table,
        docCount: docs.length,
        totalRemaining,
        chunkSize,
        batchLimit,
        plannedTotalChunks: totalChunks,
        plan,
      });
    }

    // 3) Write chunks
    const writeResults = [];
    for (const d of docs) {
      const text = (d.content_text ?? "").trim();
      if (!text) {
        writeResults.push({ docId: d.id, status: "skipped_empty" });
        continue;
      }

      // Delete existing chunks for this doc (idempotent re-run)
      const { error: delErr } = await supabase
        .from(chunksTable)
        .delete()
        .eq(fkColumn, d.id);
      if (delErr) throw { status: 500, code: "DB_ERROR", message: delErr.message };

      let rows: Record<string, unknown>[];

      if (isKB) {
        // Smart chunking for knowledge_base
        const docType = categoryToDocType(d.category);
        const input: LegalDocumentInput = {
          doc_type: docType,
          content_text: text,
          title: d.title ?? undefined,
        };
        const result = chunkDocument(input);

        rows = result.chunks.map((c) => ({
          kb_id: d.id,
          chunk_index: c.chunk_index,
          chunk_type: c.chunk_type,
          chunk_text: c.chunk_text,
          label: c.label,
          char_start: c.char_start,
          char_end: c.char_end,
          chunk_hash: c.chunk_hash,
        }));
      } else {
        const chunks = splitIntoChunks(text, chunkSize, 200);
        rows = chunks.map((c) => ({
          doc_id: d.id,
          chunk_index: c.idx,
          chunk_text: c.text,
          chunk_hash: computeHash(c.text),
          title: d.title,
        }));
      }

      // Insert in batches of 200
      const insertBatchSize = 200;
      for (let i = 0; i < rows.length; i += insertBatchSize) {
        const batch = rows.slice(i, i + insertBatchSize);
        const { error: insErr } = await supabase.from(chunksTable).insert(batch);
        if (insErr) throw { status: 500, code: "DB_ERROR", message: insErr.message };
      }

      writeResults.push({ docId: d.id, inserted: rows.length, status: "ok" });
    }

    return json(200, {
      dryRun: false,
      table,
      processedDocs: docs.length,
      totalRemaining: totalRemaining - docs.length,
      chunkSize,
      batchLimit,
      totalChunksInserted: writeResults.reduce((s, r: { inserted?: number }) => s + (r.inserted ?? 0), 0),
      results: writeResults,
      hint: totalRemaining > docs.length
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
