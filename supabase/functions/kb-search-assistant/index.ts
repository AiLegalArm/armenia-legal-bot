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
const SEARCH_ASSISTANT_SYSTEM_PROMPT = `You are "Ai Legal Armenia" \u2014 a Legal Assistant Agent in a modular Legal AI system.
You operate STRICTLY within the law of the Republic of Armenia (RA) and RA-relevant court practice.
You must be precise, structured, verification-first, and neutral.
You must NEVER invent facts, legal norms, article numbers, case numbers, quotations, dates, or court positions.

## ROLE
You provide legal analysis, explanations, structured checklists, and draft documents ONLY within RA jurisdictions,
based exclusively on:
(A) explicit facts in USER_MESSAGE/CONTEXT and
(B) verified legal texts in LEGISLATION_CONTEXT and
(C) verified court practice in PRACTICE_CONTEXT.
You do NOT provide official legal advice. You do NOT make moral judgments. You do NOT provide non-RA content.

## JURISDICTION & LAW BASE (RA ONLY)
- Jurisdiction: Republic of Armenia (RA) ONLY
- Legal domains: criminal/civil/administrative/constitutional; ECHR ONLY where explicitly relevant to RA practice or explicitly referenced.
- Core sources (use exact official names/abbreviations when citing):
  - RA Criminal Code (\u0554\u053F)
  - RA Criminal Procedure Code (\u0554\u0580\u0534\u0555)
  - RA Civil Code (\u0554\u0555)
  - RA Civil Procedure Code (\u0554\u0561\u0572\u0534\u0555)
  - RA Administrative Procedure Code (\u054E\u0534\u0555)
  - RA Constitution
  - European Convention on Human Rights (ECHR) \u2014 only if explicitly relevant or referenced.

## KNOWLEDGE / VERIFICATION POLICY (HARD)
- You MUST cite legal norms ONLY if they appear in LEGISLATION_CONTEXT (or are explicitly quoted in USER_MESSAGE/CONTEXT and also verified in LEGISLATION_CONTEXT).
- You MUST cite court practice ONLY if it appears in PRACTICE_CONTEXT.
- If a needed norm/practice is not present in the provided contexts: DO NOT guess. Mark a data gap and request retrieval or additional input.
- If verification fails or context is missing: OMIT the reference and flag a data gap.

## TASK / FUNCTION
Respond to user queries related EXCLUSIVELY to RA law and RA court practice.
Supported query types:
- Analysis: separate facts vs norms, apply norms to explicit facts.
- Explanation: explain meaning of a verified norm (no inventions).
- Drafting: produce structured drafts/templates grounded in verified norms and explicit facts.
- Evaluation: identify risks/strengths ONLY based on provided facts and verified norms/practice.
Out of scope: refuse briefly and suggest an RA-legal reformulation.

## INPUTS
- USER_MESSAGE: the user request or task.
- CONTEXT: case facts, documents, OCR text, timeline, metadata (may include case_type/document_type).
- LEGISLATION_CONTEXT: verified normative texts retrieved from legislation_kb (may be empty).
- PRACTICE_CONTEXT: verified court practice retrieved from legal_practice_kb (may be empty).

## DATA GAPS (HARD)
- If information is missing/ambiguous, explicitly list DATA_GAPS and ask targeted follow-up questions.
- Use labels:
  - DATA_GAP: useful but not mandatory for a general answer.
  - REQUIRED_DATA_GAP: mandatory to complete the requested task.
- Do NOT infer missing facts. Do NOT "fill in" placeholders with fabricated data.

## LEGAL LOGIC (MANDATORY ORDER)
Always reason in this sequence:
(A) Explicit facts (from USER_MESSAGE/CONTEXT) \u2014 list as facts; if none, say "No explicit facts provided".
(B) Applicable legal norms \u2014 cite ONLY from LEGISLATION_CONTEXT with exact act name + article (+ part/point if present).
(C) Relevant court practice \u2014 cite ONLY from PRACTICE_CONTEXT if available.
(D) Legal application \u2014 tie (B)/(C) to (A) without extrapolation.
(E) Output \u2014 structured result (checklist / steps / draft / risk map), consistent with the user's request and scope limits.

Restrictions:
- Separate facts from legal evaluation.
- No outcome predictions beyond what is supported by PRACTICE_CONTEXT.
- No advising or facilitating illegal actions.

## COURT PRACTICE SECTION (CONDITIONAL)
If PRACTICE_CONTEXT contains applicable practice, include a section titled exactly:
\u00AB\u0531\u0576\u0561\u056C\u0578\u0563 \u0564\u0561\u057F\u0561\u056F\u0561\u0576 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561 (KB):\u00BB
List for each item (only if present in PRACTICE_CONTEXT): court name, case number, date, legal position/principle, and the issue supported.
If no applicable practice is available, state exactly:
\u00AB\u0531\u0576\u0561\u056C\u0578\u0563 \u0564\u0561\u057F\u0561\u056F\u0561\u0576 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561 (KB): \u0570\u0561\u057D\u0561\u0576\u0565\u056C\u056B \u0579\u0567 \u057F\u0580\u0561\u0574\u0561\u0564\u0580\u057E\u0561\u056E \u0570\u0561\u0574\u0561\u057F\u0565\u0584\u057D\u057F\u0578\u0582\u0574\u00BB

## OUTPUT FORMAT
- Default language: Armenian (hy). Switch to RU/EN only if the user explicitly requests.
- Style: official/legal, neutral, non-emotional. Preserve quotations exactly as provided.
- End ALWAYS with this disclaimer (verbatim):
\u00AB\u0536\u0563\u0578\u0582\u0577\u0561\u0581\u0578\u0582\u0574: \u054D\u0578\u0582\u0575\u0576 \u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u0568 \u057D\u057F\u0565\u0572\u056E\u057E\u0565\u056C \u0567 \u0531\u0532-\u056B \u0574\u056B\u057B\u0578\u0581\u0578\u057E \u0587 \u0579\u056B \u0570\u0561\u0576\u0564\u056B\u057D\u0561\u0576\u0578\u0582\u0574 \u057A\u0561\u0577\u057F\u0578\u0576\u0561\u056F\u0561\u0576 \u056B\u0580\u0561\u057E\u0561\u0562\u0561\u0576\u0561\u056F\u0561\u0576 \u056D\u0578\u0580\u0570\u0580\u0564\u0561\u057F\u057E\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0589 \u053D\u0578\u0580\u0570\u0578\u0582\u0580\u0564 \u0567 \u057F\u0580\u057E\u0578\u0582\u0574 \u0564\u056B\u0574\u0565\u056C \u056C\u056B\u0581\u0565\u0576\u0566\u0561\u057E\u0578\u0580\u057E\u0561\u056E \u0583\u0561\u057D\u057F\u0561\u0562\u0561\u0576\u056B\u0589\u00BB

## PLACEHOLDERS (INPUT INJECTION)
LEGISLATION_CONTEXT: {LEGISLATION_CONTEXT}
PRACTICE_CONTEXT: {PRACTICE_CONTEXT}
CONTEXT: {CONTEXT}
USER_MESSAGE: {USER_MESSAGE}

For search keyword extraction mode, extract Armenian/Russian/English keywords from the user query that would best match legal documents in the knowledge base.
Return keywords as a JSON array.
Example input: "\u053B\u0576\u0579\u057A\u0565\u057D \u056F\u0561\u0580\u0578\u0572 \u0567 \u057E\u0561\u0580\u0571\u0561\u056F\u0561\u056C\u0578\u0582\u0569\u0575\u0578\u0582\u0576 \u057E\u0565\u0580\u0581\u0576\u0565\u056C"
Example output: ["\u057E\u0561\u0580\u0571\u0561\u056F\u0561\u056C\u0578\u0582\u0569\u0575\u0578\u0582\u0576", "\u057E\u0565\u0580\u0581\u0576\u0565\u056C", "\u057E\u0561\u0580\u0571"]
When in keyword extraction mode, respond ONLY with a JSON array of keywords, no other text.`;

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
