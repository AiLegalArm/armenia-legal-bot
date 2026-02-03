import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { SYSTEM_PROMPT, COURT_INSTRUCTIONS, LANGUAGE_INSTRUCTIONS } from "./prompts/index.ts";
import { validateRequest } from "./validators.ts";
import { searchKnowledgeBase, buildSearchQuery } from "./rag-search.ts";

// =============================================================================
// CORS HEADERS
// =============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const request = validateRequest(body);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Search Knowledge Base for relevant legal context
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    
    let ragContext = "";
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      const searchTerms = buildSearchQuery(request.courtType, request.category);
      ragContext = await searchKnowledgeBase(searchTerms.join(' '), SUPABASE_URL, SUPABASE_SERVICE_KEY);
    }

    // Compose the full prompt
    const courtInstruction = COURT_INSTRUCTIONS[request.courtType] || '';
    const languageInstruction = LANGUAGE_INSTRUCTIONS[request.language] || LANGUAGE_INSTRUCTIONS.hy;

    const userPrompt = `${courtInstruction}

${languageInstruction}

---

COMPLAINT TYPE: ${request.complaintType}
CATEGORY: ${request.category}
COURT: ${request.courtType.toUpperCase()}

---

UPLOADED DOCUMENT CONTENT (extracted text for analysis):

${request.extractedText}

---

${ragContext ? `RELEVANT LEGAL SOURCES FROM KNOWLEDGE BASE:

${ragContext}

---` : 'No relevant sources found in Knowledge Base.'}

Based on the above document content and legal sources, draft a complete judicial complaint ready for filing.

Follow the strict template structure. If critical information is missing, state what is needed before drafting.`;

    console.log(`Generating ${request.courtType} complaint, language: ${request.language}`);
    console.log(`Extracted text length: ${request.extractedText.length}`);
    console.log(`RAG context length: ${ragContext.length}`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1, // Low temperature for legal precision
        max_tokens: 12000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits need to be replenished." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const generatedContent = data.choices?.[0]?.message?.content || "";

    console.log("Complaint generated, length:", generatedContent.length);

    return new Response(
      JSON.stringify({ 
        content: generatedContent,
        tokensUsed: data.usage?.total_tokens || 0,
        courtType: request.courtType,
        category: request.category,
        ragSourcesUsed: ragContext.length > 0
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Complaint generation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
