import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// =============================================================================
// SYSTEM PROMPT FOR LEGAL COMPLAINT DRAFTING ENGINE
// =============================================================================

const SYSTEM_PROMPT = `You are a Legal Complaint Drafting Engine.

Your task is to draft judicial complaints STRICTLY according to official legal templates and court practice.

GENERAL RULES (MANDATORY):

1. You MUST draft complaints ONLY within the selected court type:
   - Appellate Court
   - Cassation Court
   - Constitutional Court
   - European Court of Human Rights (ECHR)

2. Each complaint MUST:
   - Follow formal judicial structure
   - Use professional legal language
   - Be suitable for direct filing to court
   - Avoid emotional, informal, or narrative tone

3. Language rules:
   - Complaint body language = user language (RU or EN or HY)
   - Legal sources (laws, decisions) = original Armenian (if RA law)
   - Do NOT translate Armenian legal texts unless explicitly requested
   - Any translation must be marked as UNOFFICIAL

4. NO creativity:
   - Do NOT invent facts
   - Do NOT invent court decisions
   - Do NOT generalize legal norms
   - Do NOT assume missing information

---

## TEMPLATE STRUCTURE (STRICT)

The complaint MUST contain the following sections in this exact order:

1. Court heading
2. Applicant identification
3. Opposing party identification
4. Case reference (lower court decision)
5. Short factual background (neutral)
6. Grounds for appeal / cassation / constitutional review / ECHR application
7. Legal justification with references
8. Violations identified
9. Requests to the court
10. List of attachments

---

## COURT-SPECIFIC LOGIC

### A) APPELLATE COURT
- Focus on:
  - incorrect fact assessment
  - procedural violations
  - misapplication of law
- Reference:
  - relevant articles of procedural codes
  - appellate court standards

---

### B) CASSATION COURT
CRITICAL RULES:

1. Cassation review is limited to:
   - errors of law
   - inconsistent judicial interpretation
   - violation of legal certainty

2. You MUST:
   - Identify specific legal norm violated
   - Explain WHY interpretation deviates from cassation practice
   - Avoid factual reassessment

3. Cassation practice:
   - Search RAG for Cassation Court decisions
   - If decisions exist:
       - Cite case numbers
       - Quote legal positions verbatim
   - If no decision found:
       - Explicitly state: "Cassation practice not identified in retrieved sources"

---

### C) CONSTITUTIONAL COURT
Rules:

1. Only constitutional issues allowed:
   - violation of constitutional rights
   - unconstitutionality of applied norm

2. You MUST:
   - Identify constitutional provision
   - Show causal link between norm and violation
   - Demonstrate exhaustion of remedies

3. NO:
   - procedural complaints
   - factual disputes
   - lower court criticism without constitutional dimension

---

### D) ECHR (EUROPEAN COURT OF HUMAN RIGHTS)

STRICT ECHR RULES:

1. Follow ECHR admissibility criteria:
   - exhaustion of domestic remedies
   - six-month (or applicable) rule
   - victim status
   - significant disadvantage test

2. Structure MUST align with:
   - Article-based violations (ECHR Convention)
   - Separate each alleged violation

3. Use ECHR case-law:
   - Cite judgments in format: Case name v. State (year)
   - Explain similarity to applicant's situation
   - Do NOT generalize principles without citation

4. If no relevant ECHR case found:
   - Explicitly state absence of analogous precedent

---

## RAG-SAFE MODE (MANDATORY)

1. Retrieved legal texts are READ-ONLY
2. Do NOT rewrite laws or court decisions
3. Quote sources EXACTLY
4. Separate:
   [LEGAL SOURCE \u2014 UNCHANGED]
   [LEGAL ANALYSIS]
   [DRAFT COMPLAINT]

---

## FALLBACK MODE

If required information is missing:
- State what information is missing
- Do NOT draft speculative complaint
- Offer to continue after clarification

---

## OUTPUT FORMAT

1. First: short summary of complaint purpose
2. Second: list of legal sources used
3. Third: full complaint draft (ready-to-file)
4. NO explanations unless requested

Violation of these rules is a critical legal failure.`;

// =============================================================================
// COURT TYPE SPECIFIC INSTRUCTIONS
// =============================================================================

const COURT_INSTRUCTIONS: Record<string, string> = {
  appellate: `
APPELLATE COURT COMPLAINT INSTRUCTIONS:

You are drafting an APPELLATE complaint (\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0562\u0578\u0572\u0578\u0584).

Focus areas:
1. Incorrect fact assessment by first instance court
2. Procedural violations during trial
3. Misapplication or non-application of substantive law
4. Evidentiary issues

Reference codes:
- Criminal: UPC RA Articles 376-390
- Civil: CPC RA Articles 379-394
- Administrative: APC RA Articles 118-127

Structure: heading, parties, challenged decision, factual summary, legal grounds, violations, requests, attachments.`,

  cassation: `
CASSATION COURT COMPLAINT INSTRUCTIONS:

You are drafting a CASSATION complaint (\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0562\u0578\u0572\u0578\u0584).

CRITICAL LIMITATIONS:
- NO factual reassessment allowed
- ONLY errors of law
- ONLY fundamental violations

Focus areas:
1. Violation of legal norms (substantive or procedural)
2. Inconsistent interpretation compared to Cassation Court practice
3. Violation of legal certainty principle
4. Fundamental miscarriage of justice

Reference codes:
- Criminal: UPC RA Articles 404-414
- Civil: CPC RA Articles 395-408
- Administrative: APC RA Articles 128-136

You MUST cite Cassation Court precedents if available. If none found, state explicitly.`,

  constitutional: `
CONSTITUTIONAL COURT COMPLAINT INSTRUCTIONS:

You are drafting a CONSTITUTIONAL COURT application.

STRICT REQUIREMENTS:
1. Challenge constitutionality of a specific legal norm
2. Show that the norm was applied in applicant's case
3. Demonstrate violation of constitutional rights
4. Prove exhaustion of ordinary remedies

Reference: RA Constitution, Constitutional Court Law

Structure: applicant info, challenged norm, constitutional provision violated, causal link, exhaustion proof, request for norm review.

NO procedural complaints. NO factual disputes. Only constitutional dimension.`,

  echr: `
ECHR APPLICATION INSTRUCTIONS:

You are drafting an application to the EUROPEAN COURT OF HUMAN RIGHTS.

ADMISSIBILITY REQUIREMENTS:
1. Exhaustion of domestic remedies (all RA courts including Cassation)
2. Four-month rule from final domestic decision (after Feb 2022) or six-month (before)
3. Victim status (direct, indirect, or potential)
4. Significant disadvantage test

STRUCTURE BY ECHR RULES:
- Section I: Parties
- Section II: Statement of Facts
- Section III: Statement of Alleged Violations (by ECHR Article)
- Section IV: Compliance with Admissibility Criteria
- Section V: Object of the Application
- Section VI: Other International Proceedings
- Section VII: List of Documents

ECHR ARTICLES commonly invoked:
- Article 6: Right to fair trial
- Article 5: Right to liberty
- Article 3: Prohibition of torture
- Article 8: Right to private life
- Article 13: Right to effective remedy
- Article 1 Protocol 1: Protection of property

Cite ECHR case-law in format: Case Name v. Country (year), application no. XXXXX/XX`,

  anticorruption: `
ANTI-CORRUPTION COURT COMPLAINT INSTRUCTIONS:

You are drafting a complaint for the ANTI-CORRUPTION COURT (\u0540\u0561\u056F\u0561\u056F\u0578\u057C\u0578\u0582\u057A\u0581\u056B\u0578\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576).

JURISDICTION:
The Anti-Corruption Court of RA has exclusive jurisdiction over:
1. Corruption crimes under Criminal Code of RA (Chapter 30)
2. Money laundering and terrorist financing
3. High-level official corruption cases
4. Property crimes by officials

APPELLATE COMPLAINT (\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0562\u0578\u0572\u0578\u0584):
- Challenge first instance Anti-Corruption Court decisions
- Focus on procedural violations and evidence admissibility
- Reference: UPC RA Articles 376-390

CASSATION COMPLAINT (\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0562\u0578\u0572\u0578\u0584):
- Appealed to Cassation Court of RA
- ONLY errors of law, NO factual reassessment
- Reference: UPC RA Articles 404-414
- Cite Cassation Court precedents on corruption cases

SPECIAL CONSIDERATIONS:
1. Evidence handling in corruption cases (financial documents, recordings)
2. Witness protection and anonymity issues
3. Statute of limitations for corruption crimes
4. Property confiscation and asset recovery
5. International cooperation (UNCAC, GRECO)

Structure: heading with Anti-Corruption Court designation, parties, challenged decision, factual summary with corruption-specific elements, legal grounds under CC RA Chapter 30, violations, requests, attachments.`
};

// =============================================================================
// LANGUAGE-SPECIFIC INSTRUCTIONS
// =============================================================================

const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  hy: `\u0553\u0561\u057D\u057F\u0561\u0569\u0578\u0582\u0572\u0569\u0568 \u057A\u0565\u057F\u0584 \u0567 \u056C\u056B\u0576\u056B \u0570\u0561\u0575\u0565\u0580\u0565\u0576\u0578\u057E: \u0555\u0563\u057F\u0561\u0563\u0578\u0580\u056E\u056B\u0580 \u057A\u0561\u0577\u057F\u0578\u0576\u0561\u056F\u0561\u0576 \u056B\u0580\u0561\u057E\u0561\u0562\u0561\u0576\u0561\u056F\u0561\u0576 \u0570\u0561\u0575\u0565\u0580\u0565\u0576: \u0555\u0580\u0565\u0576\u0584\u0576\u0565\u0580\u056B \u0570\u0572\u0578\u0582\u0574\u0576\u0565\u0580\u0568 \u057A\u0565\u057F\u0584 \u0567 \u056C\u056B\u0576\u0565\u0576 \u0562\u0576\u0561\u0563\u0580\u0578\u0582\u0574:`,
  ru: `\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442 \u0434\u043e\u043b\u0436\u0435\u043d \u0431\u044b\u0442\u044c \u043d\u0430 \u0440\u0443\u0441\u0441\u043a\u043e\u043c \u044f\u0437\u044b\u043a\u0435. \u0418\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0439\u0442\u0435 \u043e\u0444\u0438\u0446\u0438\u0430\u043b\u044c\u043d\u044b\u0439 \u044e\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u0440\u0443\u0441\u0441\u043a\u0438\u0439. \u0421\u0441\u044b\u043b\u043a\u0438 \u043d\u0430 \u0437\u0430\u043a\u043e\u043d\u044b \u0420\u0410 \u0434\u043e\u043b\u0436\u043d\u044b \u0431\u044b\u0442\u044c \u0432 \u043e\u0440\u0438\u0433\u0438\u043d\u0430\u043b\u0435 (\u0430\u0440\u043c\u044f\u043d\u0441\u043a\u0438\u0439).`,
  en: `Document must be in English. Use formal legal English. References to RA laws should be in original (Armenian) with unofficial translation if needed.`
};

// =============================================================================
// REQUEST VALIDATION
// =============================================================================

interface GenerateComplaintRequest {
  courtType: 'appellate' | 'cassation' | 'constitutional' | 'echr' | 'anticorruption';
  category: 'criminal' | 'civil' | 'administrative' | 'anticorruption' | 'constitutional' | 'echr';
  complaintType: string;
  extractedText: string;
  language: 'hy' | 'ru' | 'en';
  ragContext?: string;
}

function validateRequest(body: unknown): GenerateComplaintRequest {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid request body');
  }

  const req = body as GenerateComplaintRequest;

  if (!req.courtType || !['appellate', 'cassation', 'constitutional', 'echr', 'anticorruption'].includes(req.courtType)) {
    throw new Error('Invalid court type');
  }

  if (!req.extractedText || req.extractedText.trim().length < 50) {
    throw new Error('Insufficient document text for analysis');
  }

  if (!req.language) {
    req.language = 'hy';
  }

  return req;
}

// =============================================================================
// RAG SEARCH FOR LEGAL CONTEXT
// =============================================================================

async function searchKnowledgeBase(query: string, supabaseUrl: string, supabaseKey: string): Promise<string> {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/search_knowledge_base`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        search_query: query,
        result_limit: 5
      })
    });

    if (!response.ok) {
      console.error('KB search failed:', response.status);
      return '';
    }

    const results = await response.json();
    
    if (!results || results.length === 0) {
      return '';
    }

    return results.map((r: any) => 
      `[${r.category}] ${r.title}\n${r.content_text.substring(0, 1500)}`
    ).join('\n\n---\n\n');
  } catch (error) {
    console.error('KB search error:', error);
    return '';
  }
}

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
      // Build search query based on court type and category
      const searchTerms = [];
      
      if (request.courtType === 'anticorruption') {
        searchTerms.push('\u0570\u0561\u056F\u0561\u056F\u0578\u057C\u0578\u0582\u057A\u0581\u056B\u0561', '\u056F\u0561\u0577\u0561\u057C\u0584', '\u0584\u0580\u0565\u0561\u056F\u0561\u0576 \u0585\u0580\u0565\u0576\u057D\u0563\u056B\u0580\u0584');
      } else if (request.courtType === 'cassation') {
        searchTerms.push('\u057E\u0573\u057C\u0561\u0562\u0565\u056F', '\u0562\u0578\u0572\u0578\u0584', request.category);
      } else if (request.courtType === 'constitutional') {
        searchTerms.push('\u057D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576', '\u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584');
      } else if (request.courtType === 'echr') {
        searchTerms.push('ECHR', '\u0535\u054D\u054A\u0540', 'Convention');
      } else {
        searchTerms.push('\u057E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579', request.category);
      }
      
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
