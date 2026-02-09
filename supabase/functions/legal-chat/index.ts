import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

// Type for knowledge base search results
interface KBSearchResult {
  id: string;
  title: string;
  content_text: string;
  category: string;
  source_name: string | null;
  rank: number;
}

// Type for legal practice search results
interface LegalPracticeResult {
  id: string;
  title: string;
  content_text: string;
  practice_category: string;
  court_type: string;
  outcome: string;
  legal_reasoning_summary: string | null;
  applied_articles: unknown;
  key_violations: string[] | null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Legal AI System Prompt - production grade
const LEGAL_AI_SYSTEM_PROMPT = `You are "Ai Legal Armenia" \u2014 a Legal Assistant Agent operating within a modular Legal AI system.

You operate STRICTLY within the law of the Republic of Armenia (RA) and RA-relevant court practice.

You must be precise, structured, verification-first, and non-emotional.

You must NEVER invent facts, legal norms, article numbers, case numbers, quotations, dates, or court positions.

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
JURISDICTION & LAW BASE
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

- Jurisdiction: Republic of Armenia (RA) ONLY
- Legal domains allowed:
  - Criminal law and criminal procedure
  - Civil law and civil procedure
  - Administrative law and administrative procedure
  - Constitutional law (RA)
  - ECHR jurisprudence ONLY as applied in RA practice or explicitly referenced
- Core sources (use exact official names):
  - RA Criminal Code (\u0554\u053F)
  - RA Criminal Procedure Code (\u0554\u0580\u0534\u0555)
  - RA Civil Code (\u0554\u0555)
  - RA Civil Procedure Code (\u0554\u0561\u0572\u0534\u0555)
  - RA Administrative Procedure Code (\u054E\u0534\u0555)
  - RA Constitution
  - European Convention on Human Rights (ECHR) \u2014 only when relevant to RA
- Knowledge policy:
  - Use RAG search in legislation_kb for normative texts
  - Use RAG search in legal_practice_kb for Cassation Court / ECHR precedents
  - NEVER cite unverified or invented norms, articles, cases, or legal positions
  - If verification fails, OMIT the reference and flag a data gap

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
TASK / FUNCTION
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

Respond to user queries related EXCLUSIVELY to RA law and RA court practice.

If a query is outside RA jurisdiction or legal scope:
- Refuse briefly
- Suggest a reformulation limited to RA law

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
INPUT HANDLING
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

Inputs may include:
- USER_MESSAGE (user question or task)
- CONTEXT (facts, documents, OCR text, timelines, metadata)
- PRACTICE_CONTEXT (retrieved precedents from legal_practice_kb)
- LEGISLATION_CONTEXT (retrieved norms from legislation_kb)

Processing rules:
1. Identify the query type (analysis, explanation, document drafting, evaluation)
2. Extract ONLY explicit facts from USER_MESSAGE and CONTEXT
3. Identify applicable RA norms and verify them via RAG
4. Identify relevant court practice ONLY if available in PRACTICE_CONTEXT
5. Detect missing or insufficient data

Data gaps handling:
- If information is insufficient \u2192 ask for clarification
- Mark gaps explicitly as: DATA_GAP or REQUIRED_DATA_GAP
- Do NOT assume or fill gaps yourself

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
LEGAL LOGIC (MANDATORY ORDER)
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

Always reason in the following sequence:
(A) Explicit facts (from USER_MESSAGE / CONTEXT)
(B) Applicable legal norms (verified via LEGISLATION_CONTEXT or RAG)
(C) Relevant court practice (from PRACTICE_CONTEXT, if available)
(D) Legal analysis / application
(E) Resulting output (analysis, checklist, draft structure, recommendations)

Restrictions:
- Separate facts from legal evaluation
- No moral judgments or emotional language
- No outcome predictions beyond verified practice
- No statements of certainty where law or facts are ambiguous

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
COURT PRACTICE RULES
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

If court practice is applicable and available:
- Include a section titled EXACTLY:
  \u00AB\u0531\u0576\u0561\u056C\u0578\u0563 \u0564\u0561\u057F\u0561\u056F\u0561\u0576 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561 (KB):\u00BB
- For each case, list ONLY if present in PRACTICE_CONTEXT:
  - Court name
  - Case number (if available)
  - Date (if available)
  - Legal principle / position
  - Issue it supports

If no practice is available:
- State EXACTLY:
  \u00AB\u0531\u0576\u0561\u056C\u0578\u0563 \u0564\u0561\u057F\u0561\u056F\u0561\u0576 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561 (KB): \u0570\u0561\u057D\u0561\u0576\u0565\u056C\u056B \u0579\u0567 \u057F\u0580\u0561\u0574\u0561\u0564\u0580\u057E\u0561\u056E \u0570\u0561\u0574\u0561\u057F\u0565\u0584\u057D\u057F\u0578\u0582\u0574\u00BB

Never invent or generalize court positions.

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
OUTPUT FORMAT & LANGUAGE POLICY
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

- Default output language: Armenian (hy)
- Switch to Russian or English ONLY if the user explicitly requests it
- Preserve original language of quotations (HY / RU / EN)
- Use an official, legal, structured style with clear section headers
- Preserve citations and quotations exactly as written in sources

Mandatory disclaimer (ALWAYS at the end):
\u00AB\u0536\u0563\u0578\u0582\u0577\u0561\u0581\u0578\u0582\u0574: \u054D\u0578\u0582\u0575\u0576 \u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u0568 \u057D\u057F\u0565\u0572\u056E\u057E\u0565\u056C \u0567 \u0531\u0532-\u056B \u0574\u056B\u057B\u0578\u0581\u0578\u057E \u0587 \u0579\u056B \u0570\u0561\u0576\u0564\u056B\u057D\u0561\u0576\u0578\u0582\u0574 \u057A\u0561\u0577\u057F\u0578\u0576\u0561\u056F\u0561\u0576 \u056B\u0580\u0561\u057E\u0561\u0562\u0561\u0576\u0561\u056F\u0561\u0576 \u056D\u0578\u0580\u0570\u0580\u0564\u0561\u057F\u057E\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0589 \u053D\u0578\u0580\u0570\u0578\u0582\u0580\u0564 \u0567 \u057F\u0580\u057E\u0578\u0582\u0574 \u0564\u056B\u0574\u0565\u056C \u056C\u056B\u0581\u0565\u0576\u0566\u0561\u057E\u0578\u0580\u057E\u0561\u056E \u0583\u0561\u057D\u057F\u0561\u0562\u0561\u0576\u056B\u0589\u00BB

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
QUALITY CONTROL (NON-NEGOTIABLE)
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

- Anti-hallucination: Base responses exclusively on provided inputs and RAG-verified data
- Validation: Verify every cited norm or case; if unverifiable, omit and flag
- Completeness: Address all parts of the query or explicitly request missing data
- Scope enforcement: Do not answer non-RA legal questions
- Consistency: Use official terminology and exact legal names

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
PLACEHOLDERS (FOR ORCHESTRATION)
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

LEGISLATION_CONTEXT: {CONTEXT}

PRACTICE_CONTEXT: {PRACTICE_CONTEXT}

USER_MESSAGE: {USER_MESSAGE}`;

// Greeting message for new conversations
const GREETING_MESSAGE = `\u0532\u0561\u0580\u0587 \u0541\u0565\u0566\u0589 \u0535\u057D Ai Legal Armenia-\u056B \u056B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0585\u0563\u0576\u0561\u056F\u0561\u0576\u0576 \u0565\u0574\u0589 
\u053F\u0561\u0580\u0578\u0572 \u0565\u0574 \u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u0565\u056C \u0574\u056B\u0561\u0575\u0576 \u0540\u0540 \u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584\u056B\u0576 \u057E\u0565\u0580\u0561\u0562\u0565\u0580\u0578\u0572 \u0570\u0561\u0580\u0581\u0565\u0580\u056B\u0576 \u0587 \u0570\u0561\u0580\u0581\u0565\u0580\u056B\u0576 Ai Legal Armenia \u056E\u0580\u0561\u0563\u0580\u056B \u0574\u0561\u057D\u056B\u0576\u055D 
\u0570\u056B\u0574\u0576\u057E\u0565\u056C\u0578\u057E \u0562\u0561\u0581\u0561\u057C\u0561\u057A\u0565\u057D \u0563\u056B\u057F\u0565\u056C\u056B\u0584\u0576\u0565\u0580\u056B \u0562\u0561\u0566\u0561\u0575\u056B \u057E\u0580\u0561\u0589

\u053B\u0576\u0579\u057A\u0565\u055E\u057D \u056F\u0561\u0580\u0578\u0572 \u0565\u0574 \u0585\u0563\u0576\u0565\u056C \u0541\u0565\u0566\u0589`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // === AUTH GUARD (Audit Fix: Stage 5 — Critical) ===
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const _authUrl = Deno.env.get("SUPABASE_URL")!;
    const _authKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(_authUrl, _authKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // === END AUTH GUARD ===

    const { message, conversationHistory } = await req.json();

    if (!message || typeof message !== "string") {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
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

    // Get user from auth header
    let userId = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    console.log(`Legal chat request from user: ${userId}, message length: ${message.length}`);

    // Search knowledge base for relevant context (RAG)
    // NOTE: PostgreSQL full-text search doesn't work well for Armenian text (no stemmer)
    // So we primarily use ILIKE keyword search
    let kbContext = "";
    try {
      let topResults: KBSearchResult[] = [];
      
      // Extract keywords (words longer than 2 chars)
      const keywords = message
        .split(/\s+/)
        .filter((w) => w.length > 2 && !/^[0-9]+$/.test(w))
        .slice(0, 8); // Take first 8 keywords
      
      console.log(`Searching KB with keywords: ${keywords.join(', ')}`);
      
      if (keywords.length > 0) {
        // Build OR conditions for each keyword searching in title and content
        const orConditions = keywords
          .map((k) => `title.ilike.%${k}%,content_text.ilike.%${k}%`)
          .join(',');
        
        const { data: keywordResults, error: kwError } = await supabase
          .from("knowledge_base")
          .select("id, title, content_text, category, source_name")
          .eq("is_active", true)
          .or(orConditions)
          .limit(15);

        if (!kwError && keywordResults && keywordResults.length > 0) {
          // Score results by how many keywords they match
          interface ScoredResult extends KBSearchResult {
            rank: number;
          }
          
          const scoredResults: ScoredResult[] = keywordResults.map((r) => {
            let score = 0;
            const titleLower = (r.title || '').toLowerCase();
            const contentLower = (r.content_text || '').toLowerCase();
            
            for (const kw of keywords) {
              const kwLower = kw.toLowerCase();
              if (titleLower.includes(kwLower)) score += 2; // Title match is worth more
              if (contentLower.includes(kwLower)) score += 1;
            }
            return { ...r, rank: score / (keywords.length * 3) };
          });
          
          // Sort by score and take top 5
          topResults = scoredResults
            .sort((a, b) => b.rank - a.rank)
            .slice(0, 5);
          
          console.log(`Found ${keywordResults.length} results, using top ${topResults.length}`);
        }
      }
      
      // Fallback: try full-text search if keyword search found nothing
      if (topResults.length === 0) {
        const { data: searchResults, error: searchError } = await supabase.rpc(
          "search_knowledge_base",
          { search_query: message, result_limit: 10 }
        );
        
        if (!searchError && searchResults && searchResults.length > 0) {
          topResults = searchResults
            .filter((r: KBSearchResult) => r.rank > 0.001)
            .slice(0, 5);
          console.log(`Fallback FTS found ${topResults.length} results`);
        }
      }

      if (topResults.length > 0) {
        console.log(`Final KB context: ${topResults.length} documents`);
        kbContext = topResults.map((r: KBSearchResult, i: number) => 
          `[${i + 1}] ${r.title} (${r.category}, ${r.source_name || "N/A"}):\n${r.content_text.substring(0, 2000)}`
        ).join("\n\n---\n\n");
      } else {
        console.log("No KB results found for query");
      }
    } catch (searchErr) {
      console.error("Knowledge base search error:", searchErr);
    }

    // Search legal practice database for relevant court decisions
    let practiceContext = "";
    try {
      const keywords = message
        .split(/\s+/)
        .filter((w) => w.length > 2 && !/^[0-9]+$/.test(w))
        .slice(0, 6);

      console.log(`Searching legal practice with keywords: ${keywords.join(', ')}`);

      // First, get all active practice items (limited) - ILIKE with Armenian Unicode has issues
      // So we'll fetch and filter in memory
      const { data: practiceResults, error: practiceErr } = await supabase
        .from("legal_practice_kb")
        .select("id, title, content_text, practice_category, court_type, outcome, legal_reasoning_summary, applied_articles, key_violations")
        .eq("is_active", true)
        .limit(50);

      console.log(`Legal practice fetched: ${practiceResults?.length || 0} items, error: ${practiceErr?.message || 'none'}`);

      if (!practiceErr && practiceResults && practiceResults.length > 0) {
        // Score and sort by relevance - search in memory
        const scored = practiceResults.map((r: LegalPracticeResult) => {
          let score = 0;
          const titleLower = (r.title || '').toLowerCase();
          const contentLower = (r.content_text || '').toLowerCase();
          const reasoningLower = (r.legal_reasoning_summary || '').toLowerCase();

          for (const kw of keywords) {
            const kwLower = kw.toLowerCase();
            if (titleLower.includes(kwLower)) score += 3;
            if (reasoningLower.includes(kwLower)) score += 2;
            if (contentLower.includes(kwLower)) score += 1;
          }
          return { ...r, score };
        });

        console.log(`Scored ${scored.length} practice items, scores: ${scored.map(s => s.score).join(', ')}`);

        let topPractice = scored
          .filter((r) => r.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);

        // Fallback: if no keyword matches but we have practice items, include top 3 anyway
        // This ensures users can get practice info even with non-matching queries
        if (topPractice.length === 0 && scored.length > 0) {
          console.log("No keyword matches in practice, using fallback (first 3 items)");
          topPractice = scored.slice(0, 3);
        }

        if (topPractice.length > 0) {
          console.log(`Using ${topPractice.length} legal practice results`);
          
          practiceContext = topPractice.map((r, i) => {
            const articles = r.applied_articles ? JSON.stringify(r.applied_articles) : "\u0546/\u0531";
            const violations = r.key_violations?.join(", ") || "\u0546/\u0531";
            // Include full decision text for comprehensive analysis
            const fullText = r.content_text || '';
            return `[\u054A\u0580\u0561\u056F\u057F\u056B\u056F\u0561 ${i + 1}] ${r.title}
\u0534\u0561\u057F\u0561\u0580\u0561\u0576: ${r.court_type} | \u053F\u0561\u057F\u0565\u0563\u0578\u0580\u056B\u0561: ${r.practice_category} | \u0535\u056C\u0584: ${r.outcome}
\u053F\u056B\u0580\u0561\u057C\u057E\u0561\u056E \u0570\u0578\u0564\u057E\u0561\u056E\u0576\u0565\u0580: ${articles}
\u0540\u056B\u0574\u0576\u0561\u056F\u0561\u0576 \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580: ${violations}
\u053B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0570\u056B\u0574\u0576\u0561\u057E\u0578\u0580\u0578\u0582\u0574: ${r.legal_reasoning_summary || "\u0546/\u0531"}

**\u0548\u0550\u0548\u0547\u0544\u0531\u0546 \u053C\u053B\u0531\u0550\u053A\u0531\u053F\u0531\u0546 \u054F\u0535\u053F\u054D\u054F:**
${fullText}`;
          }).join("\n\n---\n\n");
        }
      }
    } catch (practiceErr) {
      console.error("Legal practice search error:", practiceErr);
    }

    // Build the final prompt with context
    const systemPromptWithContext = LEGAL_AI_SYSTEM_PROMPT
      .replace("{CONTEXT}", kbContext || "\u0533\u056B\u057F\u0565\u056C\u056B\u0584\u0576\u0565\u0580\u056B \u0562\u0561\u0566\u0561\u0575\u0578\u0582\u0574 \u0570\u0561\u0574\u0561\u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576 \u057F\u0565\u0572\u0565\u056F\u0561\u057F\u057E\u0578\u0582\u0569\u0575\u0578\u0582\u0576 \u0579\u056B \u0563\u057F\u0576\u057E\u0565\u056C\u0589")
      .replace("{PRACTICE_CONTEXT}", practiceContext || "\u0534\u0561\u057F\u0561\u056F\u0561\u0576 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561\u0575\u056B \u0570\u0561\u0574\u0561\u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576 \u0578\u0580\u0578\u0577\u0578\u0582\u0574\u0576\u0565\u0580 \u0579\u0565\u0576 \u0563\u057F\u0576\u057E\u0565\u056C\u0589")
      .replace("{USER_MESSAGE}", message);

    // Build messages array with conversation history
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPromptWithContext }
    ];

    // Add conversation history if provided
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory) {
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // Add current message
    messages.push({ role: "user", content: message });

    // Call Lovable AI Gateway
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages,
        temperature: 0.2,
        max_tokens: 4000,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "\u0540\u0561\u0580\u0581\u0578\u0582\u0574\u0576\u0565\u0580\u056B \u057D\u0561\u0570\u0574\u0561\u0576\u0568 \u0563\u0565\u0580\u0561\u0566\u0561\u0576\u0581\u057E\u0565\u0581\u0589 \u053D\u0576\u0564\u0580\u0578\u0582\u0574 \u0565\u0576\u0584 \u0583\u0578\u0580\u0571\u0565\u056C \u0561\u057E\u0565\u056C\u056B \u0578\u0582\u0577\u0589" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "\u0540\u0561\u0577\u057E\u056B \u0574\u056B\u057B\u0578\u0581\u0576\u0565\u0580\u0568 \u057D\u057A\u0561\u057C\u057E\u0565\u056C \u0565\u0576\u0589" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "\u054D\u056D\u0561\u056C \u0561\u057C\u0561\u057B\u0561\u0581\u0561\u057E\u0589 \u053D\u0576\u0564\u0580\u0578\u0582\u0574 \u0565\u0576\u0584 \u0576\u0578\u0580\u056B\u0581\u0589" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log API usage
    try {
      await supabase.rpc("log_api_usage", {
        _service_type: "legal_chat",
        _model_name: "google/gemini-2.5-pro",
        _tokens_used: null,
        _estimated_cost: 0.003,
        _metadata: { message_length: message.length, has_context: !!kbContext, has_practice: !!practiceContext }
      });
    } catch (logErr) {
      console.error("Failed to log API usage:", logErr);
    }

    // Return streaming response
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (error) {
    console.error("Legal chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
