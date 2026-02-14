import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { COMPLAINT_GENERATION, buildModelParams } from "../_shared/model-config.ts";

import { SYSTEM_PROMPT, COURT_INSTRUCTIONS, LANGUAGE_INSTRUCTIONS } from "./prompts/index.ts";
import { validateRequest } from "./validators.ts";
import { 
  searchKnowledgeBase, 
  searchLegalPractice, 
  buildSearchQuery,
  mapCourtTypeToPracticeCategory 
} from "./rag-search.ts";
import { redactForLog } from "../_shared/pii-redactor.ts";
import { log, err } from "../_shared/safe-logger.ts";

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
    // === AUTH GUARD (Audit Fix: Stage 2/5 — Critical) ===
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // === END AUTH GUARD ===

    const body = await req.json();
    const request = validateRequest(body);
    const anonymize = body.anonymize === true;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Search Knowledge Base for relevant legal context
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    
    let kbContext = "";
    let legalPracticeContext = "";
    
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      const searchTerms = buildSearchQuery(request.courtType, request.category);
      const practiceCategory = mapCourtTypeToPracticeCategory(request.courtType);
      
      // Parallel search in both databases
      const [kbResults, practiceResults] = await Promise.all([
        searchKnowledgeBase(searchTerms.join(' '), SUPABASE_URL, SUPABASE_SERVICE_KEY),
        searchLegalPractice(searchTerms.join(' '), SUPABASE_URL, SUPABASE_SERVICE_KEY, practiceCategory)
      ]);
      
      kbContext = kbResults;
      legalPracticeContext = practiceResults;
      
      log("generate-complaint", "RAG context", { kbLen: kbContext.length, practiceLen: legalPracticeContext.length });
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

${kbContext ? `RELEVANT LEGAL SOURCES FROM KNOWLEDGE BASE:

${kbContext}

---` : 'No relevant sources found in Knowledge Base.'}

${legalPracticeContext ? `ANALOGOUS COURT PRACTICE (KB REFERENCE - use for legal argumentation patterns):

${legalPracticeContext}

---` : ''}

Based on the above document content, legal sources, and analogous court practice, draft a complete judicial complaint ready for filing.

Follow the strict template structure. If critical information is missing, state what is needed before drafting.
Use the court practice examples above to strengthen legal argumentation with relevant precedents.`;

    log("generate-complaint", "Generating complaint", { courtType: request.courtType, language: request.language, textLen: request.extractedText.length });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...buildModelParams(COMPLAINT_GENERATION),
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ],
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
      err("generate-complaint", "AI gateway error", undefined, { status: response.status });
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    let generatedContent = data.choices?.[0]?.message?.content || "";

    // Optional: redact PII from AI output when user requests anonymized draft
    if (anonymize && generatedContent) {
      const { redactAIOutput } = await import("../_shared/pii-redactor.ts");
      generatedContent = redactAIOutput(generatedContent);
      log("generate-complaint", "Anonymized output");
    }

    log("generate-complaint", "Complaint generated", { len: generatedContent.length });

    return new Response(
      JSON.stringify({ 
        content: generatedContent,
        tokensUsed: data.usage?.total_tokens || 0,
        courtType: request.courtType,
        category: request.category,
        ragSourcesUsed: kbContext.length > 0 || legalPracticeContext.length > 0,
        legalPracticeUsed: legalPracticeContext.length > 0,
        anonymized: anonymize
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    err("generate-complaint", "Unhandled error", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
