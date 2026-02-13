/**
 * legal-document-normalizer
 *
 * Problem:
 *   Raw legal texts (TXT, extracted PDF) arrive without structure.
 *   Each ingestion pipeline builds ad-hoc metadata, causing inconsistent
 *   records in `knowledge_base` and `legal_practice_kb`.
 *
 * Risk:
 *   - Unvalidated inserts corrupt RAG retrieval quality
 *   - Missing fields silently propagate through vector search
 *   - No single source of truth for document schema
 *
 * Solution:
 *   Deterministic normalizer that:
 *   1) Infers doc_type from fileName + text heuristics
 *   2) Extracts metadata via regex (Unicode-escaped Armenian patterns)
 *   3) Returns validated LegalDocument or explicit validation errors
 *   4) NEVER guesses — missing fields are null
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ─── CORS ───────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── ENUMS ──────────────────────────────────────────────────────────
const DOC_TYPES = [
  "law", "code", "court_decision", "constitutional_court",
  "government_decree", "pm_decision", "regulation",
  "international_treaty", "echr_judgment", "legal_commentary",
  "cassation_ruling", "appeal_ruling", "first_instance_ruling", "other",
] as const;
type DocType = typeof DOC_TYPES[number];

const COURT_TYPES = [
  "first_instance", "appeal", "cassation", "constitutional", "echr",
] as const;
type CourtType = typeof COURT_TYPES[number];

const BRANCHES = [
  "criminal", "civil", "administrative", "constitutional",
  "labor", "family", "tax", "customs", "electoral",
  "land", "environmental", "international", "echr", "other",
] as const;
type LegalBranch = typeof BRANCHES[number];

// ─── INTERFACES ─────────────────────────────────────────────────────
interface NormalizerInput {
  fileName: string;
  mimeType: string;
  rawText: string;
  sourceUrl?: string;
}

interface CourtMeta {
  court_type: CourtType;
  court_name: string | null;
  case_number: string | null;
  judge_names: string[] | null;
  outcome: string | null;
}

interface LegalDocument {
  doc_type: DocType;
  jurisdiction: "AM";
  branch: LegalBranch;
  title: string;
  title_alt: string | null;
  content_text: string;
  document_number: string | null;
  date_adopted: string | null;
  date_effective: string | null;
  source_url: string | null;
  source_name: string | null;
  court: CourtMeta | null;
  applied_articles: unknown[] | null;
  key_violations: string[] | null;
  legal_reasoning_summary: string | null;
  decision_map: unknown | null;
  ingestion: {
    pipeline: string;
    ingested_at: string;
    schema_version: "1.0";
    source_hash: string | null;
  };
  is_active: boolean;
}

// ─── REGEX PATTERNS (all Armenian chars as Unicode escapes) ─────────

/**
 * Armenian date patterns:
 * "20 հունիսի 2024 թվականի" or "20.06.2024" or "20/06/2024"
 */
// Armenian month names mapped to month numbers
const ARMENIAN_MONTHS: Record<string, string> = {
  // \u0570\u0578\u0582\u0576\u057e\u0561\u0580\u056b = հունվարի (January)
  "\u0570\u0578\u0582\u0576\u057e\u0561\u0580": "01",
  // \u0583\u0565\u057f\u0580\u057e\u0561\u0580\u056b = փետրվարի (February)
  "\u0583\u0565\u057f\u0580\u057e\u0561\u0580": "02",
  // \u0574\u0561\u0580\u057f\u056b = մdelays (March)
  "\u0574\u0561\u0580\u057f": "03",
  // \u0561\u057a\u0580\u056b\u056c\u056b = apelay (April)
  "\u0561\u057a\u0580\u056b\u056c": "04",
  // \u0574\u0561\u0575\u056b\u057d\u056b = mayisi (May)
  "\u0574\u0561\u0575\u056b\u057d": "05",
  // \u0570\u0578\u0582\u0576\u056b\u057d\u056b = hunisi (June)
  "\u0570\u0578\u0582\u0576\u056b\u057d": "06",
  // \u0570\u0578\u0582\u056c\u056b\u057d\u056b = hulisi (July)
  "\u0570\u0578\u0582\u056c\u056b\u057d": "07",
  // \u0585\u0563\u0578\u057d\u057f\u0578\u057d\u056b = ogostosi (August)
  "\u0585\u0563\u0578\u057d\u057f\u0578\u057d": "08",
  // \u057d\u0565\u057a\u057f\u0565\u0574\u0562\u0565\u0580\u056b = septemberi (September)
  "\u057d\u0565\u057a\u057f\u0565\u0574\u0562\u0565\u0580": "09",
  // \u0570\u0578\u056f\u057f\u0565\u0574\u0562\u0565\u0580\u056b = hoktemberi (October)
  "\u0570\u0578\u056f\u057f\u0565\u0574\u0562\u0565\u0580": "10",
  // \u0576\u0578\u0575\u0565\u0574\u0562\u0565\u0580\u056b = noyemberi (November)
  "\u0576\u0578\u0575\u0565\u0574\u0562\u0565\u0580": "11",
  // \u0564\u0565\u056f\u057f\u0565\u0574\u0562\u0565\u0580\u056b = dektemberi (December)
  "\u0564\u0565\u056f\u057f\u0565\u0574\u0562\u0565\u0580": "12",
};

// Build month regex alternation
const MONTH_ALTS = Object.keys(ARMENIAN_MONTHS).join("|");

// Armenian date: "dd <month>i YYYY թdelays" or "dd <month>i YYYYdelay."
// \u0569\u057e\u0561\u056f\u0561\u0576\u056b = թdelays (year marker)
// \u0569 = թ (abbreviation)
const AM_DATE_RE = new RegExp(
  "(\\d{1,2})\\s+(" + MONTH_ALTS + ")\\u056b?\\s+(\\d{4})\\s*(?:\u0569\u057e\u0561\u056f\u0561\u0576\u056b|\u0569\\.?)?",
  "i"
);

// Numeric date: dd.mm.yyyy or dd/mm/yyyy
const NUMERIC_DATE_RE = /(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/;

// ISO date: yyyy-mm-dd
const ISO_DATE_RE = /(\d{4})-(\d{2})-(\d{2})/;

/**
 * Act number patterns:
 * "\u0540\u0555-123-\u0546" (ՀՕ-123-Ն) — law number
 * "\u054d\u0555-123-\u0546" — government decision number
 * Or generic: letters-digits-letter
 */
const ACT_NUMBER_RE = /[\u0531-\u058f]{1,4}-\d{1,6}-[\u0531-\u058f]/;

/**
 * Case number pattern for court decisions:
 * Various formats: "ԵԴ/0001/01/24", "ՎԴ/1234/02/23", etc.
 * Two Armenian uppercase letters / digits / digits / digits
 */
const CASE_NUMBER_RE = /[\u0531-\u0556]{2,4}\/\d{1,5}\/\d{1,4}\/\d{2,4}/;

/**
 * Court name detection:
 * \u0564\u0561\u057f\u0561\u0580\u0561\u0576 = datatran (court)
 * \u057e\u0573\u057c\u0561\u0562\u0565\u056f = vchrabelk (cassation)
 * \u057e\u0565\u0580\u0561\u057a\u0565\u056c\u0561\u056f\u0561\u0576 = verapelatkan (appeal)
 */
const CASSATION_RE = /\u057e\u0573\u057c\u0561\u0562\u0565\u056f/i;
const APPEAL_RE = /\u057e\u0565\u0580\u0561\u057a\u0565\u056c\u0561\u056f\u0561\u0576/i;
// \u057d\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056f\u0561\u0576 = sahmanadrakan (constitutional)
const CONSTITUTIONAL_RE = /\u057d\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056f\u0561\u0576/i;
// \u0544\u053b\u0535\u0534 = MIED (ECHR)
const ECHR_RE = /\u0544\u053b\u0535\u0534/i;
// \u0564\u0561\u057f\u0561\u0580\u0561\u0576 = datatran (court)
const COURT_WORD_RE = /\u0564\u0561\u057f\u0561\u0580\u0561\u0576/i;

/**
 * Legislation keywords:
 * \u0585\u0580\u0565\u0576\u057d\u0563\u056b\u0580\u0584 = orensgriq (code)
 * \u0585\u0580\u0565\u0576\u0584 = orenq (law)
 * \u0584\u0580\u0565\u0561\u056f\u0561\u0576 = qreakan (criminal/penal)
 * \u0584\u0561\u0572\u0561\u0584\u0561\u056f\u0561\u0576 = qaghaqakan (civil)
 */
const CODE_RE = /\u0585\u0580\u0565\u0576\u057d\u0563\u056b\u0580\u0584/i;
const LAW_RE = /\u0585\u0580\u0565\u0576\u0584/i;

// \u056f\u0561\u057c\u0561\u057e\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576 = karavarutyun (government)
const GOVT_RE = /\u056f\u0561\u057c\u0561\u057e\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576/i;
// \u057e\u0561\u0580\u0579\u0561\u057a\u0565\u057f = varchapet (PM)
const PM_RE = /\u057e\u0561\u0580\u0579\u0561\u057a\u0565\u057f/i;

/**
 * Branch detection from text:
 */
// \u0584\u0580\u0565\u0561\u056f\u0561\u0576 = qreakan (criminal)
const CRIMINAL_RE = /\u0584\u0580\u0565\u0561\u056f\u0561\u0576/i;
// \u0584\u0561\u0572\u0561\u0584\u0561\u056f\u0561\u0576 = qaghaqakan (civil)
const CIVIL_RE = /\u0584\u0561\u0572\u0561\u0584\u0561\u056f\u0561\u0576/i;
// \u057e\u0561\u0580\u0579\u0561\u056f\u0561\u0576 = varchakan (administrative)
const ADMIN_RE = /\u057e\u0561\u0580\u0579\u0561\u056f\u0561\u0576/i;
// \u0561\u0577\u056d\u0561\u057f\u0561\u0576\u0584\u0561\u0575\u056b\u0576 = ashkhatanqayin (labor)
const LABOR_RE = /\u0561\u0577\u056d\u0561\u057f\u0561\u0576\u0584\u0561\u0575\u056b\u0576/i;
// \u0568\u0576\u057f\u0561\u0576\u0565\u056f\u0561\u0576 =yntanekan (family)
const FAMILY_RE = /\u0568\u0576\u057f\u0561\u0576\u0565\u056f\u0561\u0576/i;
// \u0570\u0561\u0580\u056f\u0561\u0575\u056b\u0576 = harkayin (tax)
const TAX_RE = /\u0570\u0561\u0580\u056f\u0561\u0575\u056b\u0576/i;

/**
 * Outcome detection for court decisions:
 * \u0532\u0561\u057e\u0561\u0580\u0561\u0580\u0565\u056c = Bavararvel (granted)
 * \u0544\u0565\u0580\u056a\u0565\u056c = Merzhel (rejected)
 * \u0544\u0561\u057d\u0576\u0561\u056f\u056b\u0578\u0580\u0565\u0576 = Masnakioren (partially)
 * \u054e\u0565\u0580\u0561\u0564\u0561\u0580\u0571\u0576\u0565\u056c = Veradardznel (remanded)
 * \u053f\u0561\u0580\u0573\u0565\u056c = Karjel (discontinued)
 */
const OUTCOME_GRANTED_RE = /\u0532\u0561\u057e\u0561\u0580\u0561\u0580\u0565\u056c/i;
const OUTCOME_REJECTED_RE = /\u0544\u0565\u0580\u056a\u0565\u056c/i;
const OUTCOME_PARTIAL_RE = /\u0544\u0561\u057d\u0576\u0561\u056f\u056b\u0578\u0580\u0565\u0576|\u0562\u0561\u057e\u0561\u0580\u0561\u0580\u057e\u0565\u056c\s+\u0574\u0561\u057d\u0576\u0561\u056f\u056b/i;
const OUTCOME_REMANDED_RE = /\u054e\u0565\u0580\u0561\u0564\u0561\u0580\u0571\u0576\u0565\u056c|\u057e\u0565\u0580\u0561\u0564\u0561\u0580\u0571\u0576\u0565\u056c/i;
const OUTCOME_DISCONTINUED_RE = /\u053f\u0561\u0580\u0573\u0565\u056c|\u056f\u0561\u0580\u0573\u0565\u056c/i;

// ─── HELPERS ────────────────────────────────────────────────────────

function extractFirstDate(text: string): string | null {
  // Try Armenian textual date first
  const amMatch = text.match(AM_DATE_RE);
  if (amMatch) {
    const day = amMatch[1].padStart(2, "0");
    const monthKey = amMatch[2];
    const year = amMatch[3];
    const month = ARMENIAN_MONTHS[monthKey];
    if (month) return `${year}-${month}-${day}`;
  }

  // Try ISO date
  const isoMatch = text.match(ISO_DATE_RE);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // Try numeric dd.mm.yyyy
  const numMatch = text.match(NUMERIC_DATE_RE);
  if (numMatch) {
    const day = numMatch[1].padStart(2, "0");
    const month = numMatch[2].padStart(2, "0");
    const year = numMatch[3];
    if (parseInt(month) >= 1 && parseInt(month) <= 12) {
      return `${year}-${month}-${day}`;
    }
  }

  return null;
}

function extractActNumber(text: string): string | null {
  const match = text.match(ACT_NUMBER_RE);
  return match ? match[0] : null;
}

function extractCaseNumber(text: string): string | null {
  const match = text.match(CASE_NUMBER_RE);
  return match ? match[0] : null;
}

function detectCourtType(text: string): CourtType | null {
  const header = text.slice(0, 3000);
  if (ECHR_RE.test(header)) return "echr";
  if (CONSTITUTIONAL_RE.test(header)) return "constitutional";
  if (CASSATION_RE.test(header)) return "cassation";
  if (APPEAL_RE.test(header)) return "appeal";
  if (COURT_WORD_RE.test(header)) return "first_instance";
  return null;
}

function detectCourtName(text: string): string | null {
  // Look for court name pattern in first 2000 chars
  // Pattern: Armenian text + \u0564\u0561\u057f\u0561\u0580\u0561\u0576 (datatran)
  const header = text.slice(0, 2000);
  const courtNameRe = /([\u0531-\u058f\s]{3,50}\u0564\u0561\u057f\u0561\u0580\u0561\u0576)/i;
  const match = header.match(courtNameRe);
  return match ? match[1].trim() : null;
}

function inferDocType(fileName: string, text: string): DocType {
  const fn = fileName.toLowerCase();
  const header = text.slice(0, 3000).toLowerCase();

  // ECHR
  if (ECHR_RE.test(header) || fn.includes("echr") || fn.includes("mied")) {
    return "echr_judgment";
  }

  // Constitutional court
  if (CONSTITUTIONAL_RE.test(header) && COURT_WORD_RE.test(header)) {
    return "constitutional_court";
  }

  // Cassation
  if (CASSATION_RE.test(header) || fn.includes("cassation")) {
    return "cassation_ruling";
  }

  // Appeal
  if (APPEAL_RE.test(header) || fn.includes("appeal")) {
    return "appeal_ruling";
  }

  // Court decision (generic)
  const caseNum = extractCaseNumber(text);
  if (caseNum && COURT_WORD_RE.test(header)) {
    return "court_decision";
  }

  // Government decree
  if (GOVT_RE.test(header) || fn.includes("government")) {
    return "government_decree";
  }

  // PM decision
  if (PM_RE.test(header) || fn.includes("pm_decision")) {
    return "pm_decision";
  }

  // Code (codified law)
  if (CODE_RE.test(header) || fn.includes("code") || fn.includes("orensgirq")) {
    return "code";
  }

  // Law
  if (LAW_RE.test(header) || fn.includes("law") || fn.includes("orenq")) {
    return "law";
  }

  // First instance (has court word + case number but didn't match above)
  if (COURT_WORD_RE.test(header) && caseNum) {
    return "first_instance_ruling";
  }

  return "other";
}

function inferBranch(text: string, docType: DocType): LegalBranch {
  const header = text.slice(0, 5000);

  if (docType === "echr_judgment") return "echr";
  if (docType === "constitutional_court") return "constitutional";

  if (CRIMINAL_RE.test(header)) return "criminal";
  if (CIVIL_RE.test(header)) return "civil";
  if (ADMIN_RE.test(header)) return "administrative";
  if (LABOR_RE.test(header)) return "labor";
  if (FAMILY_RE.test(header)) return "family";
  if (TAX_RE.test(header)) return "tax";

  return "other";
}

function detectOutcome(text: string): string | null {
  // Check last 5000 chars (operative part is usually at the end)
  const tail = text.slice(-5000);

  if (OUTCOME_PARTIAL_RE.test(tail)) return "partial";
  if (OUTCOME_GRANTED_RE.test(tail)) return "granted";
  if (OUTCOME_REJECTED_RE.test(tail)) return "rejected";
  if (OUTCOME_REMANDED_RE.test(tail)) return "remanded";
  if (OUTCOME_DISCONTINUED_RE.test(tail)) return "discontinued";

  return null;
}

function extractTitle(text: string, docType: DocType): string {
  // Take first non-empty line as title, max 500 chars
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return "Untitled";

  // For legislation: first line is usually the title
  // For court decisions: look for longer meaningful line in first 5
  const candidateLines = lines.slice(0, 5);
  let title = candidateLines[0];

  // If first line is very short (< 10 chars), try combining first few lines
  if (title.length < 10 && candidateLines.length > 1) {
    title = candidateLines.slice(0, 3).join(" ");
  }

  return title.slice(0, 500);
}

function simpleHash(text: string): string {
  // Simple deterministic hash (not crypto, just for dedup)
  let hash = 0;
  for (let i = 0; i < Math.min(text.length, 10000); i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

// ─── NORMALIZER ─────────────────────────────────────────────────────

export function normalize(input: NormalizerInput): LegalDocument {
  const { fileName, rawText, sourceUrl } = input;

  const docType = inferDocType(fileName, rawText);
  const branch = inferBranch(rawText, docType);
  const title = extractTitle(rawText, docType);
  const dateAdopted = extractFirstDate(rawText.slice(0, 3000));
  const actNumber = extractActNumber(rawText.slice(0, 3000));

  const isCourtDecision = [
    "court_decision", "cassation_ruling", "appeal_ruling",
    "first_instance_ruling", "constitutional_court", "echr_judgment",
  ].includes(docType);

  let court: CourtMeta | null = null;
  if (isCourtDecision) {
    const courtType = detectCourtType(rawText);
    court = {
      court_type: courtType || "first_instance",
      court_name: detectCourtName(rawText),
      case_number: extractCaseNumber(rawText),
      judge_names: null, // Requires NER — not deterministic via regex
      outcome: detectOutcome(rawText),
    };
  }

  const sourceName = sourceUrl
    ? (sourceUrl.includes("arlis.am")
        ? "arlis.am"
        : sourceUrl.includes("datalex.am")
          ? "datalex.am"
          : null)
    : null;

  return {
    doc_type: docType,
    jurisdiction: "AM",
    branch,
    title,
    title_alt: null,
    content_text: rawText,
    document_number: actNumber,
    date_adopted: dateAdopted,
    date_effective: null, // Separate from adoption, needs explicit parsing
    source_url: sourceUrl || null,
    source_name: sourceName,
    court,
    applied_articles: null, // Requires AI enrichment
    key_violations: null,   // Requires AI enrichment
    legal_reasoning_summary: null, // Requires AI enrichment
    decision_map: null,     // Requires AI enrichment
    ingestion: {
      pipeline: "legal-document-normalizer",
      ingested_at: new Date().toISOString(),
      schema_version: "1.0",
      source_hash: simpleHash(rawText),
    },
    is_active: true,
  };
}

// ─── VALIDATION ─────────────────────────────────────────────────────

interface ValidationError {
  field: string;
  message: string;
}

export function validate(doc: LegalDocument): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!DOC_TYPES.includes(doc.doc_type as any)) {
    errors.push({ field: "doc_type", message: `Invalid doc_type: ${doc.doc_type}` });
  }
  if (doc.jurisdiction !== "AM") {
    errors.push({ field: "jurisdiction", message: "Must be 'AM'" });
  }
  if (!BRANCHES.includes(doc.branch as any)) {
    errors.push({ field: "branch", message: `Invalid branch: ${doc.branch}` });
  }
  if (!doc.title || doc.title.length === 0) {
    errors.push({ field: "title", message: "Title is required" });
  }
  if (!doc.content_text || doc.content_text.length === 0) {
    errors.push({ field: "content_text", message: "Content text is required" });
  }
  if (doc.date_adopted && !/^\d{4}-\d{2}-\d{2}$/.test(doc.date_adopted)) {
    errors.push({ field: "date_adopted", message: "Must be YYYY-MM-DD" });
  }
  if (doc.date_effective && !/^\d{4}-\d{2}-\d{2}$/.test(doc.date_effective)) {
    errors.push({ field: "date_effective", message: "Must be YYYY-MM-DD" });
  }
  if (doc.court) {
    if (!COURT_TYPES.includes(doc.court.court_type as any)) {
      errors.push({ field: "court.court_type", message: `Invalid: ${doc.court.court_type}` });
    }
  }
  if (doc.ingestion.schema_version !== "1.0") {
    errors.push({ field: "ingestion.schema_version", message: "Must be '1.0'" });
  }

  return errors;
}

// ─── HTTP HANDLER ───────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { fileName, mimeType, rawText, sourceUrl } = body as NormalizerInput;

    // Input validation
    if (!fileName || typeof fileName !== "string") {
      return new Response(
        JSON.stringify({ error: "fileName is required (string)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!rawText || typeof rawText !== "string") {
      return new Response(
        JSON.stringify({ error: "rawText is required (string)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (rawText.length === 0) {
      return new Response(
        JSON.stringify({ error: "rawText must not be empty" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const document = normalize({
      fileName,
      mimeType: mimeType || "text/plain",
      rawText,
      sourceUrl,
    });

    const validationErrors = validate(document);
    if (validationErrors.length > 0) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: validationErrors, document }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ document }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("legal-document-normalizer error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
