import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Normalize whitespace and split content into chunks.
 */
function buildChunksForDocument(
  contentText: string,
  chunkSize: number = 8000
): { chunks: string[]; meta: Array<{ idx: number; start: number; end: number }> } {
  // Normalize whitespace
  const normalized = contentText.replace(/\s+/g, " ").trim();
  
  const chunks: string[] = [];
  const meta: Array<{ idx: number; start: number; end: number }> = [];

  let start = 0;
  let idx = 0;

  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    const slice = normalized.slice(start, end);

    chunks.push(slice);
    meta.push({ idx, start, end });

    idx++;
    start = end;
  }

  return { chunks, meta };
}

/**
 * Admin-only endpoint to backfill chunks for legal_practice_kb documents.
 * POST /kb-backfill-chunks
 * Body: { docId?: string, chunkSize?: number, dryRun?: boolean }
 * - docId: specific document to process (if omitted, processes all without chunks)
 * - chunkSize: characters per chunk (default 8000)
 * - dryRun: if true, returns what would be done without writing
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify admin authorization
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is admin
    const { data: roles } = await supabase.rpc("get_user_roles", { _user_id: user.id });
    const isAdmin = roles?.includes("admin");
    
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { docId, chunkSize = 8000, dryRun = false } = body;

    // Build query to find documents needing chunking
    let query = supabase
      .from("legal_practice_kb")
      .select("id, title, content_text, content_chunks")
      .eq("is_active", true);

    if (docId) {
      query = query.eq("id", docId);
    } else {
      // Find documents without chunks or with empty chunks
      query = query.or("content_chunks.is.null,content_chunks.eq.{}");
    }

    const { data: docs, error: fetchError } = await query.limit(100);

    if (fetchError) {
      throw new Error(`Failed to fetch documents: ${fetchError.message}`);
    }

    const results: Array<{
      id: string;
      title: string;
      chunksCreated: number;
      status: string;
    }> = [];

    for (const doc of docs || []) {
      if (!doc.content_text || doc.content_text.trim().length === 0) {
        results.push({
          id: doc.id,
          title: doc.title,
          chunksCreated: 0,
          status: "skipped_no_content",
        });
        continue;
      }

      const { chunks, meta } = buildChunksForDocument(doc.content_text, chunkSize);

      if (dryRun) {
        results.push({
          id: doc.id,
          title: doc.title,
          chunksCreated: chunks.length,
          status: "dry_run",
        });
      } else {
        const { error: updateError } = await supabase
          .from("legal_practice_kb")
          .update({
            content_chunks: chunks,
            chunk_index_meta: meta,
          })
          .eq("id", doc.id);

        if (updateError) {
          results.push({
            id: doc.id,
            title: doc.title,
            chunksCreated: 0,
            status: `error: ${updateError.message}`,
          });
        } else {
          results.push({
            id: doc.id,
            title: doc.title,
            chunksCreated: chunks.length,
            status: "success",
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        processed: results.length,
        dryRun,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("KB backfill error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Backfill failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
