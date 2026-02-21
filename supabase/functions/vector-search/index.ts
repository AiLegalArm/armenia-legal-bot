import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { log, err } from "../_shared/safe-logger.ts";
import { handleCors, checkInternalAuth } from "../_shared/edge-security.ts";

/**
 * Hybrid search: keyword (ILIKE + RPC) → AI reranking via Gemini Flash.
 * Drop-in replacement for the old embedding-based vector-search.
 * Returns the same { kb: [...], practice: [...] } shape.
 */
serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  const authErr = checkInternalAuth(req, corsHeaders);
  if (authErr) return authErr;

  try {
    const { query, tables = "both", category, limit = 10, threshold: _threshold, reference_date } = await req.json();

    if (!query || typeof query !== "string") {
      return new Response(
        JSON.stringify({ error: "Query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 30);
    // Fetch more candidates for reranking (3x the desired limit)
    const candidateLimit = Math.min(safeLimit * 3, 50);

    const results: { kb: unknown[]; practice: unknown[] } = { kb: [], practice: [] };

    // --- Knowledge Base search ---
    if (tables === "kb" || tables === "both") {
      const candidates = await keywordSearchKB(supabase, query, candidateLimit, reference_date || null);
      if (candidates.length > 0) {
        results.kb = await rerankWithAI(query, candidates, safeLimit, LOVABLE_API_KEY);
      }
    }

    // --- Legal Practice search ---
    if (tables === "practice" || tables === "both") {
      const candidates = await keywordSearchPractice(supabase, query, candidateLimit, category || null);
      if (candidates.length > 0) {
        results.practice = await rerankWithAI(query, candidates, safeLimit, LOVABLE_API_KEY);
      }
    }

    log("vector-search", "Search complete", { kb: results.kb.length, practice: results.practice.length });

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    err("vector-search", "Search error", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── Keyword search helpers ──────────────────────────────────────────────────

async function keywordSearchKB(
  supabase: ReturnType<typeof createClient>,
  query: string,
  limit: number,
  referenceDate: string | null = null
): Promise<Array<{ id: string; title: string; content_text: string; similarity?: number }>> {
  const results = new Map<string, { id: string; title: string; content_text: string; similarity: number }>();

  // Build RPC params with optional temporal filter
  const rpcParams: Record<string, unknown> = { search_query: query, result_limit: limit };
  if (referenceDate) rpcParams.reference_date = referenceDate;

  // 1. Try RPC with full query (date-aware)
  const { data: rpcData } = await supabase.rpc("search_knowledge_base", rpcParams);
  for (const r of rpcData || []) {
    results.set(r.id, {
      id: r.id, title: r.title,
      content_text: (r.content_text || "").substring(0, 2000),
      similarity: r.rank || 0,
    });
  }

  // 2. Also try individual words (handles cross-language queries)
  const words = query.split(/\s+/).filter(w => w.length >= 2);
  for (const word of words.slice(0, 5)) {
    if (results.size >= limit) break;
    const wordParams: Record<string, unknown> = { search_query: word, result_limit: Math.min(10, limit) };
    if (referenceDate) wordParams.reference_date = referenceDate;
    const { data: wordData } = await supabase.rpc("search_knowledge_base", wordParams);
    for (const r of wordData || []) {
      if (!results.has(r.id)) {
        results.set(r.id, {
          id: r.id, title: r.title,
          content_text: (r.content_text || "").substring(0, 2000),
          similarity: (r.rank || 0) * 0.8, // slightly lower weight for single-word matches
        });
      }
    }
  }

  // 3. Fallback: ILIKE on title with individual words
  if (results.size === 0) {
    for (const word of words.slice(0, 3)) {
      const searchTerm = sanitize(word);
      if (searchTerm.length < 2) continue;
      const { data } = await supabase
        .from("knowledge_base")
        .select("id, title, content_text")
        .eq("is_active", true)
        .ilike("title", `%${searchTerm}%`)
        .limit(Math.min(10, limit));

      for (const r of data || []) {
        if (!results.has(r.id)) {
          results.set(r.id, {
            id: r.id, title: r.title,
            content_text: (r.content_text || "").substring(0, 2000),
            similarity: 0.3,
          });
        }
      }
    }
  }

  return Array.from(results.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

async function keywordSearchPractice(
  supabase: ReturnType<typeof createClient>,
  query: string,
  limit: number,
  category: string | null
): Promise<Array<{ id: string; title: string; content_text: string; similarity?: number }>> {
  const results = new Map<string, { id: string; title: string; content_text: string; similarity: number }>();

  // 1. Try RPC with full query
  const rpcParams: Record<string, unknown> = { search_query: query, result_limit: limit };
  if (category) rpcParams.category_filter = category;
  const { data: rpcData } = await supabase.rpc("search_legal_practice", rpcParams);
  for (const r of rpcData || []) {
    results.set(r.id, {
      id: r.id, title: r.title,
      content_text: (r.content_text || "").substring(0, 2000),
      similarity: r.rank || 0,
    });
  }

  // 2. Individual word search
  const words = query.split(/\s+/).filter(w => w.length >= 2);
  for (const word of words.slice(0, 5)) {
    if (results.size >= limit) break;
    const wParams: Record<string, unknown> = { search_query: word, result_limit: Math.min(10, limit) };
    if (category) wParams.category_filter = category;
    const { data: wordData } = await supabase.rpc("search_legal_practice", wParams);
    for (const r of wordData || []) {
      if (!results.has(r.id)) {
        results.set(r.id, {
          id: r.id, title: r.title,
          content_text: (r.content_text || "").substring(0, 2000),
          similarity: (r.rank || 0) * 0.8,
        });
      }
    }
  }

  // 3. Fallback ILIKE
  if (results.size === 0) {
    for (const word of words.slice(0, 3)) {
      const searchTerm = sanitize(word);
      if (searchTerm.length < 2) continue;
      let q = supabase
        .from("legal_practice_kb")
        .select("id, title, content_text")
        .eq("is_active", true)
        .or(`title.ilike.%${searchTerm}%,legal_reasoning_summary.ilike.%${searchTerm}%`)
        .limit(Math.min(10, limit));
      if (category) q = q.eq("practice_category", category);
      const { data } = await q;
      for (const r of data || []) {
        if (!results.has(r.id)) {
          results.set(r.id, {
            id: r.id, title: r.title,
            content_text: (r.content_text || "").substring(0, 2000),
            similarity: 0.3,
          });
        }
      }
    }
  }

  return Array.from(results.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

// ─── AI Reranking ────────────────────────────────────────────────────────────

async function rerankWithAI(
  query: string,
  candidates: Array<{ id: string; title: string; content_text: string }>,
  topK: number,
  apiKey: string
): Promise<unknown[]> {
  // If few candidates, skip AI and return as-is
  if (candidates.length <= topK) return candidates;

  // Build a compact list for the model (id + title + snippet)
  const items = candidates.map((c, i) => ({
    idx: i,
    title: c.title,
    snippet: c.content_text.substring(0, 500),
  }));

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You are a legal document relevance ranker. Given a user query and a list of candidate documents, call the rank_results function with the indices of the most relevant documents in order of decreasing relevance. Return at most ${topK} indices. Consider legal terminology, article references, and semantic meaning.`,
          },
          {
            role: "user",
            content: `Query: "${query}"\n\nCandidates:\n${items.map(it => `[${it.idx}] ${it.title}: ${it.snippet}`).join("\n\n")}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "rank_results",
              description: "Return ranked indices of the most relevant documents",
              parameters: {
                type: "object",
                properties: {
                  ranked_indices: {
                    type: "array",
                    items: { type: "number" },
                    description: `Array of candidate indices (0-based) in order of relevance, max ${topK}`,
                  },
                },
                required: ["ranked_indices"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "rank_results" } },
        max_completion_tokens: 500,
      }),
    });

    if (!response.ok) {
      err("vector-search", "AI rerank failed", undefined, { status: response.status });
      return candidates.slice(0, topK); // fallback: return first N
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const args = JSON.parse(toolCall.function.arguments);
      const indices = args.ranked_indices as number[];
      if (Array.isArray(indices)) {
        const valid = indices
          .filter((i) => typeof i === "number" && i >= 0 && i < candidates.length)
          .slice(0, topK);
        if (valid.length > 0) {
          return valid.map((i) => candidates[i]);
        }
      }
    }

    return candidates.slice(0, topK);
  } catch (e) {
    err("vector-search", "Rerank error", e);
    return candidates.slice(0, topK);
  }
}

function sanitize(input: string): string {
  return input
    .replace(/[%_]/g, "")
    .replace(/[(),.*\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 200);
}
