import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { handleCors } from "../_shared/edge-security.ts";

interface SearchRequest {
  query: string;
  category?: "criminal" | "civil" | "administrative" | "echr" | null;
  limitDocs?: number;
  limitChunksPerDoc?: number;
}

interface TopChunk {
  chunkIndex: number;
  text: string;
}

interface SearchResultDocument {
  id: string;
  title: string;
  practice_category: string;
  court_type: string;
  outcome: string;
  applied_articles: unknown[];
  key_violations: string[];
  legal_reasoning_summary: string | null;
  decision_map: unknown | null;
  key_paragraphs: unknown[];
  top_chunks: TopChunk[];
  totalChunks: number;
}

serve(async (req) => {
  // Handle CORS
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  try {
    // === AUTH GUARD ===
    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await sb.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // === END AUTH GUARD ===

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: SearchRequest = await req.json();
    const {
      query,
      category = null,
      limitDocs = 5,
      limitChunksPerDoc = 3,
    } = body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // B) category allowlist
    const ALLOWED_CATEGORIES = new Set(["criminal", "civil", "administrative", "echr"]);
    if (category != null && !ALLOWED_CATEGORIES.has(category)) {
      return new Response(
        JSON.stringify({ error: "Invalid category" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // A) limitDocs cap
    const safeLimitDocs = Math.max(1, Math.min(Number(limitDocs) || 5, 20));

    const searchTerm = sanitizeForPostgrest(query.trim().toLowerCase());

    // Build the query
    let dbQuery = supabase
      .from("legal_practice_kb")
      .select(`
        id,
        title,
        practice_category,
        court_type,
        outcome,
        applied_articles,
        key_violations,
        legal_reasoning_summary,
        decision_map,
        key_paragraphs,
        content_chunks,
        content_text
      `)
      .eq("is_active", true)
      .limit(safeLimitDocs);

    // Apply category filter if provided
    if (category) {
      dbQuery = dbQuery.eq("practice_category", category);
    }

    // Search using ilike on indexed/small fields only (content_text is too large for ilike)
    dbQuery = dbQuery.or(
      `title.ilike.%${searchTerm}%,` +
      `legal_reasoning_summary.ilike.%${searchTerm}%`
    );

    const { data: documents, error } = await dbQuery;

    if (error) {
      console.error(JSON.stringify({ ts: new Date().toISOString(), lvl: "error", fn: "kb-search", msg: "DB search failed" }));
      return new Response(
        JSON.stringify({ error: "Database search failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Process documents and compute top chunks
    const results: SearchResultDocument[] = (documents || []).map((doc) => {
      const chunks = doc.content_chunks || [];
      const totalChunks = chunks.length;

      // Find most relevant chunks by keyword scoring
      const topChunks = findRelevantChunks(
        chunks,
        searchTerm,
        doc.key_paragraphs || [],
        limitChunksPerDoc
      );

      // If no chunks available, create a single chunk from content_text
      const finalTopChunks = topChunks.length > 0 ? topChunks : 
        (doc.content_text ? [{ chunkIndex: 0, text: doc.content_text }] : []);
      const finalTotalChunks = totalChunks > 0 ? totalChunks : (doc.content_text ? 1 : 0);

      return {
        id: doc.id,
        title: doc.title,
        practice_category: doc.practice_category,
        court_type: doc.court_type,
        outcome: doc.outcome,
        applied_articles: doc.applied_articles || [],
        key_violations: doc.key_violations || [],
        legal_reasoning_summary: doc.legal_reasoning_summary,
        decision_map: doc.decision_map,
        key_paragraphs: doc.key_paragraphs || [],
        top_chunks: finalTopChunks,
        totalChunks: finalTotalChunks,
      };
    });

    return new Response(
      JSON.stringify({ documents: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), lvl: "error", fn: "kb-search", msg: error instanceof Error ? error.message : "Unknown" }));
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Search failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Find most relevant chunks using keyword scoring
 */
function findRelevantChunks(
  chunks: string[],
  searchTerm: string,
  keyParagraphs: Array<{ tag?: string; chunkIdx?: number }>,
  limit: number
): TopChunk[] {
  if (chunks.length === 0) return [];

  // Score each chunk
  const scored: Array<{ index: number; score: number; text: string }> = [];
  const searchWords = searchTerm.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const lowerChunk = chunk.toLowerCase();
    let score = 0;

    // Keyword matching
    for (const word of searchWords) {
      const matches = (lowerChunk.match(new RegExp(escapeRegex(word), "gi")) || []).length;
      score += matches * 2;
    }

    // Boost for key paragraph chunks
    const isKeyParagraph = keyParagraphs.some(kp => kp.chunkIdx === i);
    if (isKeyParagraph) {
      score += 10;
    }

    // Boost first chunk slightly (often contains introduction)
    if (i === 0) {
      score += 5;
    }

    scored.push({ index: i, score, text: chunk });
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Return top chunks
  return scored.slice(0, limit).map((s) => ({
    chunkIndex: s.index,
    text: s.text, // Return full chunk text
  }));
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Sanitize user input for safe use in PostgREST .or()/.ilike() filters.
 * Strips characters that act as PostgREST operators/delimiters and
 * escapes SQL LIKE wildcards (% and _).
 */
function sanitizeForPostgrest(input: string): string {
  return input
    .replace(/[%_]/g, "")          // remove SQL LIKE wildcards
    .replace(/[(),.*\\]/g, "")     // remove PostgREST metacharacters
    .replace(/\s+/g, " ")         // normalize whitespace
    .trim()
    .substring(0, 200);           // hard length cap
}
