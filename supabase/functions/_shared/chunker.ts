/**
 * Shared Legal Document Chunker — v2.0.0
 *
 * Enterprise-grade structural chunking for Republic of Armenia legal documents.
 *
 * Strategies:
 * - Laws / Codes (code_or_law): chunk = one article; oversized articles split by parts
 * - Court decisions (court_decision): chunk = logical section (header, procedural_history,
 *   facts, appellant_arguments, respondent_arguments, reasoning, norm_interpretation, ruling)
 *   NEVER merge reasoning + ruling. Overlap only inside reasoning (max 10%).
 * - ECHR judgments: chunk = structural section (Procedure, Facts, Law, Assessment, etc.)
 * - International treaties: chunk = article; oversized articles split by points
 * - Registry tables (registry_table): chunk by row groups, never split a row
 * - Normative acts (normative_act): structural chunking by numbered sections
 *
 * IMPORTANT: No Armenian glyphs — all Unicode escapes \uXXXX.
 */

import { extractTables, type ExtractedTable } from "./table-extractor.ts";

// ─── VERSION ────────────────────────────────────────────────────────

export const CHUNKER_VERSION = "v2.0.0";

// ─── TYPES ──────────────────────────────────────────────────────────

const CHUNK_TYPES = [
  "header", "operative", "resolution", "reasoning", "facts", "dissent",
  "article", "preamble", "table", "reference_list", "full_text", "other",
  // ECHR-specific
  "procedure", "law", "assessment", "conclusion", "just_satisfaction",
  // Court decision extended (8-section structure)
  "arguments", "legal_position",
  "procedural_history",
  "appellant_arguments",
  "respondent_arguments",
  "norm_interpretation",
  // International treaties
  "treaty_article",
  // Registry tables
  "registry_row_group",
  // Normative acts
  "normative_section",
] as const;
export type ChunkType = typeof CHUNK_TYPES[number];

export type InferredDocType =
  | "code_or_law"
  | "treaty"
  | "court_decision"
  | "registry_table"
  | "normative_act"
  | "other";

export interface LegalChunk {
  chunk_index: number;
  chunk_type: ChunkType;
  chunk_text: string;
  char_start: number;
  char_end: number;
  label: string | null;
  locator: ChunkLocator | null;
  chunk_hash: string;
  metadata: ChunkMetadata | null;
  doc_type?: string;
  chunker_version?: string;
}

export interface ChunkLocator {
  article?: string;
  part?: string;
  point?: string;
  section_title?: string;
}

export interface ChunkMetadata {
  document_type?: string;
  document_title?: string;
  article_number?: string;
  section_type?: string;
  court_level?: string;
  case_number?: string;
  date?: string;
}

export interface LegalDocumentInput {
  doc_type: string;
  content_text: string;
  title?: string;
  court_level?: string;
  case_number?: string;
  date?: string;
}

export interface ChunkResult {
  chunks: LegalChunk[];
  strategy: "article" | "sections" | "echr" | "treaty" | "registry" | "normative" | "fixed";
  case_number?: string;
  chunker_version: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

// ─── CONSTANTS ──────────────────────────────────────────────────────

const CHARS_PER_TOKEN = 4;
const MAX_TOKENS = 1500;
const MAX_CHUNK_CHARS = MAX_TOKENS * CHARS_PER_TOKEN; // 6000
const MIN_CHUNK_SIZE = 100;

const MAX_ARTICLE_CHARS = MAX_CHUNK_CHARS;

// Overlap: 10% for reasoning sections only
const REASONING_OVERLAP_RATIO = 0.10;

// ─── REGEX PATTERNS (Unicode-escaped Armenian) ──────────────────────

const ARTICLE_HEADER_RE = /\u0540\u0578\u0564\u057e\u0561\u056e\s+(\d+(?:[.-]\d+)*)\s*[.\u0589]/g;
const ARTICLE_HEADER_NEWLINE_RE = /\u0540\u0578\u0564\u057e\u0561\u056e\n(\d+(?:[.-]\d+)*)\s*[.\u0589]/g;
const ARTICLE_HEADER_SPLIT_RE = /\u0540\u0578\u0564\u057e\u0561\u056e\s+[^\n]+\n(\d+(?:[.-]\d+)*)\.\s/g;

const ARTICLE_TITLE_RE = /\u0540\u0578\u0564\u057e\u0561\u056e\s+\d+(?:[.-]\d+)*\s*[.\u0589]\s*([^\n]+)/;

const PART_LINE_RE = /^(\d+)\s*[.)]\s+/;

// ─── CASE NUMBER PATTERNS ──────────────────────────────────────────
const CASE_NUMBER_PATTERNS: RegExp[] = [
  /\u0563\u0578\u0580\u056e\s+\u0569\u056b\u057e[.:]?\s*([A-Z\u0531-\u0556]{1,5}[\-\/]\d[\d\-\/]+)/i,
  /\b([A-Z\u0531-\u0556]{2,5}[\-\/]\d{1,6}[\-\/]\d{2,4}(?:[\-\/]\d{2,4})?)\b/,
  /\u0434\u0435\u043b[\u043e\u0443]\s*(?:\u2116|N|No\.?)\s*([A-Z\u0410-\u042f\d][\d\-\/A-Z\u0410-\u042f]+)/i,
];

export function extractCaseNumber(text: string): string | undefined {
  const header = text.slice(0, 2000);
  for (const pattern of CASE_NUMBER_PATTERNS) {
    const m = header.match(pattern);
    if (m && m[1]) return m[1].trim();
  }
  return undefined;
}

// ─── DATE EXTRACTION ───────────────────────────────────────────────

const DATE_PATTERNS: RegExp[] = [
  /(\d{1,2}[.\/]\d{1,2}[.\/]\d{4})/,
  /(\d{1,2}\s+\u0570\u0578\u0582\u0576\u056b\u057d\u056b\s+\d{4})/i,
  /(\d{1,2}\s+\u0570\u0578\u056f\u057f\u0565\u0574\u0562\u0565\u0580\u056b\s+\d{4})/i,
  /(\d{4}-\d{2}-\d{2})/,
];

function extractDate(text: string): string | undefined {
  const header = text.slice(0, 2000);
  for (const pattern of DATE_PATTERNS) {
    const m = header.match(pattern);
    if (m && m[1]) return m[1].trim();
  }
  return undefined;
}

// ─── HELPERS ────────────────────────────────────────────────────────

function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

function makeChunk(
  index: number,
  type: ChunkType,
  text: string,
  charStart: number,
  label: string | null,
  locator: ChunkLocator | null,
  metadata: ChunkMetadata | null = null,
  docType?: string,
): LegalChunk {
  return {
    chunk_index: index,
    chunk_type: type,
    chunk_text: text,
    char_start: charStart,
    char_end: charStart + text.length,
    label,
    locator,
    chunk_hash: simpleHash(text),
    metadata,
    doc_type: docType,
    chunker_version: CHUNKER_VERSION,
  };
}

// ─── DETERMINISTIC DOC TYPE INFERENCE ──────────────────────────────

// Armenian: "\u0540\u0578\u0564\u057e\u0561\u056e" = "Հoddv" (Article)
const ARTICLE_DETECT_RE = /\u0540\u0578\u0564\u057e\u0561\u056e\s+\d/;
// "\u0540\u0561\u0574\u0561\u0571\u0561\u0575\u0576\u0561\u0563\u056b\u0580" = Treaty/Agreement
const TREATY_DETECT_RE = /\u0540\u0561\u0574\u0561\u0571\u0561\u0575\u0576\u0561\u0563\u056b\u0580/i;
// "\u0555\u054c\u0548\u0547\u0548\u0552\u0544" = Decision, "\u054e\u0543\u054b\u054c" = Verdict, "\u054a\u0531\u054c\u0536\u0535\u0551" = Clarified
const COURT_DECISION_RE = /\u0555\u054c\u0548\u0547\u0548\u0552\u0544|\u054e\u0543\u054b\u054c|\u054a\u0531\u054c\u0536\u0535\u0551/;
// Russian equivalents
const COURT_DECISION_RU_RE = /\u041e\u041f\u0420\u0415\u0414\u0415\u041b\u0415\u041d\u0418\u0415|\u0420\u0415\u0428\u0415\u041d\u0418\u0415|\u041f\u041e\u0421\u0422\u0410\u041d\u041e\u0412\u041b\u0415\u041d\u0418\u0415|\u041f\u0420\u0418\u0413\u041e\u0412\u041e\u0420/i;

/**
 * Deterministic doc type inference from content text.
 * Returns one of: code_or_law, treaty, court_decision, registry_table, normative_act, other
 */
export function inferDocType(text: string): InferredDocType {
  if (!text || text.trim().length === 0) return "other";

  const sample = text.slice(0, 5000);

  // 1. Check for article numbering → code_or_law
  if (ARTICLE_DETECT_RE.test(sample)) {
    // Count article occurrences — if multiple, it's a code/law
    const articleCount = (sample.match(/\u0540\u0578\u0564\u057e\u0561\u056e\s+\d/g) || []).length;
    if (articleCount >= 2) return "code_or_law";
  }

  // 2. Check for treaty markers
  if (TREATY_DETECT_RE.test(sample)) return "treaty";

  // 3. Check for court decision markers
  if (COURT_DECISION_RE.test(sample) || COURT_DECISION_RU_RE.test(sample)) {
    return "court_decision";
  }

  // 4. Check for registry table: repeated numbered rows with similar column structure
  if (isRegistryTable(text)) return "registry_table";

  // 5. Default to normative_act (structured legal text that doesn't fit above)
  // Check if it has any structural markers at all
  const hasNumberedSections = /^\s*\d+[.)]\s+/m.test(sample);
  const hasRomanSections = /^[IVX]+\.\s+/m.test(sample);
  if (hasNumberedSections || hasRomanSections) return "normative_act";

  return "other";
}

/**
 * Detect registry table format: lines with consistent delimiter-separated columns.
 * Heuristic: >5 lines that match "N. | text | text" or tab-separated pattern.
 */
function isRegistryTable(text: string): boolean {
  const lines = text.split("\n").slice(0, 100);
  let tableLineCount = 0;
  const pipeLineRe = /^\s*\d+\s*[.|)]\s*.+\|.+/;
  const tabLineRe = /^\s*\d+\s*[.|)]\s*.+\t.+/;

  for (const line of lines) {
    if (pipeLineRe.test(line) || tabLineRe.test(line)) {
      tableLineCount++;
    }
  }

  return tableLineCount >= 5;
}

// ─── LEGISLATION CHUNKER (Laws & Codes) ─────────────────────────────

interface ArticleMatch {
  index: number;
  number: string;
  fullMatch: string;
}

function findArticles(text: string): ArticleMatch[] {
  const articleMatches: ArticleMatch[] = [];

  for (const pattern of [ARTICLE_HEADER_RE, ARTICLE_HEADER_NEWLINE_RE, ARTICLE_HEADER_SPLIT_RE]) {
    const re = new RegExp(pattern.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      articleMatches.push({ index: m.index, number: m[1], fullMatch: m[0] });
    }
  }

  articleMatches.sort((a, b) => a.index - b.index);
  const deduped: ArticleMatch[] = [];
  for (const am of articleMatches) {
    const last = deduped[deduped.length - 1];
    if (!last || am.index - last.index > 5) {
      deduped.push(am);
    }
  }
  return deduped;
}

function extractArticleTitle(articleText: string): string | null {
  const m = articleText.match(ARTICLE_TITLE_RE);
  return m ? m[1].trim() : null;
}

/**
 * Split an oversized article into parts.
 * Each part starts with a numbered line (1., 2., etc.)
 * Parts are NEVER split internally.
 * No overlap for code_or_law.
 */
function splitArticleByParts(
  articleText: string,
  articleNum: string,
  baseOffset: number,
  startIdx: number,
  docMeta: ChunkMetadata,
  docType?: string,
): LegalChunk[] {
  const lines = articleText.split("\n");
  const partBoundaries: { lineIdx: number; partNum: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(PART_LINE_RE);
    if (m) {
      partBoundaries.push({ lineIdx: i, partNum: m[1] });
    }
  }

  if (partBoundaries.length <= 1) {
    const locator: ChunkLocator = {
      article: articleNum,
      section_title: "\u0540\u0578\u0564\u057e\u0561\u056e " + articleNum,
    };
    return [makeChunk(
      startIdx, "article", articleText, baseOffset,
      "\u0540\u0578\u0564\u057e\u0561\u056e " + articleNum, locator,
      { ...docMeta, article_number: articleNum, section_type: "article" },
      docType,
    )];
  }

  const chunks: LegalChunk[] = [];
  let idx = startIdx;

  const headerLines = lines.slice(0, partBoundaries[0].lineIdx);
  let currentText = headerLines.join("\n");
  let currentPartStart = partBoundaries[0].partNum;
  let currentPartEnd = currentPartStart;
  let charPos = 0;

  for (let i = 0; i < partBoundaries.length; i++) {
    const nextBoundaryLine = i + 1 < partBoundaries.length
      ? partBoundaries[i + 1].lineIdx
      : lines.length;
    const partText = lines.slice(partBoundaries[i].lineIdx, nextBoundaryLine).join("\n");

    if (currentText.length + partText.length + 1 > MAX_CHUNK_CHARS && currentText.trim().length > 0) {
      const trimmed = currentText.trim();
      const partLabel = currentPartStart === currentPartEnd
        ? `\u0540\u0578\u0564\u057e\u0561\u056e ${articleNum}, \u0574\u0561\u057d ${currentPartStart}`
        : `\u0540\u0578\u0564\u057e\u0561\u056e ${articleNum}, \u0574\u0561\u057d\u0565\u0580 ${currentPartStart}-${currentPartEnd}`;
      const locator: ChunkLocator = {
        article: articleNum,
        part: currentPartStart === currentPartEnd ? currentPartStart : `${currentPartStart}-${currentPartEnd}`,
      };
      chunks.push(makeChunk(idx++, "article", trimmed, baseOffset + charPos, partLabel, locator, {
        ...docMeta, article_number: articleNum, section_type: "article",
      }, docType));

      charPos += trimmed.length + 1;
      currentText = partText;
      currentPartStart = partBoundaries[i].partNum;
      currentPartEnd = currentPartStart;
    } else {
      if (currentText.length > 0) currentText += "\n";
      currentText += partText;
      currentPartEnd = partBoundaries[i].partNum;
    }
  }

  if (currentText.trim().length > 0) {
    const trimmed = currentText.trim();
    const partLabel = currentPartStart === currentPartEnd
      ? `\u0540\u0578\u0564\u057e\u0561\u056e ${articleNum}, \u0574\u0561\u057d ${currentPartStart}`
      : `\u0540\u0578\u0564\u057e\u0561\u056e ${articleNum}, \u0574\u0561\u057d\u0565\u0580 ${currentPartStart}-${currentPartEnd}`;
    const locator: ChunkLocator = {
      article: articleNum,
      part: currentPartStart === currentPartEnd ? currentPartStart : `${currentPartStart}-${currentPartEnd}`,
    };
    chunks.push(makeChunk(idx++, "article", trimmed, baseOffset + charPos, partLabel, locator, {
      ...docMeta, article_number: articleNum, section_type: "article",
    }, docType));
  }

  return chunks;
}

function chunkLegislation(text: string, docInput: LegalDocumentInput): LegalChunk[] {
  const chunks: LegalChunk[] = [];
  const deduped = findArticles(text);

  const docMeta: ChunkMetadata = {
    document_type: docInput.doc_type,
    document_title: docInput.title,
  };

  if (deduped.length === 0) {
    // For KB: use normative_act structural chunking instead of fixed window
    return chunkNormativeAct(text, docInput);
  }

  let chunkIdx = 0;

  // Preamble
  if (deduped[0].index > MIN_CHUNK_SIZE) {
    const preambleText = text.slice(0, deduped[0].index).trim();
    if (preambleText.length > 0) {
      chunks.push(makeChunk(chunkIdx++, "preamble", preambleText, 0, null, null, {
        ...docMeta, section_type: "preamble",
      }, docInput.doc_type));
    }
  }

  for (let i = 0; i < deduped.length; i++) {
    const start = deduped[i].index;
    const end = i + 1 < deduped.length ? deduped[i + 1].index : text.length;
    const articleText = text.slice(start, end).trim();
    const articleNum = deduped[i].number;

    if (articleText.length === 0) continue;

    if (articleText.length > MAX_CHUNK_CHARS) {
      const subChunks = splitArticleByParts(articleText, articleNum, start, chunkIdx, docMeta, docInput.doc_type);
      for (const sc of subChunks) {
        chunks.push(sc);
      }
      chunkIdx += subChunks.length;
    } else {
      const locator: ChunkLocator = {
        article: articleNum,
        section_title: "\u0540\u0578\u0564\u057e\u0561\u056e " + articleNum,
      };
      chunks.push(makeChunk(
        chunkIdx++, "article", articleText, start,
        "\u0540\u0578\u0564\u057e\u0561\u056e " + articleNum, locator,
        { ...docMeta, article_number: articleNum, section_type: "article" },
        docInput.doc_type,
      ));
    }
  }

  return chunks;
}

// ─── COURT DECISION CHUNKER ────────────────────────────────────────

interface SectionPattern {
  re: RegExp;
  type: ChunkType;
  label: string;
}

const COURT_SECTION_PATTERNS: SectionPattern[] = [
  // ── Armenian patterns ──

  // ── Procedural History ──
  {
    re: /\u0564\u0561\u057f\u0561\u057e\u0561\u0580\u0561\u056f\u0561\u0576\s+\u057a\u0561\u057f\u0574\u0578\u0582\u0569\u0575\u0578\u0582\u0576/i,
    type: "procedural_history",
    label: "\u0564\u0561\u057f\u0561\u057e\u0561\u0580\u0561\u056f\u0561\u0576 \u057a\u0561\u057f\u0574\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
  },
  {
    re: /\u0563\u0578\u0580\u056e\u056b\s+\u057a\u0561\u057f\u0574\u0578\u0582\u0569\u0575\u0578\u0582\u0576/i,
    type: "procedural_history",
    label: "\u0563\u0578\u0580\u056e\u056b \u057a\u0561\u057f\u0574\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
  },
  {
    re: /\u0576\u0561\u056d\u0578\u0580\u0564\s+\u057e\u0561\u0580\u0578\u0582\u0575\u0569/i,
    type: "procedural_history",
    label: "\u0576\u0561\u056d\u0578\u0580\u0564 \u057e\u0561\u0580\u0578\u0582\u0575\u0569",
  },

  // ── Arguments of Appellant ──
  {
    re: /\u0562\u0578\u0572\u0578\u0584\u0561\u0580\u056f\u0578\u0572\u056b\s+\u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580/i,
    type: "appellant_arguments",
    label: "\u0562\u0578\u0572\u0578\u0584\u0561\u0580\u056f\u0578\u0572\u056b \u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580",
  },
  {
    re: /\u057e\u0573\u057c\u0561\u056f\u0561\u0576\s+\u0562\u0578\u0572\u0578\u0584\u056b\s+\u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580/i,
    type: "appellant_arguments",
    label: "\u057e\u0573\u057c\u0561\u056f\u0561\u0576 \u0562\u0578\u0572\u0578\u0584\u056b \u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580",
  },
  {
    re: /\u0562\u0578\u0572\u0578\u0584\u0561\u0580\u056f\u0578\u0572\u056b\s+\u0564\u056b\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574/i,
    type: "appellant_arguments",
    label: "\u0562\u0578\u0572\u0578\u0584\u0561\u0580\u056f\u0578\u0572\u056b \u0564\u056b\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574",
  },

  // ── Arguments of Respondent ──
  {
    re: /\u057a\u0561\u057f\u0561\u057d\u056d\u0561\u0576\u0578\u0572\u056b\s+\u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580/i,
    type: "respondent_arguments",
    label: "\u057a\u0561\u057f\u0561\u057d\u056d\u0561\u0576\u0578\u0572\u056b \u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580",
  },
  {
    re: /\u057a\u0561\u057f\u0561\u057d\u056d\u0561\u0576\u0578\u0572\u056b\s+\u0564\u056b\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574/i,
    type: "respondent_arguments",
    label: "\u057a\u0561\u057f\u0561\u057d\u056d\u0561\u0576\u0578\u0572\u056b \u0564\u056b\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574",
  },

  // ── Generic arguments (fallback) ──
  {
    re: /\u056f\u0578\u0572\u0574\u0565\u0580\u056b\s+\u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580/i,
    type: "arguments",
    label: "\u056f\u0578\u0572\u0574\u0565\u0580\u056b \u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580",
  },

  // ── Norm Interpretation ──
  {
    re: /\u0576\u0578\u0580\u0574\u0565\u0580\u056b\s+\u0574\u0565\u056f\u0576\u0561\u0562\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576/i,
    type: "norm_interpretation",
    label: "\u0576\u0578\u0580\u0574\u0565\u0580\u056b \u0574\u0565\u056f\u0576\u0561\u0562\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
  },
  {
    re: /\u056b\u0580\u0561\u057e\u0561\u056f\u0561\u0576\s+\u0574\u0565\u056f\u0576\u0561\u0562\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576/i,
    type: "norm_interpretation",
    label: "\u056b\u0580\u0561\u057e\u0561\u056f\u0561\u0576 \u0574\u0565\u056f\u0576\u0561\u0562\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
  },
  {
    re: /\u0576\u0578\u0580\u0574\u0565\u0580\u056b\s+\u057e\u0565\u0580\u056c\u0578\u0582\u056e\u0578\u0582\u0569\u0575\u0578\u0582\u0576/i,
    type: "norm_interpretation",
    label: "\u0576\u0578\u0580\u0574\u0565\u0580\u056b \u057e\u0565\u0580\u056c\u0578\u0582\u056e\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
  },

  // ── Legal position of the court ──
  {
    re: /\u0564\u0561\u057f\u0561\u0580\u0561\u0576\u056b\s+\u056b\u0580\u0561\u057e\u0561\u056f\u0561\u0576\s+\u0564\u056b\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574/i,
    type: "legal_position",
    label: "\u0564\u0561\u057f\u0561\u0580\u0561\u0576\u056b \u056b\u0580\u0561\u057e\u0561\u056f\u0561\u0576 \u0564\u056b\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574",
  },
  {
    re: /\u057a\u0561\u057f\u0573\u0561\u057c\u0561\u056f\u0561\u0576\s+\u0574\u0561\u057d/i,
    type: "reasoning",
    label: "\u057a\u0561\u057f\u0573\u0561\u057c\u0561\u056f\u0561\u0576 \u0574\u0561\u057d",
  },
  {
    re: /\u0576\u056f\u0561\u0580\u0561\u0563\u0580\u0561\u056f\u0561\u0576\s+\u0574\u0561\u057d/i,
    type: "facts",
    label: "\u0576\u056f\u0561\u0580\u0561\u0563\u0580\u0561\u056f\u0561\u0576 \u0574\u0561\u057d",
  },
  {
    re: /\u0583\u0561\u057d\u057f\u0561\u056f\u0561\u0576\s+\u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584/i,
    type: "facts",
    label: "\u0583\u0561\u057d\u057f\u0561\u056f\u0561\u0576 \u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584\u0576\u0565\u0580",
  },
  {
    re: /\u057a\u0561\u0570\u0561\u0576\u057b\u0561\u057f\u057e\u0561\u056f\u0561\u0576/i,
    type: "resolution",
    label: "\u057a\u0561\u0570\u0561\u0576\u057b\u0561\u057f\u057e\u0561\u056f\u0561\u0576",
  },
  {
    re: /\u0565\u0566\u0580\u0561\u056f\u0561\u0581\u0578\u0582\u0569\u0575\u0578\u0582\u0576/i,
    type: "resolution",
    label: "\u0565\u0566\u0580\u0561\u056f\u0561\u0581\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
  },
  {
    re: /\u0570\u0561\u057f\u0578\u0582\u056f\s+\u056f\u0561\u0580\u056e\u056b\u0584/i,
    type: "dissent",
    label: "\u0570\u0561\u057f\u0578\u0582\u056f \u056f\u0561\u0580\u056e\u056b\u0584",
  },
  {
    re: /\u0563\u0578\u0580\u056e\u056b\s+\u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584/i,
    type: "facts",
    label: "\u0563\u0578\u0580\u056e\u056b \u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584\u0576\u0565\u0580",
  },
  {
    re: /\u057e\u0573\u056b\u057c\u0565\u0581/i,
    type: "resolution",
    label: "\u057e\u0573\u056b\u057c\u0565\u0581",
  },

  // ── Russian-language patterns ──

  {
    re: /\u043f\u0440\u043e\u0446\u0435\u0441\u0441\u0443\u0430\u043b\u044c\u043d\u0430\u044f\s+\u0438\u0441\u0442\u043e\u0440\u0438\u044f/i,
    type: "procedural_history",
    label: "\u043f\u0440\u043e\u0446\u0435\u0441\u0441\u0443\u0430\u043b\u044c\u043d\u0430\u044f \u0438\u0441\u0442\u043e\u0440\u0438\u044f",
  },
  {
    re: /\u0445\u043e\u0434\s+\u0440\u0430\u0441\u0441\u043c\u043e\u0442\u0440\u0435\u043d\u0438\u044f\s+\u0434\u0435\u043b\u0430/i,
    type: "procedural_history",
    label: "\u0445\u043e\u0434 \u0440\u0430\u0441\u0441\u043c\u043e\u0442\u0440\u0435\u043d\u0438\u044f \u0434\u0435\u043b\u0430",
  },
  {
    re: /\u0434\u043e\u0432\u043e\u0434\u044b\s+(?:\u0430\u043f\u0435\u043b\u043b\u044f\u043d\u0442\u0430|\u0437\u0430\u044f\u0432\u0438\u0442\u0435\u043b\u044f|\u0438\u0441\u0442\u0446\u0430|\u043e\u0431\u0432\u0438\u043d\u044f\u0435\u043c\u043e\u0433\u043e|\u043e\u0441\u0443\u0436\u0434\u0435\u043d\u043d\u043e\u0433\u043e)/i,
    type: "appellant_arguments",
    label: "\u0434\u043e\u0432\u043e\u0434\u044b \u0430\u043f\u0435\u043b\u043b\u044f\u043d\u0442\u0430",
  },
  {
    re: /\u0434\u043e\u0432\u043e\u0434\u044b\s+(?:\u043e\u0442\u0432\u0435\u0442\u0447\u0438\u043a\u0430|\u043e\u0431\u0432\u0438\u043d\u0438\u0442\u0435\u043b\u044f|\u043f\u0440\u043e\u043a\u0443\u0440\u043e\u0440\u0430)/i,
    type: "respondent_arguments",
    label: "\u0434\u043e\u0432\u043e\u0434\u044b \u043e\u0442\u0432\u0435\u0442\u0447\u0438\u043a\u0430",
  },
  {
    re: /\u0434\u043e\u0432\u043e\u0434\u044b\s+\u0441\u0442\u043e\u0440\u043e\u043d/i,
    type: "arguments",
    label: "\u0434\u043e\u0432\u043e\u0434\u044b \u0441\u0442\u043e\u0440\u043e\u043d",
  },
  {
    re: /\u0442\u043e\u043b\u043a\u043e\u0432\u0430\u043d\u0438\u0435\s+\u043d\u043e\u0440\u043c/i,
    type: "norm_interpretation",
    label: "\u0442\u043e\u043b\u043a\u043e\u0432\u0430\u043d\u0438\u0435 \u043d\u043e\u0440\u043c",
  },
  {
    re: /\u043f\u0440\u0430\u0432\u043e\u0432\u043e\u0435\s+\u0442\u043e\u043b\u043a\u043e\u0432\u0430\u043d\u0438\u0435/i,
    type: "norm_interpretation",
    label: "\u043f\u0440\u0430\u0432\u043e\u0432\u043e\u0435 \u0442\u043e\u043b\u043a\u043e\u0432\u0430\u043d\u0438\u0435",
  },
  {
    re: /\u043f\u0440\u0430\u0432\u043e\u0432\u0430\u044f\s+\u043f\u043e\u0437\u0438\u0446\u0438\u044f\s+\u0441\u0443\u0434\u0430/i,
    type: "legal_position",
    label: "\u043f\u0440\u0430\u0432\u043e\u0432\u0430\u044f \u043f\u043e\u0437\u0438\u0446\u0438\u044f \u0441\u0443\u0434\u0430",
  },
  {
    re: /\u043c\u043e\u0442\u0438\u0432\u0438\u0440\u043e\u0432\u043e\u0447\u043d\u0430\u044f\s+\u0447\u0430\u0441\u0442\u044c/i,
    type: "reasoning",
    label: "\u043c\u043e\u0442\u0438\u0432\u0438\u0440\u043e\u0432\u043e\u0447\u043d\u0430\u044f \u0447\u0430\u0441\u0442\u044c",
  },
  {
    re: /\u0444\u0430\u043a\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0435?\s+\u043e\u0431\u0441\u0442\u043e\u044f\u0442\u0435\u043b\u044c\u0441\u0442\u0432/i,
    type: "facts",
    label: "\u0444\u0430\u043a\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0435 \u043e\u0431\u0441\u0442\u043e\u044f\u0442\u0435\u043b\u044c\u0441\u0442\u0432\u0430",
  },
  {
    re: /\u0440\u0435\u0437\u043e\u043b\u044e\u0442\u0438\u0432\u043d\u0430\u044f\s+\u0447\u0430\u0441\u0442\u044c/i,
    type: "resolution",
    label: "\u0440\u0435\u0437\u043e\u043b\u044e\u0442\u0438\u0432\u043d\u0430\u044f \u0447\u0430\u0441\u0442\u044c",
  },
  {
    re: /\u043f\u043e\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u043b/i,
    type: "resolution",
    label: "\u043f\u043e\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u043b",
  },
  {
    re: /\u0440\u0435\u0448\u0438\u043b/i,
    type: "resolution",
    label: "\u0440\u0435\u0448\u0438\u043b",
  },
  {
    re: /\u043e\u0441\u043e\u0431\u043e\u0435\s+\u043c\u043d\u0435\u043d\u0438\u0435/i,
    type: "dissent",
    label: "\u043e\u0441\u043e\u0431\u043e\u0435 \u043c\u043d\u0435\u043d\u0438\u0435",
  },
];

// Types that get reasoning overlap (max 10%)
const REASONING_TYPES: Set<ChunkType> = new Set(["reasoning", "legal_position", "norm_interpretation"]);

// Types that must NEVER be merged with reasoning
const RESOLUTION_TYPES: Set<ChunkType> = new Set(["resolution"]);

function chunkCourtDecision(text: string, docInput: LegalDocumentInput): LegalChunk[] {
  interface SectionBoundary {
    index: number;
    type: ChunkType;
    label: string;
  }

  const boundaries: SectionBoundary[] = [];
  const docMeta: ChunkMetadata = {
    document_type: docInput.doc_type,
    document_title: docInput.title,
    court_level: docInput.court_level,
    case_number: docInput.case_number || extractCaseNumber(text),
    date: docInput.date || extractDate(text),
  };

  for (const pattern of COURT_SECTION_PATTERNS) {
    const re = new RegExp(pattern.re.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const before = text.slice(Math.max(0, m.index - 2), m.index);
      const isLineStart = m.index === 0 || /[\n\r]/.test(before);
      if (isLineStart || before.trim() === "") {
        boundaries.push({ index: m.index, type: pattern.type, label: pattern.label });
      }
    }
  }

  boundaries.sort((a, b) => a.index - b.index);
  const deduped: SectionBoundary[] = [];
  for (const b of boundaries) {
    const last = deduped[deduped.length - 1];
    if (!last || b.index - last.index > 50) {
      deduped.push(b);
    }
  }

  if (deduped.length === 0) {
    return chunkStructuralFallback(text, "full_text", docMeta, docInput.doc_type);
  }

  const chunks: LegalChunk[] = [];
  let chunkIdx = 0;

  // Header (requisites)
  if (deduped[0].index > MIN_CHUNK_SIZE) {
    const headerText = text.slice(0, deduped[0].index).trim();
    if (headerText.length > 0) {
      chunks.push(makeChunk(chunkIdx++, "header", headerText, 0, null, null, {
        ...docMeta, section_type: "header",
      }, docInput.doc_type));
    }
  }

  for (let i = 0; i < deduped.length; i++) {
    const start = deduped[i].index;
    const end = i + 1 < deduped.length ? deduped[i + 1].index : text.length;
    let sectionText = text.slice(start, end).trim();
    if (sectionText.length === 0) continue;

    const sectionType = deduped[i].type;
    const sectionLabel = deduped[i].label;

    // Add overlap from previous section for reasoning/legal_position/norm_interpretation ONLY
    // NEVER add overlap to resolution types
    if (REASONING_TYPES.has(sectionType) && !RESOLUTION_TYPES.has(sectionType) && i > 0) {
      const prevStart = deduped[i - 1].index;
      const prevText = text.slice(prevStart, start);
      const overlapChars = Math.floor(prevText.length * REASONING_OVERLAP_RATIO);
      if (overlapChars > MIN_CHUNK_SIZE) {
        const overlapText = prevText.slice(-overlapChars);
        sectionText = overlapText + "\n\n" + sectionText;
      }
    }

    if (sectionText.length > MAX_CHUNK_CHARS) {
      const subChunks = splitSectionByParagraphs(sectionText, sectionType, sectionLabel, start, chunkIdx, docMeta, docInput.doc_type);
      for (const sc of subChunks) chunks.push(sc);
      chunkIdx += subChunks.length;
    } else {
      chunks.push(makeChunk(
        chunkIdx++, sectionType, sectionText, start, sectionLabel,
        { section_title: sectionLabel },
        { ...docMeta, section_type: sectionType },
        docInput.doc_type,
      ));
    }
  }

  return chunks;
}

/**
 * Split an oversized section into sub-chunks at paragraph boundaries.
 * Never splits mid-sentence. Preserves section type on all sub-chunks.
 */
function splitSectionByParagraphs(
  text: string,
  sectionType: ChunkType,
  sectionLabel: string,
  baseOffset: number,
  startIdx: number,
  docMeta: ChunkMetadata,
  docType?: string,
): LegalChunk[] {
  const chunks: LegalChunk[] = [];
  const paragraphs = text.split(/\n\n+/);
  let currentText = "";
  let currentOffset = 0;
  let idx = startIdx;
  let partNum = 1;

  for (const para of paragraphs) {
    if (currentText.length + para.length + 2 > MAX_CHUNK_CHARS && currentText.trim().length > 0) {
      const trimmed = currentText.trim();
      const label = `${sectionLabel} (${partNum})`;
      chunks.push(makeChunk(idx++, sectionType, trimmed, baseOffset + currentOffset, label,
        { section_title: sectionLabel },
        { ...docMeta, section_type: sectionType },
        docType,
      ));
      partNum++;
      currentOffset += currentText.length;
      currentText = para;
    } else {
      if (currentText.length > 0) currentText += "\n\n";
      currentText += para;
    }
  }

  if (currentText.trim().length > 0) {
    const trimmed = currentText.trim();
    const label = partNum > 1 ? `${sectionLabel} (${partNum})` : sectionLabel;
    chunks.push(makeChunk(idx++, sectionType, trimmed, baseOffset + currentOffset, label,
      { section_title: sectionLabel },
      { ...docMeta, section_type: sectionType },
      docType,
    ));
  }

  return chunks;
}

// ─── ECHR JUDGMENT CHUNKER ─────────────────────────────────────────

interface EchrSectionPattern {
  re: RegExp;
  type: ChunkType;
  label: string;
}

const ECHR_SECTION_PATTERNS: EchrSectionPattern[] = [
  { re: /^(?:I\.\s*)?PROCEDURE/im, type: "procedure", label: "PROCEDURE" },
  { re: /^(?:II\.\s*)?THE\s+FACTS/im, type: "facts", label: "THE FACTS" },
  { re: /^(?:II\.\s*)?RELEVANT\s+DOMESTIC\s+LAW/im, type: "law", label: "RELEVANT DOMESTIC LAW" },
  { re: /^(?:III\.\s*)?THE\s+LAW/im, type: "law", label: "THE LAW" },
  { re: /^(?:A\.\s*)?THE\s+GOVERNMENT['S\u2019]?\s+PRELIMINARY\s+OBJECTION/im, type: "arguments", label: "GOVERNMENT PRELIMINARY OBJECTION" },
  { re: /^(?:B\.\s*)?MERITS/im, type: "assessment", label: "MERITS" },
  { re: /ASSESSMENT\s+OF\s+THE\s+COURT/im, type: "assessment", label: "ASSESSMENT OF THE COURT" },
  { re: /THE\s+COURT['S\u2019]?\s+ASSESSMENT/im, type: "assessment", label: "THE COURT'S ASSESSMENT" },
  { re: /^(?:IV\.\s*)?ALLEGED\s+VIOLATION/im, type: "assessment", label: "ALLEGED VIOLATION" },
  { re: /^(?:V\.\s*)?APPLICATION\s+OF\s+ARTICLE\s+41/im, type: "just_satisfaction", label: "APPLICATION OF ARTICLE 41" },
  { re: /JUST\s+SATISFACTION/im, type: "just_satisfaction", label: "JUST SATISFACTION" },
  { re: /^(?:VI?\.\s*)?CONCLUSION/im, type: "conclusion", label: "CONCLUSION" },
  { re: /FOR\s+THESE\s+REASONS/im, type: "conclusion", label: "FOR THESE REASONS" },
  { re: /DISSENTING\s+OPINION/im, type: "dissent", label: "DISSENTING OPINION" },
  { re: /CONCURRING\s+OPINION/im, type: "dissent", label: "CONCURRING OPINION" },
  { re: /SEPARATE\s+OPINION/im, type: "dissent", label: "SEPARATE OPINION" },
];

const ECHR_CASE_NUMBER_RE = /(?:Application\s+no\.\s*|no\.\s*|Case\s+of\s+)(\d+\/\d+)/i;

function chunkEchrJudgment(text: string, docInput: LegalDocumentInput): LegalChunk[] {
  const boundaries: { index: number; type: ChunkType; label: string }[] = [];

  const docMeta: ChunkMetadata = {
    document_type: "echr_judgment",
    document_title: docInput.title,
    court_level: "echr",
    case_number: docInput.case_number,
    date: docInput.date || extractDate(text),
  };

  if (!docMeta.case_number) {
    const echrMatch = text.slice(0, 3000).match(ECHR_CASE_NUMBER_RE);
    if (echrMatch) docMeta.case_number = echrMatch[1];
  }

  for (const pattern of ECHR_SECTION_PATTERNS) {
    const re = new RegExp(pattern.re.source, pattern.re.flags.includes("m") ? "gim" : "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      boundaries.push({ index: m.index, type: pattern.type, label: pattern.label });
    }
  }

  boundaries.sort((a, b) => a.index - b.index);
  const deduped: typeof boundaries = [];
  for (const b of boundaries) {
    const last = deduped[deduped.length - 1];
    if (!last || b.index - last.index > 80) {
      deduped.push(b);
    }
  }

  if (deduped.length === 0) {
    return chunkStructuralFallback(text, "full_text", docMeta, "echr_judgment");
  }

  const chunks: LegalChunk[] = [];
  let chunkIdx = 0;

  if (deduped[0].index > MIN_CHUNK_SIZE) {
    const headerText = text.slice(0, deduped[0].index).trim();
    if (headerText.length > 0) {
      chunks.push(makeChunk(chunkIdx++, "header", headerText, 0, null, null, {
        ...docMeta, section_type: "header",
      }, "echr_judgment"));
    }
  }

  for (let i = 0; i < deduped.length; i++) {
    const start = deduped[i].index;
    const end = i + 1 < deduped.length ? deduped[i + 1].index : text.length;
    const sectionText = text.slice(start, end).trim();
    if (sectionText.length === 0) continue;

    if (sectionText.length > MAX_CHUNK_CHARS) {
      const subChunks = splitSectionByParagraphs(sectionText, deduped[i].type, deduped[i].label, start, chunkIdx, docMeta, "echr_judgment");
      for (const sc of subChunks) chunks.push(sc);
      chunkIdx += subChunks.length;
    } else {
      chunks.push(makeChunk(
        chunkIdx++, deduped[i].type, sectionText, start, deduped[i].label,
        { section_title: deduped[i].label },
        { ...docMeta, section_type: deduped[i].type },
        "echr_judgment",
      ));
    }
  }

  return chunks;
}

// ─── INTERNATIONAL TREATY CHUNKER ──────────────────────────────────

const TREATY_ARTICLE_PATTERNS: RegExp[] = [
  /\u0540\u0578\u0564\u057e\u0561\u056e\s+(\d+(?:[.-]\d+)*)\s*[.\u0589]/g,
  /\bArticle\s+(\d+(?:[.-]\d+)*)\b/gi,
  /\u0421\u0442\u0430\u0442\u044c\u044f\s+(\d+(?:[.-]\d+)*)/gi,
];

function chunkTreaty(text: string, docInput: LegalDocumentInput): LegalChunk[] {
  const docMeta: ChunkMetadata = {
    document_type: "international_treaty",
    document_title: docInput.title,
    date: docInput.date || extractDate(text),
  };

  const articleMatches: ArticleMatch[] = [];

  for (const pattern of TREATY_ARTICLE_PATTERNS) {
    const re = new RegExp(pattern.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      articleMatches.push({ index: m.index, number: m[1], fullMatch: m[0] });
    }
  }

  articleMatches.sort((a, b) => a.index - b.index);
  const deduped: ArticleMatch[] = [];
  for (const am of articleMatches) {
    const last = deduped[deduped.length - 1];
    if (!last || am.index - last.index > 10) {
      deduped.push(am);
    }
  }

  if (deduped.length === 0) {
    return chunkStructuralFallback(text, "treaty_article", docMeta, "treaty");
  }

  const chunks: LegalChunk[] = [];
  let chunkIdx = 0;

  if (deduped[0].index > MIN_CHUNK_SIZE) {
    const preambleText = text.slice(0, deduped[0].index).trim();
    if (preambleText.length > 0) {
      chunks.push(makeChunk(chunkIdx++, "preamble", preambleText, 0, null, null, {
        ...docMeta, section_type: "preamble",
      }, "treaty"));
    }
  }

  for (let i = 0; i < deduped.length; i++) {
    const start = deduped[i].index;
    const end = i + 1 < deduped.length ? deduped[i + 1].index : text.length;
    const articleText = text.slice(start, end).trim();
    const articleNum = deduped[i].number;

    if (articleText.length === 0) continue;

    if (articleText.length > MAX_CHUNK_CHARS) {
      const subChunks = splitArticleByParts(articleText, articleNum, start, chunkIdx, docMeta, "treaty");
      for (const sc of subChunks) {
        sc.chunk_type = "treaty_article";
      }
      chunks.push(...subChunks);
      chunkIdx += subChunks.length;
    } else {
      const locator: ChunkLocator = {
        article: articleNum,
        section_title: "Article " + articleNum,
      };
      chunks.push(makeChunk(
        chunkIdx++, "treaty_article", articleText, start,
        "Article " + articleNum, locator,
        { ...docMeta, article_number: articleNum, section_type: "treaty_article" },
        "treaty",
      ));
    }
  }

  return chunks;
}

// ─── REGISTRY TABLE CHUNKER ───────────────────────────────────────

/**
 * Chunks registry-style tables by row groups.
 * Never splits a row. Groups rows to stay within MAX_CHUNK_CHARS.
 */
function chunkRegistryTable(text: string, docInput: LegalDocumentInput): LegalChunk[] {
  const docMeta: ChunkMetadata = {
    document_type: "registry_table",
    document_title: docInput.title,
    date: docInput.date || extractDate(text),
  };

  const lines = text.split("\n");
  const chunks: LegalChunk[] = [];
  let chunkIdx = 0;

  // Find header lines (before first numbered row)
  let headerEnd = 0;
  const numberedRowRe = /^\s*\d+\s*[.|)]/;
  for (let i = 0; i < lines.length; i++) {
    if (numberedRowRe.test(lines[i])) {
      headerEnd = i;
      break;
    }
  }

  // Emit header if present
  if (headerEnd > 0) {
    const headerText = lines.slice(0, headerEnd).join("\n").trim();
    if (headerText.length > MIN_CHUNK_SIZE) {
      chunks.push(makeChunk(chunkIdx++, "header", headerText, 0, "Registry Header", null, {
        ...docMeta, section_type: "header",
      }, "registry_table"));
    }
  }

  // Group rows: each "row" starts with a numbered line and includes non-numbered continuation lines
  const rows: { text: string; lineStart: number }[] = [];
  let currentRow = "";
  let currentRowLineStart = headerEnd;

  for (let i = headerEnd; i < lines.length; i++) {
    if (numberedRowRe.test(lines[i]) && currentRow.trim().length > 0) {
      rows.push({ text: currentRow.trim(), lineStart: currentRowLineStart });
      currentRow = lines[i];
      currentRowLineStart = i;
    } else {
      if (currentRow.length > 0) currentRow += "\n";
      currentRow += lines[i];
    }
  }
  if (currentRow.trim().length > 0) {
    rows.push({ text: currentRow.trim(), lineStart: currentRowLineStart });
  }

  // Group rows into chunks within size limit
  let groupText = "";
  let groupStart = 0;
  let charOffset = 0;

  // Calculate char offset of headerEnd line
  for (let i = 0; i < headerEnd; i++) {
    charOffset += lines[i].length + 1; // +1 for \n
  }
  groupStart = charOffset;

  for (const row of rows) {
    if (groupText.length + row.text.length + 1 > MAX_CHUNK_CHARS && groupText.trim().length > 0) {
      const trimmed = groupText.trim();
      chunks.push(makeChunk(chunkIdx++, "registry_row_group", trimmed, groupStart,
        `Row group ${chunkIdx}`, null, { ...docMeta, section_type: "registry_row_group" },
        "registry_table",
      ));
      groupStart += groupText.length + 1;
      groupText = row.text;
    } else {
      if (groupText.length > 0) groupText += "\n";
      groupText += row.text;
    }
  }

  if (groupText.trim().length > 0) {
    const trimmed = groupText.trim();
    chunks.push(makeChunk(chunkIdx++, "registry_row_group", trimmed, groupStart,
      `Row group ${chunkIdx}`, null, { ...docMeta, section_type: "registry_row_group" },
      "registry_table",
    ));
  }

  return chunks;
}

// ─── NORMATIVE ACT CHUNKER ────────────────────────────────────────

/**
 * Chunks normative acts by numbered sections/paragraphs.
 * Uses structural boundaries (numbered items, Roman numeral sections).
 * Never uses fixed-window fallback.
 */
function chunkNormativeAct(text: string, docInput: LegalDocumentInput): LegalChunk[] {
  const docMeta: ChunkMetadata = {
    document_type: docInput.doc_type || "normative_act",
    document_title: docInput.title,
    date: docInput.date || extractDate(text),
  };

  const lines = text.split("\n");
  const sectionBoundaries: { lineIdx: number; label: string }[] = [];

  // Detect section boundaries: Roman numerals, numbered sections, bold headers
  const sectionHeaderRe = /^(?:[IVX]+\.\s+|(?:Chapter|Section|\u0533\u056c\u0578\u0582\u056d|\u0532\u0561\u056a\u056b\u0576)\s+\d+)/i;
  const numberedSectionRe = /^\d+\.\s+[A-Z\u0531-\u0556\u0410-\u042f]/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (sectionHeaderRe.test(line)) {
      sectionBoundaries.push({ lineIdx: i, label: line.slice(0, 80) });
    } else if (numberedSectionRe.test(line) && line.length < 200) {
      sectionBoundaries.push({ lineIdx: i, label: line.slice(0, 80) });
    }
  }

  if (sectionBoundaries.length === 0) {
    // Last resort: chunk by paragraph boundaries (still structural, not fixed-window)
    return chunkStructuralFallback(text, "normative_section", docMeta, docInput.doc_type);
  }

  const chunks: LegalChunk[] = [];
  let chunkIdx = 0;

  // Preamble before first section
  if (sectionBoundaries[0].lineIdx > 0) {
    const preambleLines = lines.slice(0, sectionBoundaries[0].lineIdx);
    const preambleText = preambleLines.join("\n").trim();
    if (preambleText.length > MIN_CHUNK_SIZE) {
      chunks.push(makeChunk(chunkIdx++, "preamble", preambleText, 0, null, null, {
        ...docMeta, section_type: "preamble",
      }, docInput.doc_type));
    }
  }

  for (let i = 0; i < sectionBoundaries.length; i++) {
    const startLine = sectionBoundaries[i].lineIdx;
    const endLine = i + 1 < sectionBoundaries.length ? sectionBoundaries[i + 1].lineIdx : lines.length;
    const sectionText = lines.slice(startLine, endLine).join("\n").trim();

    if (sectionText.length === 0) continue;

    // Calculate char offset
    let charStart = 0;
    for (let j = 0; j < startLine; j++) {
      charStart += lines[j].length + 1;
    }

    if (sectionText.length > MAX_CHUNK_CHARS) {
      const subChunks = splitSectionByParagraphs(
        sectionText, "normative_section", sectionBoundaries[i].label,
        charStart, chunkIdx, docMeta, docInput.doc_type,
      );
      for (const sc of subChunks) chunks.push(sc);
      chunkIdx += subChunks.length;
    } else {
      chunks.push(makeChunk(
        chunkIdx++, "normative_section", sectionText, charStart,
        sectionBoundaries[i].label,
        { section_title: sectionBoundaries[i].label },
        { ...docMeta, section_type: "normative_section" },
        docInput.doc_type,
      ));
    }
  }

  return chunks;
}

// ─── STRUCTURAL FALLBACK (paragraph-aware, replaces fixed-window) ──

/**
 * Structural fallback: splits by double newline (paragraphs).
 * Used instead of fixed-window to preserve paragraph boundaries.
 */
function chunkStructuralFallback(
  text: string,
  defaultType: ChunkType,
  docMeta?: ChunkMetadata,
  docType?: string,
): LegalChunk[] {
  const chunks: LegalChunk[] = [];
  const paragraphs = text.split(/\n\n+/);
  let currentText = "";
  let currentOffset = 0;
  let idx = 0;

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (trimmedPara.length === 0) continue;

    if (currentText.length + trimmedPara.length + 2 > MAX_CHUNK_CHARS && currentText.trim().length > 0) {
      const trimmed = currentText.trim();
      chunks.push(makeChunk(idx++, defaultType, trimmed, currentOffset, null, null, docMeta || null, docType));
      currentOffset += currentText.length + 2;
      currentText = trimmedPara;
    } else {
      if (currentText.length > 0) currentText += "\n\n";
      currentText += trimmedPara;
    }
  }

  if (currentText.trim().length > 0) {
    chunks.push(makeChunk(idx++, defaultType, currentText.trim(), currentOffset, null, null, docMeta || null, docType));
  }

  return chunks;
}

// Keep old name for backward compatibility
function chunkFixedWindow(text: string, defaultType: ChunkType, docMeta?: ChunkMetadata): LegalChunk[] {
  return chunkStructuralFallback(text, defaultType, docMeta);
}

// ─── TABLE CHUNK POST-PROCESSOR ────────────────────────────────────

function appendTableChunks(
  existingChunks: LegalChunk[],
  fullText: string,
  docMeta?: ChunkMetadata,
  docType?: string,
): LegalChunk[] {
  const tables = extractTables(fullText);
  if (tables.length === 0) return existingChunks;

  let nextIndex = existingChunks.length;
  const tableChunks: LegalChunk[] = [];

  for (const table of tables) {
    const captionLine = table.caption ? `${table.caption}\n\n` : "";
    const chunkText = `${captionLine}${table.markdown}`;

    const locator: ChunkLocator = {
      section_title: table.caption || `Table ${table.tableIndex + 1}`,
    };

    const chunk = makeChunk(
      nextIndex++, "table", chunkText, table.charStart,
      table.caption || `Table ${table.tableIndex + 1}`, locator,
      docMeta ? { ...docMeta, section_type: "table" } : null,
      docType,
    );

    tableChunks.push(chunk);
  }

  return [...existingChunks, ...tableChunks];
}

// ─── VALIDATE CHUNKS ──────────────────────────────────────────────

/**
 * Validates chunk coverage and integrity against original text.
 * Checks:
 * - No gaps in coverage (allowing for whitespace/trimming)
 * - No overlap between non-reasoning chunks
 * - No broken enumeration boundaries (numbered items not split mid-item)
 */
export function validateChunks(originalText: string, chunks: LegalChunk[]): ValidationResult {
  const errors: string[] = [];

  if (chunks.length === 0) {
    if (originalText.trim().length > 0) {
      errors.push("No chunks produced for non-empty text");
    }
    return { ok: errors.length === 0, errors };
  }

  // Sort by char_start
  const sorted = [...chunks].sort((a, b) => a.char_start - b.char_start);

  // Check for large gaps (>100 chars of non-whitespace)
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapStart = sorted[i].char_end;
    const gapEnd = sorted[i + 1].char_start;
    if (gapEnd > gapStart) {
      const gapText = originalText.slice(gapStart, gapEnd);
      if (gapText.trim().length > 100) {
        errors.push(
          `Gap of ${gapText.trim().length} non-whitespace chars between chunk ${sorted[i].chunk_index} and ${sorted[i + 1].chunk_index} (chars ${gapStart}-${gapEnd})`,
        );
      }
    }
  }

  // Check for overlap between non-reasoning chunks
  for (let i = 0; i < sorted.length - 1; i++) {
    const overlapAmount = sorted[i].char_end - sorted[i + 1].char_start;
    if (overlapAmount > 0) {
      const isReasoningOverlap = REASONING_TYPES.has(sorted[i + 1].chunk_type);
      if (!isReasoningOverlap && overlapAmount > 10) {
        errors.push(
          `Unexpected overlap of ${overlapAmount} chars between chunk ${sorted[i].chunk_index} (${sorted[i].chunk_type}) and ${sorted[i + 1].chunk_index} (${sorted[i + 1].chunk_type})`,
        );
      }
    }
  }

  // Check for broken enumeration: numbered items split across chunks
  for (const chunk of sorted) {
    const text = chunk.chunk_text;
    // Check if chunk starts mid-enumeration (e.g., continuation without a number)
    if (text.match(/^\s*[a-z\u0561-\u0586)]/) && !text.match(/^\s*\d/)) {
      // This might be a continuation — check if it's genuinely broken
      const firstLine = text.split("\n")[0].trim();
      if (firstLine.length < 20 && /^[a-z\u0561-\u0586)]/i.test(firstLine)) {
        errors.push(
          `Chunk ${chunk.chunk_index} may start with broken enumeration: "${firstLine.slice(0, 40)}"`,
        );
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

// ─── DOC TYPE ROUTING ─────────────────────────────────────────────

/**
 * Route to the appropriate chunking strategy based on doc type.
 * This is the internal dispatcher used by chunkDocument.
 */
export function chunkByDocType(input: LegalDocumentInput, docType: InferredDocType): ChunkResult {
  const text = input.content_text;
  if (!text || text.trim().length === 0) {
    return { chunks: [], strategy: "fixed", chunker_version: CHUNKER_VERSION };
  }

  let chunks: LegalChunk[];
  let strategy: ChunkResult["strategy"];
  let case_number: string | undefined;

  switch (docType) {
    case "code_or_law":
      chunks = chunkLegislation(text, input);
      strategy = chunks.some(c => c.chunk_type === "article") ? "article" : "normative";
      break;

    case "court_decision":
      chunks = chunkCourtDecision(text, input);
      strategy = chunks.some(c =>
        ["reasoning", "facts", "resolution", "dissent", "arguments", "legal_position",
         "procedural_history", "appellant_arguments", "respondent_arguments", "norm_interpretation",
        ].includes(c.chunk_type)
      ) ? "sections" : "normative";
      case_number = extractCaseNumber(text);
      break;

    case "treaty":
      chunks = chunkTreaty(text, input);
      strategy = chunks.some(c => c.chunk_type === "treaty_article") ? "treaty" : "normative";
      break;

    case "registry_table":
      chunks = chunkRegistryTable(text, input);
      strategy = "registry";
      break;

    case "normative_act":
      chunks = chunkNormativeAct(text, input);
      strategy = "normative";
      break;

    default:
      chunks = chunkStructuralFallback(text, "full_text", undefined, input.doc_type);
      strategy = "fixed";
      break;
  }

  const allChunks = appendTableChunks(chunks, text, undefined, input.doc_type);
  return { chunks: allChunks, strategy, case_number, chunker_version: CHUNKER_VERSION };
}

// ─── MAIN CHUNKER ──────────────────────────────────────────────────

const COURT_DOC_TYPES = new Set([
  "court_decision", "cassation_ruling", "appeal_ruling",
  "first_instance_ruling", "constitutional_court",
]);

const ECHR_DOC_TYPES = new Set([
  "echr_judgment", "echr",
]);

const LEGISLATION_DOC_TYPES = new Set([
  "law", "code", "regulation",
]);

const TREATY_DOC_TYPES = new Set([
  "international_treaty", "treaty", "agreement", "convention", "protocol",
]);

/**
 * Main entry point. Preserves original function signature.
 * Routes based on doc_type from input, with structural chunking for all paths.
 */
export function chunkDocument(document: LegalDocumentInput): ChunkResult {
  const text = document.content_text;
  if (!text || text.trim().length === 0) {
    return { chunks: [], strategy: "fixed", chunker_version: CHUNKER_VERSION };
  }

  let chunks: LegalChunk[];
  let strategy: ChunkResult["strategy"];
  let case_number: string | undefined;

  if (ECHR_DOC_TYPES.has(document.doc_type)) {
    chunks = chunkEchrJudgment(text, document);
    const hasSections = chunks.some(c =>
      ["procedure", "facts", "law", "assessment", "conclusion", "just_satisfaction"].includes(c.chunk_type)
    );
    strategy = hasSections ? "echr" : "normative";
    case_number = chunks[0]?.metadata?.case_number || undefined;
  } else if (TREATY_DOC_TYPES.has(document.doc_type)) {
    chunks = chunkTreaty(text, document);
    strategy = chunks.some(c => c.chunk_type === "treaty_article") ? "treaty" : "normative";
  } else if (LEGISLATION_DOC_TYPES.has(document.doc_type)) {
    chunks = chunkLegislation(text, document);
    strategy = chunks.some(c => c.chunk_type === "article") ? "article" : "normative";
  } else if (COURT_DOC_TYPES.has(document.doc_type)) {
    chunks = chunkCourtDecision(text, document);
    const hasSections = chunks.some(c =>
      ["reasoning", "facts", "resolution", "dissent", "arguments", "legal_position",
       "procedural_history", "appellant_arguments", "respondent_arguments", "norm_interpretation",
      ].includes(c.chunk_type)
    );
    strategy = hasSections ? "sections" : "normative";
    case_number = extractCaseNumber(text);
  } else {
    // For unknown types: try inferring, default to normative_act structural chunking
    const inferred = inferDocType(text);
    if (inferred !== "other") {
      return chunkByDocType(document, inferred);
    }
    chunks = chunkNormativeAct(text, document);
    strategy = "normative";
  }

  // Post-process: extract and append table chunks
  const allChunks = appendTableChunks(chunks, text, undefined, document.doc_type);
  return { chunks: allChunks, strategy, case_number, chunker_version: CHUNKER_VERSION };
}

// Re-export for direct use
export { extractTables, type ExtractedTable } from "./table-extractor.ts";
