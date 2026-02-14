import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type BackfillBody = {
  docId?: string;
  chunkSize?: number;
  dryRun?: boolean;
  batchLimit?: number; // max docs per invocation (default 5)
};

type KbDoc = {
  id: string;
  title: string | null;
  content_text: string | null;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

// ---- main ----

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

    await requireAdmin(req);

    const body = (await req.json().catch(() => ({}))) as BackfillBody;
    const docId = typeof body.docId === "string" && body.docId.trim() ? body.docId.trim() : undefined;
    const chunkSize = normalizeChunkSize(body.chunkSize);
    const dryRun = body.dryRun === true;
    // Limit docs per invocation to avoid CPU timeout (default 5, max 10)
    const batchLimit = Math.min(Math.max(typeof body.batchLimit === "number" ? body.batchLimit : 5, 1), 10);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) fetch documents
    let docs: KbDoc[] = [];

    if (docId) {
      const { data, error } = await supabase
        .from("legal_practice_kb")
        .select("id,title,content_text")
        .eq("id", docId)
        .limit(1);

      if (error) throw { status: 500, code: "DB_ERROR", message: error.message };
      docs = (data ?? []) as KbDoc[];
      if (docs.length === 0) return json(404, { error: "DOC_NOT_FOUND", docId });
    } else {
      // Get docs that don't have chunks yet, limited to batchLimit
      const { data, error } = await supabase.rpc("kb_docs_without_chunks");

      if (error) {
        // Fallback: 2-step approach
        const { data: allDocs, error: e1 } = await supabase
          .from("legal_practice_kb")
          .select("id,title,content_text")
          .order("updated_at", { ascending: false })
          .limit(500);
        if (e1) throw { status: 500, code: "DB_ERROR", message: e1.message };

        const docList = (allDocs ?? []) as KbDoc[];

        const { data: existing, error: e2 } = await supabase
          .from("legal_practice_kb_chunks")
          .select("doc_id")
          .limit(50000);
        if (e2) throw { status: 500, code: "DB_ERROR", message: e2.message };

        const existingSet = new Set((existing ?? []).map((x: { doc_id: string }) => String(x.doc_id)));
        docs = docList.filter((d) => !existingSet.has(d.id));
      } else {
        docs = (data ?? []) as KbDoc[];
      }
    }

    const totalRemaining = docs.length;
    // Only process batchLimit docs in this invocation
    if (!docId) {
      docs = docs.slice(0, batchLimit);
    }

    // 2) plan chunks
    const plan = [];
    let totalChunks = 0;

    for (const d of docs) {
      const text = (d.content_text ?? "").trim();
      if (!text) {
        plan.push({ docId: d.id, title: d.title, action: "skip_empty_content", chunks: 0 });
        continue;
      }
      const chunks = splitIntoChunks(text, chunkSize, 200);
      totalChunks += chunks.length;
      plan.push({ docId: d.id, title: d.title, action: "create_chunks", chunks: chunks.length });
    }

    if (dryRun) {
      return json(200, {
        dryRun: true,
        docCount: docs.length,
        totalRemaining,
        chunkSize,
        batchLimit,
        plannedTotalChunks: totalChunks,
        plan,
      });
    }

    // 3) write chunks
    const writeResults = [];
    for (const d of docs) {
      const text = (d.content_text ?? "").trim();
      if (!text) {
        writeResults.push({ docId: d.id, status: "skipped_empty" });
        continue;
      }

      const { error: delErr } = await supabase
        .from("legal_practice_kb_chunks")
        .delete()
        .eq("doc_id", d.id);
      if (delErr) throw { status: 500, code: "DB_ERROR", message: delErr.message };

      const chunks = splitIntoChunks(text, chunkSize, 200);

      const rows = chunks.map((c) => ({
        doc_id: d.id,
        chunk_index: c.idx,
        chunk_text: c.text,
        chunk_hash: computeHash(c.text),
        title: d.title,
      }));

      const insertBatchSize = 200;
      for (let i = 0; i < rows.length; i += insertBatchSize) {
        const batch = rows.slice(i, i + insertBatchSize);
        const { error: insErr } = await supabase.from("legal_practice_kb_chunks").insert(batch);
        if (insErr) throw { status: 500, code: "DB_ERROR", message: insErr.message };
      }

      writeResults.push({ docId: d.id, inserted: rows.length, status: "ok" });
    }

    return json(200, {
      dryRun: false,
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
