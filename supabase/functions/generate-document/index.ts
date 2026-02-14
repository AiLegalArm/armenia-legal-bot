import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { log, err } from "../_shared/safe-logger.ts";
import { sandboxUserInput, secureSandbox, logInjectionAttempt, ANTI_INJECTION_RULES } from "../_shared/prompt-armor.ts";
import { applyBudgets, logTokenUsage, type RankedContent } from "../_shared/token-budget.ts";
import { DOCUMENT_GENERATION, buildModelParams } from "../_shared/model-config.ts";
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
import { dualSearch } from "../_shared/rag-search.ts";
import { buildSearchQuery, mapCategoryToPracticeCategory } from "./rag-search.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // === END AUTH GUARD ===

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
      
      const rag = await dualSearch({
        supabase,
        supabaseUrl: SUPABASE_URL,
        supabaseKey: SUPABASE_SERVICE_KEY,
        query: searchTerms.join(' '),
        category: practiceCategory,
        kbLimit: 8,
        practiceLimit: 5,
        fullPracticeText: false,
      });
      
      kbContext = rag.kbContext;
      legalPracticeContext = rag.practiceContext;
      
      // Apply token budgets to RAG contexts
      const budgeted = applyBudgets({
        userFacts: contextText,
        ragLegislation: kbContext ? [{ text: kbContext, score: 10 }] : [],
        ragPractice: legalPracticeContext ? [{ text: legalPracticeContext, score: 10 }] : [],
      }, "document");
      logTokenUsage("generate-document", user.id, budgeted.usage);
      kbContext = budgeted.ragLegislation;
      legalPracticeContext = budgeted.ragPractice;
      
      log("generate-document", "RAG context", { kbLen: kbContext.length, practiceLen: legalPracticeContext.length });
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
${secureSandbox("CONTEXT_AND_FACTS", contextText, "generate-document").output}

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
      
      log("generate-document", "Role-aware generation", { role: request.role, jurisdiction });
    } else {
      // Legacy mode: use original system prompt without role layer
      systemPrompt = SYSTEM_PROMPTS[language] || SYSTEM_PROMPTS.hy;
      userPrompt = userContextBlock;
    }

    log("generate-document", "Generating", { promptLen: userPrompt.length, sysLen: systemPrompt.length });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...buildModelParams(DOCUMENT_GENERATION),
        messages: [
          { role: "system", content: systemPrompt },
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
      err("generate-document", "AI gateway error", undefined, { status: response.status });
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const generatedContent = data.choices?.[0]?.message?.content || "";

    log("generate-document", "Document generated", { len: generatedContent.length });

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
    err("generate-document", "Unhandled error", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
