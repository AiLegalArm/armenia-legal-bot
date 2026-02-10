// -*- coding: utf-8 -*-
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// =======================================
// Types
// =======================================

type PracticeCategory = "criminal" | "civil" | "administrative" | "constitutional" | "echr";
type CourtType = "first_instance" | "appeal" | "cassation" | "constitutional" | "echr";
type Outcome = "granted" | "rejected" | "partial" | "remanded" | "discontinued";
type AppliedCode =
  | "criminal_code"
  | "civil_code"
  | "administrative_code"
  | "criminal_procedure_code"
  | "civil_procedure_code"
  | "administrative_procedure_code"
  | "constitution"
  | "echr";

interface ExtractedData {
  title: string | null;
  practice_category: PracticeCategory | null;
  court_type: CourtType | null;
  outcome: Outcome | null;
  court_name: string | null;
  case_number: string | null;
  decision_date: string | null;
  applied_articles: Record<string, unknown>;
  key_violations: string[];
  legal_reasoning_summary: string | null;
  content_text: string;
}

// =======================================
// Runtime validation (strict, no deps)
// =======================================

const PRACTICE: Set<string> = new Set(["criminal", "civil", "administrative", "constitutional", "echr"]);
const COURT: Set<string> = new Set(["first_instance", "appeal", "cassation", "constitutional", "echr"]);
const OUTCOME: Set<string> = new Set(["granted", "rejected", "partial", "remanded", "discontinued"]);
const APPLIED: Set<string> = new Set([
  "criminal_code",
  "civil_code",
  "administrative_code",
  "criminal_procedure_code",
  "civil_procedure_code",
  "administrative_procedure_code",
  "constitution",
  "echr",
]);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isEnumOrNull(v: unknown, set: Set<string>): boolean {
  return v === null || (typeof v === "string" && set.has(v));
}

function isISODateOrNull(v: unknown): boolean {
  if (v === null) return true;
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2100) return false;
  if (mo < 1 || mo > 12) return false;
  if (d < 1 || d > 31) return false;
  return true;
}

function validateExtractedData(raw: unknown): ExtractedData {
  if (!isObject(raw)) throw new Error("Invalid JSON: root is not an object");

  const requiredKeys: Array<keyof ExtractedData> = [
    "title",
    "practice_category",
    "court_type",
    "outcome",
    "court_name",
    "case_number",
    "decision_date",
    "applied_articles",
    "key_violations",
    "legal_reasoning_summary",
    "content_text",
  ];

  for (const k of Object.keys(raw)) {
    if (!requiredKeys.includes(k as keyof ExtractedData)) {
      throw new Error(`Invalid JSON: extra key "${k}"`);
    }
  }

  for (const k of requiredKeys) {
    if (!(k in raw)) throw new Error(`Invalid JSON: missing key "${k}"`);
  }

  if (!isStringOrNull(raw.title)) throw new Error("Invalid: title");
  if (!isEnumOrNull(raw.practice_category, PRACTICE)) throw new Error("Invalid: practice_category");
  if (!isEnumOrNull(raw.court_type, COURT)) throw new Error("Invalid: court_type");
  if (!isEnumOrNull(raw.outcome, OUTCOME)) throw new Error("Invalid: outcome");
  if (!isStringOrNull(raw.court_name)) throw new Error("Invalid: court_name");
  if (!isStringOrNull(raw.case_number)) throw new Error("Invalid: case_number");
  if (!isISODateOrNull(raw.decision_date)) throw new Error("Invalid: decision_date");
  if (!isStringOrNull(raw.legal_reasoning_summary)) throw new Error("Invalid: legal_reasoning_summary");
  if (typeof raw.content_text !== "string") throw new Error("Invalid: content_text");

  // Validate applied_articles — accept new {sources:[...]} format or legacy array format
  if (isObject(raw.applied_articles)) {
    // New format: {sources: [{act, articles: [{article, part, point, context}]}]}
    const aa = raw.applied_articles as Record<string, unknown>;
    if (!Array.isArray(aa.sources)) {
      (raw as Record<string, unknown>).applied_articles = { sources: [] };
    }
  } else if (Array.isArray(raw.applied_articles)) {
    // Legacy format — wrap or keep as-is (stored as JSON anyway)
    (raw as Record<string, unknown>).applied_articles = { sources: [] };
  } else {
    (raw as Record<string, unknown>).applied_articles = { sources: [] };
  }

  if (!isStringArray(raw.key_violations)) throw new Error("Invalid: key_violations");

  return raw as ExtractedData;
}

// =======================================
// System prompt (production-grade)
// =======================================

const DECISION_EXTRACTOR_SYSTEM_PROMPT = `You are a Legal Document Analyzer Agent for the Republic of Armenia (RA).
Your role is strictly limited to extracting structured metadata from a provided court decision text.

HARD RULES
1) Extraction-only: use ONLY explicit information present in the text.
2) No inventions, no guessing, no "best effort" completion, no correction of the text.
3) No translation. Preserve the original language (HY/RU/EN) in all VALUES.
4) Output: return ONLY a valid JSON object matching the exact schema. No markdown, no comments, no extra keys.
5) Missing/ambiguous data:
   - Scalars -> null
   - Arrays -> []
   - Never output placeholders like "_____", "N/A", "delays".
6) Allowed transformations are limited to:
   - decision_date normalization to YYYY-MM-DD if the decision date is explicit and unambiguous
   - content_text light cleanup (remove obvious duplicate headers/footers only if clearly repeated; preserve paragraph breaks)

ENUMS (no match -> null)
- practice_category: "criminal" | "civil" | "administrative" | "constitutional" | "echr"
- court_type: "first_instance" | "appeal" | "cassation" | "constitutional" | "echr"
- outcome: "granted" | "rejected" | "partial" | "remanded" | "discontinued"

CATEGORIZATION POLICY (STRICT KEYWORD MATCHING ONLY; do not assume)
- practice_category:
  - echr: explicit "\u0544\u053B\u0535\u0534" / "ECHR" / "European Court of Human Rights"
  - constitutional: explicit "\u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576"
  - administrative: explicit "\u054E\u0561\u0580\u0579\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576" / "\u054E\u0534\u0555" / "\u057E\u0561\u0580\u0579\u0561\u056F\u0561\u0576 \u0563\u0578\u0580\u056E"
  - criminal: explicit "\u0584\u0580\u0565\u0561\u056F\u0561\u0576" / "\u0554\u053F" / "\u0554\u0580\u0534\u0555" / "\u0584\u0580\u0565\u0561\u056F\u0561\u0576 \u0563\u0578\u0580\u056E"
  - civil: explicit "\u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576" / "\u0554\u0555" / "\u0554\u0561\u0572\u0534\u0555" / "\u0570\u0561\u0575\u0581" / "\u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576 \u0563\u0578\u0580\u056E"
  - If multiple match and primary is not explicit -> null

- court_type:
  - echr: deciding body is ECHR/\u0544\u053B\u0535\u0534
  - constitutional: "\u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576"
  - cassation: "\u054E\u0573\u057C\u0561\u0562\u0565\u056F"
  - appeal: "\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579"
  - first_instance: explicit first instance wording (e.g., "\u0531\u057C\u0561\u057B\u056B\u0576 \u0561\u057F\u0575\u0561\u0576", or an \u0568\u0576\u0564\u0570\u0561\u0576\u0578\u0582\u0580 \u056B\u0580\u0561\u057E\u0561\u057D\u0578\u0582\u0569\u0575\u0561\u0576 court acting as first instance)
  - Otherwise -> null

- outcome: must be explicit in the operative/dispositive part; otherwise null

FIELD INSTRUCTIONS
- title: prefer official header; otherwise create a concise descriptive title using ONLY explicit text; keep language consistent with the decision.
- court_name: exact court name as written.
- case_number: extract the main case number exactly as written in the text. Do NOT anonymize or redact any part of it.
- decision_date: pick the explicit decision/act issuance date (e.g., "\u0578\u0580\u0578\u0577\u0578\u0582\u0574", "\u057E\u0573\u056B\u057C"). If unclear or multiple conflicting dates -> null.
- applied_articles: extract only explicit references (e.g. "61-\u0580\u0564 \u0570\u0578\u0564\u057E\u0561\u056E", "\u0570\u0578\u0564\u057E\u0561\u056E 61", "61-\u0580\u0564 \u0570\u0578\u0564\u057E\u0561\u056E\u056B 1-\u056B\u0576 \u0574\u0561\u057D"). Do NOT invent articles. Group by legal act name. For each article include 1-2 sentences of context from surrounding text (max 300 chars). Remove duplicates.
  Output format for applied_articles:
  {"sources":[{"act":"<legal act name e.g. \u0554\u0580\u0565\u0561\u056F\u0561\u0576 \u0585\u0580\u0565\u0576\u057D\u0563\u056B\u0580\u0584>","articles":[{"article":"<number only>","part":"<number or empty>","point":"<number or empty>","context":"<max 300 chars from text>"}]}]}
  Use the actual Armenian name of the legal act as it appears in the text. If no articles found: {"sources":[]}
- key_violations: include only explicit violation/issue phrases present in text; otherwise [].
- legal_reasoning_summary: 2\u20133 sentences, faithful, strictly based on explicit reasoning; no new facts; if insufficient text -> null.
- content_text: full text with minimal cleanup; preserve breaks, citations, names and all personal data as-is. Do NOT anonymize or redact anything.

CRITICAL: All string values in your JSON output MUST use actual UTF-8 Armenian characters, NOT unicode escape sequences like \\u0555. Write real Armenian letters.

OUTPUT SCHEMA (EXACT KEYS, NO EXTRA KEYS)
{
  "title": string|null,
  "practice_category": "criminal"|"civil"|"administrative"|"constitutional"|"echr"|null,
  "court_type": "first_instance"|"appeal"|"cassation"|"constitutional"|"echr"|null,
  "outcome": "granted"|"rejected"|"partial"|"remanded"|"discontinued"|null,
  "court_name": string|null,
  "case_number": string|null,
  "decision_date": string|null,
  "applied_articles": {"sources":[{"act":"...","articles":[{"article":"...","part":"...","point":"...","context":"..."}]}]},
  "key_violations": ["..."],
  "legal_reasoning_summary": string|null,
  "content_text": string
}`;

// =======================================
// AI extractor
// =======================================

async function extractWithAI(textContent: string, apiKey: string): Promise<ExtractedData> {
  const input = (textContent ?? "").trim();
  if (!input) {
    return {
      title: null,
      practice_category: null,
      court_type: null,
      outcome: null,
      court_name: null,
      case_number: null,
      decision_date: null,
      applied_articles: { sources: [] },
      key_violations: [],
      legal_reasoning_summary: null,
      content_text: "",
    };
  }

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      temperature: 0,
      messages: [
        { role: "system", content: DECISION_EXTRACTOR_SYSTEM_PROMPT },
        { role: "user", content: input.substring(0, 50000) },
      ],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`AI extraction failed: ${resp.status} ${resp.statusText} ${errText}`);
  }

  const payload = await resp.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("AI extraction failed: empty model content");
  }

  // Parse JSON from response (handle markdown code blocks)
  let jsonStr = content.trim();
  if (jsonStr.startsWith("```json")) {
    jsonStr = jsonStr.slice(7);
  }
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith("```")) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error("AI extraction failed: response is not valid JSON");
  }

  return validateExtractedData(parsed);
}

// =======================================
// Targeted extraction for missing fields only
// =======================================

async function extractMissingWithAI(
  textContent: string,
  missingFields: string[],
  apiKey: string
): Promise<Record<string, unknown>> {
  // Use only first 15K chars — metadata is usually in the header
  const input = (textContent ?? "").trim().substring(0, 15000);
  if (!input) return {};

  const fieldInstructions: Record<string, string> = {
    title: '"title": string — official header or concise descriptive title',
    practice_category: '"practice_category": "criminal"|"civil"|"administrative"|"constitutional"|"echr"|null',
    court_type: '"court_type": "first_instance"|"appeal"|"cassation"|"constitutional"|"echr"|null',
    outcome: '"outcome": "granted"|"rejected"|"partial"|"remanded"|"discontinued"|null',
    court_name: '"court_name": string — exact court name as written',
    case_number: '"case_number": string — case number exactly as written, no anonymization',
    decision_date: '"decision_date": string — YYYY-MM-DD format or null',
    applied_articles: '"applied_articles": {"sources":[{"act":"<legal act name>","articles":[{"article":"<number>","part":"<number or empty>","point":"<number or empty>","context":"<max 300 chars>"}]}]}',
    key_violations: '"key_violations": ["..."] — explicit violation phrases from text',
    legal_reasoning_summary: '"legal_reasoning_summary": string — 2-3 sentences of explicit reasoning',
  };

  const schema = missingFields.map((f) => fieldInstructions[f] || `"${f}": unknown`).join(",\n  ");

  const prompt = `Extract ONLY these fields from the court decision text. Return valid JSON with exactly these keys. Use null for missing scalars, [] for missing arrays. No markdown, no extra keys.

{
  ${schema}
}

CRITICAL RULES:
1. Extraction-only, no guessing, no translation.
2. PRESERVE THE ORIGINAL LANGUAGE of the document in ALL values. If the text is in Armenian, all extracted strings MUST be in Armenian. If in Russian, keep Russian. NEVER translate to English.
3. All string values must use actual UTF-8 characters, not unicode escapes.`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      temperature: 0,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: input },
      ],
    }),
  });

  if (!resp.ok) {
    console.error(`AI extraction failed: ${resp.status}`);
    return {};
  }

  const payload = await resp.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) return {};

  let jsonStr = content.trim();
  if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
  if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
  if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
  jsonStr = jsonStr.trim();

  try {
    const parsed = JSON.parse(jsonStr);
    if (!isObject(parsed)) return {};
    // Validate applied_articles — accept new {sources:[...]} format
    if (isObject(parsed.applied_articles)) {
      const aa = parsed.applied_articles as Record<string, unknown>;
      if (!Array.isArray(aa.sources)) {
        parsed.applied_articles = { sources: [] };
      }
    } else if (!Array.isArray(parsed.applied_articles)) {
      parsed.applied_articles = { sources: [] };
    }
    // Validate enums
    if (parsed.practice_category && !PRACTICE.has(parsed.practice_category as string)) parsed.practice_category = null;
    if (parsed.court_type && !COURT.has(parsed.court_type as string)) parsed.court_type = null;
    if (parsed.outcome && !OUTCOME.has(parsed.outcome as string)) parsed.outcome = null;
    if (parsed.decision_date && !isISODateOrNull(parsed.decision_date)) parsed.decision_date = null;
    return parsed;
  } catch {
    return {};
  }
}

// =======================================
// HTTP handler
// =======================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // === AUTH GUARD (Prevent Anonymous Access) ===
    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await sb.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // === END AUTH GUARD ===

    const { textContent, fileName, enrichDocId } = await req.json();

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminDb = createClient(supabaseUrl, supabaseServiceKey);

    // === ENRICH MODE: update existing record (only missing fields) ===
    if (enrichDocId) {
      const { data: existingDoc, error: fetchErr } = await adminDb
        .from("legal_practice_kb")
        .select("id, content_text, title, practice_category, court_type, outcome, court_name, case_number_anonymized, decision_date, applied_articles, key_violations, legal_reasoning_summary")
        .eq("id", enrichDocId)
        .single();

      if (fetchErr || !existingDoc) {
        return new Response(JSON.stringify({ error: "Document not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Determine which fields are missing
      const missingFields: string[] = [];
      const ENRICHABLE = [
        "title", "practice_category", "court_type", "outcome", "court_name",
        "case_number", "decision_date", "applied_articles",
        "key_violations", "legal_reasoning_summary",
      ] as const;

      // Map DB column names to AI field names
      const dbToAi: Record<string, string> = { case_number_anonymized: "case_number" };
      const aiToDb: Record<string, string> = { case_number: "case_number_anonymized" };

      for (const f of ENRICHABLE) {
        const dbCol = aiToDb[f] || f;
        const v = existingDoc[dbCol];
        if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) {
          missingFields.push(f);
        } else if (f === "applied_articles" && typeof v === "object" && !Array.isArray(v)) {
          // Check if applied_articles is {sources: []} — treat as missing
          const aa = v as Record<string, unknown>;
          if (Array.isArray(aa.sources) && aa.sources.length === 0) {
            missingFields.push(f);
          }
        }
      }

      // Skip AI entirely if all fields are populated
      if (missingFields.length === 0) {
        return new Response(JSON.stringify({ success: true, enriched: false, message: "All fields already populated" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`Enriching doc ${enrichDocId}, missing: ${missingFields.join(", ")}, text length: ${existingDoc.content_text.length}`);

      // Use targeted extraction for only missing fields
      const extractedData = await extractMissingWithAI(existingDoc.content_text, missingFields, lovableApiKey);
      console.log(`Enriched missing fields: ${JSON.stringify(extractedData)}`);

      const updatePayload: Record<string, unknown> = {};
      for (const f of missingFields) {
        const v = (extractedData as Record<string, unknown>)[f];
        if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) {
          const dbCol = aiToDb[f] || f;
          updatePayload[dbCol] = v;
        }
      }

      if (Object.keys(updatePayload).length === 0) {
        return new Response(JSON.stringify({ success: true, enriched: false, message: "No metadata extracted" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateErr } = await adminDb
        .from("legal_practice_kb")
        .update(updatePayload)
        .eq("id", enrichDocId);

      if (updateErr) throw updateErr;

      return new Response(JSON.stringify({ success: true, enriched: true, updated_fields: Object.keys(updatePayload) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === STANDARD IMPORT MODE ===
    if (!textContent) {
      return new Response(JSON.stringify({ error: "textContent is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing file: ${fileName}, length: ${textContent.length}`);
    const extractedData = await extractWithAI(textContent, lovableApiKey);
    console.log(`Extracted title: ${extractedData.title}`);

    const { data: insertedDoc, error: insertError } = await adminDb
      .from("legal_practice_kb")
      .insert({
        title: extractedData.title || 'Untitled',
        content_text: extractedData.content_text,
        practice_category: extractedData.practice_category || 'criminal',
        court_type: extractedData.court_type || 'cassation',
        outcome: extractedData.outcome || 'granted',
        court_name: extractedData.court_name,
        case_number_anonymized: extractedData.case_number,
        decision_date: extractedData.decision_date,
        applied_articles: extractedData.applied_articles,
        key_violations: extractedData.key_violations.length > 0 ? extractedData.key_violations : null,
        legal_reasoning_summary: extractedData.legal_reasoning_summary,
        is_active: true,
        is_anonymized: false,
        visibility: 'ai_only',
        source_name: fileName || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      throw insertError;
    }

    return new Response(JSON.stringify({
      success: true,
      document: insertedDoc,
      extracted: extractedData,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("legal-practice-import error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Import failed" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
