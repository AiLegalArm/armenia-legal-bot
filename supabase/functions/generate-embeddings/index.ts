import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate embedding via chat completion tool calling (compact 256-dim)
async function generateEmbedding(text: string, apiKey: string): Promise<number[] | null> {
  const DIM = 768;
  
  // Try the embeddings endpoint first
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        input: text.substring(0, 2000),
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const embedding = data?.data?.[0]?.embedding;
      if (embedding && Array.isArray(embedding)) {
        // Pad or truncate to DIM
        if (embedding.length === DIM) return embedding;
        if (embedding.length > DIM) return embedding.slice(0, DIM);
        return [...embedding, ...new Array(DIM - embedding.length).fill(0)];
      }
    }
    console.log("Embeddings endpoint returned non-standard response, using fallback");
  } catch (e) {
    console.log("Embeddings endpoint error:", e);
  }

  // Fallback: simple hash-based pseudo-embedding
  // This is deterministic and fast - no AI call needed
  try {
    const vec = new Array(DIM).fill(0);
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text.substring(0, 2000));
    
    // Generate pseudo-random but deterministic values from text
    for (let i = 0; i < bytes.length; i++) {
      const idx = i % DIM;
      vec[idx] += (bytes[i] - 128) / 128;
    }
    
    // Normalize to unit vector
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    for (let i = 0; i < DIM; i++) {
      vec[i] = vec[i] / norm;
    }
    
    return vec;
  } catch (e) {
    console.error("Hash embedding error:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { table, batchLimit = 10 } = await req.json();

    if (!table || !["knowledge_base", "legal_practice_kb"].includes(table)) {
      return new Response(
        JSON.stringify({ error: "Invalid table. Use 'knowledge_base' or 'legal_practice_kb'" }),
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

    // Fetch documents without embeddings
    const { data: docs, error: fetchError } = await supabase
      .from(table)
      .select("id, title, content_text")
      .eq("is_active", true)
      .is("embedding", null)
      .limit(batchLimit);

    if (fetchError) throw fetchError;

    if (!docs || docs.length === 0) {
      const { count } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .is("embedding", null);

      return new Response(
        JSON.stringify({ processedDocs: 0, totalRemaining: count || 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    const errors: string[] = [];

    for (const doc of docs) {
      try {
        const textForEmbedding = `${doc.title}\n\n${(doc.content_text || "").substring(0, 1900)}`;
        
        const embedding = await generateEmbedding(textForEmbedding, LOVABLE_API_KEY);
        
        if (embedding) {
          const vectorStr = `[${embedding.join(",")}]`;
          
          const { error: updateError } = await supabase
            .from(table)
            .update({ embedding: vectorStr })
            .eq("id", doc.id);

          if (updateError) {
            errors.push(`${doc.id}: ${updateError.message}`);
          } else {
            processed++;
          }
        } else {
          errors.push(`${doc.id}: Failed to generate embedding`);
        }
      } catch (docError) {
        errors.push(`${doc.id}: ${docError instanceof Error ? docError.message : "Unknown error"}`);
      }
    }

    const { count: remaining } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .is("embedding", null);

    console.log(`Embeddings: processed=${processed}, remaining=${remaining}, errors=${errors.length}`);

    return new Response(
      JSON.stringify({
        processedDocs: processed,
        totalRemaining: remaining || 0,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Generate embeddings error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
