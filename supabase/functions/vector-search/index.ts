import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate embedding for a query using the same method as generate-embeddings
async function generateQueryEmbedding(text: string, apiKey: string): Promise<number[] | null> {
  // Try embeddings endpoint first
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        input: text,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const embedding = data?.data?.[0]?.embedding;
      if (embedding && Array.isArray(embedding)) return embedding;
    }
  } catch (_e) { /* fallback below */ }

  // Fallback: chat completion with tool calling
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
            content: `You are a text embedding system. Given input text, call store_embedding with a 768-dimensional normalized vector representing semantic meaning. Values between -1 and 1, L2 norm ≈ 1. Focus on legal concepts.`
          },
          { role: "user", content: text.substring(0, 2000) }
        ],
        tools: [{
          type: "function",
          function: {
            name: "store_embedding",
            description: "Store the semantic embedding vector",
            parameters: {
              type: "object",
              properties: {
                embedding: {
                  type: "array",
                  items: { type: "number" },
                  description: "768-dimensional normalized embedding vector"
                }
              },
              required: ["embedding"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "store_embedding" } },
        temperature: 0,
        max_tokens: 16000,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const args = JSON.parse(toolCall.function.arguments);
      if (args.embedding && Array.isArray(args.embedding)) {
        const vec = args.embedding as number[];
        if (vec.length === 768) return vec;
        if (vec.length < 768) return [...vec, ...new Array(768 - vec.length).fill(0)];
        return vec.slice(0, 768);
      }
    }
    return null;
  } catch (_e) {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, tables = "both", category, limit = 10, threshold = 0.3 } = await req.json();

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

    // Generate query embedding
    const queryEmbedding = await generateQueryEmbedding(query, LOVABLE_API_KEY);
    
    if (!queryEmbedding) {
      return new Response(
        JSON.stringify({ error: "Failed to generate query embedding", kb: [], practice: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const vectorStr = `[${queryEmbedding.join(",")}]`;
    const results: { kb: unknown[]; practice: unknown[] } = { kb: [], practice: [] };

    // Search Knowledge Base
    if (tables === "kb" || tables === "both") {
      const { data: kbResults, error: kbError } = await supabase.rpc("match_knowledge_base", {
        query_embedding: vectorStr,
        match_count: limit,
        match_threshold: threshold,
      });

      if (kbError) {
        console.error("KB vector search error:", kbError);
      } else {
        results.kb = kbResults || [];
      }
    }

    // Search Legal Practice
    if (tables === "practice" || tables === "both") {
      const { data: practiceResults, error: practiceError } = await supabase.rpc("match_legal_practice", {
        query_embedding: vectorStr,
        match_count: limit,
        match_threshold: threshold,
        category_filter: category || null,
      });

      if (practiceError) {
        console.error("Practice vector search error:", practiceError);
      } else {
        results.practice = practiceResults || [];
      }
    }

    console.log(`Vector search: query="${query.substring(0, 50)}...", kb=${results.kb.length}, practice=${results.practice.length}`);

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Vector search error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
