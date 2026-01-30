import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

interface KBSearchResult {
  id: string;
  title: string;
  content_text: string;
  category: string;
  source_name: string | null;
  source_url: string | null;
  article_number: string | null;
  rank: number;
}

interface SearchOutput {
  results: Array<{
    title: string;
    snippet: string;
    source: string;
    category: string;
    documentId: string;
  }>;
  keywords: string[];
  totalFound: number;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// System prompt for search assistant - extracts keywords and returns results
const SEARCH_ASSISTANT_SYSTEM_PROMPT = `You are a search assistant for a knowledge base.

Your task is NOT to answer the user's question.

Your task is to perform keyword-based search over the knowledge base.

Rules:
- Extract clear and relevant keywords from the user input.
- Do NOT interpret meaning or give explanations.
- Do NOT invent information.
- Return only search results that match keywords.
- If no results are found, say so clearly.

Based on the user query, extract Armenian/Russian/English keywords that would best match legal documents.
Return the keywords as a JSON array.

Example input: "\u053B\u0576\u0579\u057A\u0565\u057D \u056F\u0561\u0580\u0578\u0572 \u0567 \u057E\u0561\u0580\u0571\u0561\u056F\u0561\u056C\u0578\u0582\u0569\u0575\u0578\u0582\u0576 \u057E\u0565\u0580\u0581\u0576\u0565\u056C"
Example output: ["\u057E\u0561\u0580\u0571\u0561\u056F\u0561\u056C\u0578\u0582\u0569\u0575\u0578\u0582\u0576", "\u057E\u0565\u0580\u0581\u0576\u0565\u056C", "\u057E\u0561\u0580\u0571"]

Respond ONLY with a JSON array of keywords, no other text.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, limit = 20 } = await req.json();

    if (!query || typeof query !== "string") {
      return new Response(
        JSON.stringify({ error: "Query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`KB Search Assistant: query="${query.substring(0, 100)}..."`);

    // Step 1: Use AI to extract keywords from the query
    let keywords: string[] = [];
    
    try {
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: SEARCH_ASSISTANT_SYSTEM_PROMPT },
            { role: "user", content: query }
          ],
          temperature: 0.1,
          max_tokens: 200,
        }),
      });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        const content = aiData.choices?.[0]?.message?.content || "";
        
        // Parse the JSON array from the response
        const jsonMatch = content.match(/\[.*\]/s);
        if (jsonMatch) {
          try {
            keywords = JSON.parse(jsonMatch[0]);
            console.log(`AI extracted keywords: ${keywords.join(", ")}`);
          } catch {
            console.log("Failed to parse AI keywords, using fallback");
          }
        }
      }
    } catch (aiErr) {
      console.error("AI keyword extraction error:", aiErr);
    }

    // Fallback: extract keywords manually if AI failed
    if (keywords.length === 0) {
      keywords = query
        .split(/[\s,.\u054D\u057F]+/)
        .filter((w: string) => w.length > 2 && !/^[0-9]+$/.test(w))
        .slice(0, 10);
      console.log(`Fallback keywords: ${keywords.join(", ")}`);
    }

    // Step 2: Search the knowledge base with extracted keywords
    let searchResults: KBSearchResult[] = [];
    
    if (keywords.length > 0) {
      // Build OR conditions for each keyword
      const orConditions = keywords
        .map((k: string) => `title.ilike.%${k}%,content_text.ilike.%${k}%`)
        .join(",");

      const { data, error } = await supabase
        .from("knowledge_base")
        .select("id, title, content_text, category, source_name, source_url, article_number")
        .eq("is_active", true)
        .or(orConditions)
        .limit(Math.min(limit, 50));

      if (!error && data) {
        // Score and rank results
        searchResults = data.map((r: any) => {
          let score = 0;
          const titleLower = (r.title || "").toLowerCase();
          const contentLower = (r.content_text || "").toLowerCase();

          for (const kw of keywords) {
            const kwLower = kw.toLowerCase();
            if (titleLower.includes(kwLower)) score += 3;
            if (contentLower.includes(kwLower)) score += 1;
          }
          return { ...r, rank: score / (keywords.length * 4) };
        }).sort((a: any, b: any) => b.rank - a.rank);
      }
    }

    // Fallback: use full-text search if keyword search failed
    if (searchResults.length === 0) {
      const { data: ftsData, error: ftsError } = await supabase.rpc(
        "search_knowledge_base",
        { search_query: query, result_limit: limit }
      );

      if (!ftsError && ftsData) {
        searchResults = ftsData.filter((r: KBSearchResult) => r.rank > 0.001);
      }
    }

    // Step 3: Format output according to requirements
    const output: SearchOutput = {
      results: searchResults.slice(0, limit).map((r) => ({
        title: r.title,
        snippet: r.content_text.substring(0, 300) + (r.content_text.length > 300 ? "..." : ""),
        source: r.source_name || r.source_url || `ID: ${r.id}`,
        category: r.category,
        documentId: r.id,
      })),
      keywords,
      totalFound: searchResults.length,
    };

    // Log API usage
    try {
      await supabase.rpc("log_api_usage", {
        _service_type: "kb_search_assistant",
        _model_name: "google/gemini-2.5-flash-lite",
        _tokens_used: null,
        _estimated_cost: 0.0005,
        _metadata: { query_length: query.length, keywords_count: keywords.length, results_count: output.results.length }
      });
    } catch (logErr) {
      console.error("Failed to log API usage:", logErr);
    }

    console.log(`KB Search completed: ${output.results.length} results found`);

    return new Response(
      JSON.stringify(output),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("KB Search Assistant error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        results: [],
        keywords: [],
        totalFound: 0
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
