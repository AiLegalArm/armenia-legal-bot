import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { DOCUMENT_PROMPTS } from "./prompts/index.ts";
import { SYSTEM_PROMPTS } from "./system-prompts.ts";
import {
  validateRequest,
  buildRecipientInfo,
  buildSenderInfo,
  buildContextText,
  getLanguageNote,
} from "./validators.ts";
import { 
  composePrompt, 
  getJurisdictionFromCategory,
  validateComposedPrompt 
} from "./prompt-composer.ts";
import { getRolePrompt, ROLE_CONFIGS, LegalRole } from "./prompts/role-prompts.ts";
import { 
  searchKnowledgeBase, 
  searchLegalPractice, 
  buildSearchQuery,
  mapCategoryToPracticeCategory 
} from "./rag-search.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Build context from case data and/or source text
    const contextText = buildContextText(request);
    const recipientInfo = buildRecipientInfo(request);
    const senderInfo = buildSenderInfo(request);

    // ==========================================================================
    // RAG: Search Knowledge Base and Legal Practice
    // ==========================================================================
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    
    let kbContext = "";
    let legalPracticeContext = "";
    
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      const searchTerms = buildSearchQuery(request.category, request.templateName);
      const practiceCategory = mapCategoryToPracticeCategory(request.category);
      
      // Parallel search in both databases
      const [kbResults, practiceResults] = await Promise.all([
        searchKnowledgeBase(searchTerms.join(' '), SUPABASE_URL, SUPABASE_SERVICE_KEY),
        searchLegalPractice(searchTerms.join(' '), SUPABASE_URL, SUPABASE_SERVICE_KEY, practiceCategory)
      ]);
      
      kbContext = kbResults;
      legalPracticeContext = practiceResults;
      
      console.log(`RAG: KB context length: ${kbContext.length}, Legal practice length: ${legalPracticeContext.length}`);
    }

    // Select the most specific prompt available
    const documentPrompt = DOCUMENT_PROMPTS[request.templateId || ''] 
      || DOCUMENT_PROMPTS[request.subcategory || ''] 
      || DOCUMENT_PROMPTS[request.category] 
      || DOCUMENT_PROMPTS.general;

    // Get language-specific system prompt
    const language = request.language || 'hy';
    const languageNote = getLanguageNote(language);
    
    // Determine jurisdiction from category
    const jurisdiction = getJurisdictionFromCategory(request.category);

    // Build user context for prompt composition
    const userContextBlock = `DOCUMENT TO GENERATE: "${request.templateName}"
CATEGORY: ${request.category}${request.subcategory ? ` / ${request.subcategory}` : ''}

SPECIFIC INSTRUCTIONS FOR THIS DOCUMENT TYPE:
${documentPrompt}

RECIPIENT INFORMATION:
${recipientInfo}

APPLICANT/SENDER INFORMATION:
${senderInfo}

CONTEXT AND FACTS:
${contextText}

${request.additionalFields ? `ADDITIONAL INFORMATION:\n${JSON.stringify(request.additionalFields, null, 2)}` : ''}

${kbContext ? `---
RELEVANT LEGAL SOURCES FROM KNOWLEDGE BASE:

${kbContext}
---` : ''}

${legalPracticeContext ? `---
ANALOGOUS COURT PRACTICE (KB REFERENCE ONLY - for legal argumentation structure):

${legalPracticeContext}
---` : ''}

LANGUAGE REQUIREMENT:
${languageNote}

Generate a complete, professional legal document that is ready for submission to Armenian authorities/courts.
Use the legal sources and court practice above to strengthen legal argumentation where applicable.`;

    // ==========================================================================
    // COMPOSE PROMPT WITH ROLE-AWARENESS (NEW MODULAR ARCHITECTURE)
    // ==========================================================================
    let systemPrompt: string;
    let userPrompt: string;

    if (request.role) {
      // Use new layered prompt composition
      const composed = composePrompt({
        language,
        role: request.role,
        jurisdiction,
        documentPrompt,
        userContext: userContextBlock
      });

      // Validate composed prompt
      if (!validateComposedPrompt(composed)) {
        console.error("Prompt validation errors:", composed.validationErrors);
        return new Response(
          JSON.stringify({ 
            error: "Role validation failed", 
            details: composed.validationErrors 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      systemPrompt = composed.systemPrompt;
      userPrompt = composed.userPrompt;
      
      console.log(`Role-aware generation: role=${request.role}, jurisdiction=${jurisdiction}`);
    } else {
      // Legacy mode: use original system prompt without role layer
      systemPrompt = SYSTEM_PROMPTS[language] || SYSTEM_PROMPTS.hy;
      userPrompt = userContextBlock;
    }

    console.log("Generating document with prompt length:", userPrompt.length);
    console.log("System prompt length:", systemPrompt.length);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 10000,
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

    console.log("Document generated, length:", generatedContent.length);

    return new Response(
      JSON.stringify({ 
        content: generatedContent,
        tokensUsed: data.usage?.total_tokens || 0,
        role: request.role || 'default',
        jurisdiction
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Document generation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
