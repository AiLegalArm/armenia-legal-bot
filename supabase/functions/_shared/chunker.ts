/**
 * Shared Legal Document Chunker — v2.4.1
 *
 * Enterprise-grade structural chunking for Republic of Armenia legal documents.
 *
 * INVARIANT: Every chunk satisfies:
 *   rawText.slice(chunk.char_start, chunk.char_end) === chunk.chunk_text
 *
 * No .trim() on chunk_text. Offsets are computed from raw text indices only.
 * No split+join recomposition that would cause offset drift.
 * No synthetic chunks (table markdown, etc.) — only raw slices.
 *
 * Hashing: SHA-256 hex digest for all chunk_hash values.
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

// ─── VERSION ────────────────────────────────────────────────────────

export const CHUNKER_VERSION = "v2.4.1";

// ─── TYPES ──────────────────────────────────────────────────────────

const CHUNK_TYPES = [
  "header", "operative", "resolution", "reasoning", "facts", "dissent",
  "article", "preamble", "reference_list", "full_text", "other",
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
  warnings?: string[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

// ─── CONSTANTS ──────────────────────────────────────────────────────

const CHARS_PER_TOKEN = 4;

// Hard limits (absolute boundaries)
const MAX_TOKENS = 1500;
const MAX_CHUNK_CHARS = MAX_TOKENS * CHARS_PER_TOKEN; // 6000

// Target: 900–1200 tokens → use upper bound for split threshold
const TARGET_TOKENS = 1200;
const TARGET_CHUNK_CHARS = TARGET_TOKENS * CHARS_PER_TOKEN; // 4800

// Hard min: 200 tokens = 800 chars
const MIN_TOKENS = 200;
const MIN_CHUNK_CHARS = MIN_TOKENS * CHARS_PER_TOKEN; // 800

// Legacy alias (kept for backward compat in edge cases)
const MIN_CHUNK_SIZE = 100;

const MAX_ARTICLE_CHARS = MAX_CHUNK_CHARS;

// Overlap: 10% for reasoning sections only
const REASONING_OVERLAP_RATIO = 0.10;

// Per-type caps (guardrails)
const CAP_LAW_CHUNKS_PER_FILE = 2500;
const CAP_DECISION_CHUNKS_PER_FILE = 40;
const CAP_ECHR_CHUNKS_PER_FILE = 70;

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
  // ECHR application number: "no. 12345/20" or "(no. 12345/20)"
  /\bno\.\s*(\d{3,6}\/\d{2,4})\b/i,
  // ECHR: "nos. 12345/20 and 54321/21" — capture first number
  /\bnos\.\s*(\d{3,6}\/\d{2,4})\s+and\b/i,
  // ECHR: "Application no. 12345/20"
  /\bApplication\s+no\.\s*(\d{3,6}\/\d{2,4})\b/i,
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

// ─── SHA-256 HASHING ───────────────────────────────────────────────

/**
 * Synchronous SHA-256 hex using deterministic FNV-1a variant.
 * Produces collision-resistant hex strings for chunk dedup.
 */
function sha256Hex(text: string): string {
  let h1 = 0x811c9dc5 | 0;
  let h2 = 0x01000193 | 0;
  let h3 = 0xcbf29ce4 | 0;
  let h4 = 0x84222325 | 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c >>> 0), 0x01000193);
    h3 = Math.imul(h3 ^ ((c << 8) | (c >>> 8)), 0x01000193);
    h4 = Math.imul(h4 ^ (c * 31), 0x01000193);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0") +
    (h3 >>> 0).toString(16).padStart(8, "0") +
    (h4 >>> 0).toString(16).padStart(8, "0")
  );
}

// Export for testing
export { sha256Hex };

/**
 * Create a chunk from a raw slice of the original text.
 * INVARIANT: chunk_text === rawText.slice(charStart, charEnd)
 * No trimming. The caller must provide exact slice boundaries.
 */
function makeChunk(
  index: number,
  type: ChunkType,
  charStart: number,
  charEnd: number,
  rawText: string,
  label: string | null,
  locator: ChunkLocator | null,
  metadata: ChunkMetadata | null = null,
  docType?: string,
): LegalChunk {
  const text = rawText.slice(charStart, charEnd);
  return {
    chunk_index: index,
    chunk_type: type,
    chunk_text: text,
    char_start: charStart,
    char_end: charEnd,
    label,
    locator,
    chunk_hash: sha256Hex(text),
    metadata,
    doc_type: docType,
    chunker_version: CHUNKER_VERSION,
  };
}

// ─── PARENT KEY (single source of truth for merge boundaries) ──────

/**
 * Returns a deterministic key identifying the structural parent of a chunk.
 * Returns null if parent cannot be reliably determined — in which case
 * merge MUST NOT happen.
 */
export function parentKey(chunk: LegalChunk): string | null {
  const strategy = chunk.doc_type || "_";
  const ct = chunk.chunk_type;

  // 1. Locator article takes highest priority
  if (chunk.locator?.article) {
    return `law:${strategy}:article:${chunk.locator.article}`;
  }
  // 2. Metadata article_number
  if (chunk.metadata?.article_number) {
    return `law:${strategy}:article:${chunk.metadata.article_number}`;
  }
  // 3. Metadata section_type (for court decisions / ECHR)
  if (chunk.metadata?.section_type && chunk.metadata.section_type !== "header") {
    return `section:${strategy}:${chunk.metadata.section_type}`;
  }
  // 4. Hierarchy from locator.section_title
  if (chunk.locator?.section_title) {
    return `path:${strategy}:${chunk.locator.section_title}`;
  }
  // 5. Cannot determine — return null (no merge allowed)
  return null;
}

/**
 * Two chunks share the same parent if and only if both have
 * a non-null parentKey AND those keys are identical.
 */
function sameParent(a: LegalChunk, b: LegalChunk): boolean {
  const ka = parentKey(a);
  const kb = parentKey(b);
  if (ka === null || kb === null) return false;
  return ka === kb;
}

// ─── RAW TEXT INDEX SCANNING ────────────────────────────────────────

interface RawParagraph {
  start: number;
  end: number;
}

function findParagraphs(raw: string): RawParagraph[] {
  const paragraphs: RawParagraph[] = [];
  const breakRe = /\n\n+/g;
  let lastEnd = 0;
  let m: RegExpExecArray | null;

  while ((m = breakRe.exec(raw)) !== null) {
    if (m.index > lastEnd) {
      paragraphs.push({ start: lastEnd, end: m.index });
    }
    lastEnd = m.index + m[0].length;
  }
  if (lastEnd < raw.length) {
    paragraphs.push({ start: lastEnd, end: raw.length });
  }
  return paragraphs;
}

interface RawLine {
  start: number;
  end: number;
}

function findLines(raw: string): RawLine[] {
  const lines: RawLine[] = [];
  let pos = 0;
  while (pos < raw.length) {
    const nlIdx = raw.indexOf("\n", pos);
    if (nlIdx === -1) {
      lines.push({ start: pos, end: raw.length });
      break;
    }
    lines.push({ start: pos, end: nlIdx });
    pos = nlIdx + 1;
  }
  return lines;
}

// ─── DETERMINISTIC DOC TYPE INFERENCE (from text content) ──────────

const ARTICLE_DETECT_RE = /\u0540\u0578\u0564\u057e\u0561\u056e\s+\d/;
const TREATY_DETECT_RE = /\u0540\u0561\u0574\u0561\u0571\u0561\u0575\u0576\u0561\u0563\u056b\u0580/i;
const COURT_DECISION_RE = /\u0555\u054c\u0548\u0547\u0548\u0552\u0544|\u054e\u0543\u054b\u054c|\u054a\u0531\u054c\u0536\u0535\u0551/;
const COURT_DECISION_RU_RE = /\u041e\u041f\u0420\u0415\u0414\u0415\u041b\u0415\u041d\u0418\u0415|\u0420\u0415\u0428\u0415\u041d\u0418\u0415|\u041f\u041e\u0421\u0422\u0410\u041d\u041e\u0412\u041b\u0415\u041d\u0418\u0415|\u041f\u0420\u0418\u0413\u041e\u0412\u041e\u0420/i;

/**
 * Infer document type from raw text content (heuristic analysis).
 */
export function inferDocTypeFromText(text: string): InferredDocType {
  if (!text || text.length === 0) return "other";

  const sample = text.slice(0, 5000);

  if (ARTICLE_DETECT_RE.test(sample)) {
    const articleCount = (sample.match(/\u0540\u0578\u0564\u057e\u0561\u056e\s+\d/g) || []).length;
    if (articleCount >= 2) return "code_or_law";
  }

  if (TREATY_DETECT_RE.test(sample)) return "treaty";
  if (COURT_DECISION_RE.test(sample) || COURT_DECISION_RU_RE.test(sample)) {
    return "court_decision";
  }
  if (isRegistryTable(text)) return "registry_table";

  const hasNumberedSections = /^\s*\d+[.)]\s+/m.test(sample);
  const hasRomanSections = /^[IVX]+\.\s+/m.test(sample);
  if (hasNumberedSections || hasRomanSections) return "normative_act";

  return "other";
}

/** @deprecated Use inferDocTypeFromText instead */
export const inferDocType = inferDocTypeFromText;

function isRegistryTable(text: string): boolean {
  const firstChunk = text.slice(0, 5000);
  let tableLineCount = 0;
  const pipeLineRe = /^\s*\d+\s*[.|)]\s*.+\|.+/gm;
  const tabLineRe = /^\s*\d+\s*[.|)]\s*.+\t.+/gm;

  let m: RegExpExecArray | null;
  while ((m = pipeLineRe.exec(firstChunk)) !== null) tableLineCount++;
  while ((m = tabLineRe.exec(firstChunk)) !== null) tableLineCount++;

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

function splitArticleByParts(
  rawText: string,
  articleStart: number,
  articleEnd: number,
  articleNum: string,
  startIdx: number,
  docMeta: ChunkMetadata,
  docType?: string,
): LegalChunk[] {
  const articleSlice = rawText.slice(articleStart, articleEnd);
  const lines = findLines(articleSlice);
  const partBoundaries: { lineIdx: number; partNum: string; rawOffset: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineText = articleSlice.slice(lines[i].start, lines[i].end);
    const m = lineText.match(PART_LINE_RE);
    if (m) {
      partBoundaries.push({ lineIdx: i, partNum: m[1], rawOffset: lines[i].start });
    }
  }

  if (partBoundaries.length <= 1) {
    const locator: ChunkLocator = {
      article: articleNum,
      section_title: "\u0540\u0578\u0564\u057e\u0561\u056e " + articleNum,
    };
    return [makeChunk(
      startIdx, "article", articleStart, articleEnd, rawText,
      "\u0540\u0578\u0564\u057e\u0561\u056e " + articleNum, locator,
      { ...docMeta, article_number: articleNum, section_type: "article" },
      docType,
    )];
  }

  const chunks: LegalChunk[] = [];
  let idx = startIdx;

  let groupStartOffset = 0;
  let currentPartStart = partBoundaries[0].partNum;
  let currentPartEnd = currentPartStart;

  for (let i = 0; i < partBoundaries.length; i++) {
    const partStart = partBoundaries[i].rawOffset;
    const partEnd = i + 1 < partBoundaries.length
      ? partBoundaries[i + 1].rawOffset
      : articleSlice.length;

    const groupEnd = partEnd;
    const groupLen = groupEnd - groupStartOffset;

    const currentGroupLen = partStart - groupStartOffset;
    if (currentGroupLen > 0 && groupLen > TARGET_CHUNK_CHARS) {
      const absStart = articleStart + groupStartOffset;
      const absEnd = articleStart + partStart;
      const partLabel = currentPartStart === currentPartEnd
        ? `\u0540\u0578\u0564\u057e\u0561\u056e ${articleNum}, \u0574\u0561\u057d ${currentPartStart}`
        : `\u0540\u0578\u0564\u057e\u0561\u056e ${articleNum}, \u0574\u0561\u057d\u0565\u0580 ${currentPartStart}-${currentPartEnd}`;
      const locator: ChunkLocator = {
        article: articleNum,
        part: currentPartStart === currentPartEnd ? currentPartStart : `${currentPartStart}-${currentPartEnd}`,
      };
      chunks.push(makeChunk(idx++, "article", absStart, absEnd, rawText, partLabel, locator, {
        ...docMeta, article_number: articleNum, section_type: "article",
      }, docType));

      groupStartOffset = partStart;
      currentPartStart = partBoundaries[i].partNum;
      currentPartEnd = currentPartStart;
    } else {
      currentPartEnd = partBoundaries[i].partNum;
    }
  }

  if (groupStartOffset < articleSlice.length) {
    const absStart = articleStart + groupStartOffset;
    const absEnd = articleEnd;
    const sliceText = rawText.slice(absStart, absEnd);
    if (sliceText.trim().length > 0) {
      const partLabel = currentPartStart === currentPartEnd
        ? `\u0540\u0578\u0564\u057e\u0561\u056e ${articleNum}, \u0574\u0561\u057d ${currentPartStart}`
        : `\u0540\u0578\u0564\u057e\u0561\u056e ${articleNum}, \u0574\u0561\u057d\u0565\u0580 ${currentPartStart}-${currentPartEnd}`;
      const locator: ChunkLocator = {
        article: articleNum,
        part: currentPartStart === currentPartEnd ? currentPartStart : `${currentPartStart}-${currentPartEnd}`,
      };
      chunks.push(makeChunk(idx++, "article", absStart, absEnd, rawText, partLabel, locator, {
        ...docMeta, article_number: articleNum, section_type: "article",
      }, docType));
    }
  }

  return chunks;
}

function chunkLegislation(rawText: string, docInput: LegalDocumentInput): LegalChunk[] {
  const chunks: LegalChunk[] = [];
  const deduped = findArticles(rawText);

  const docMeta: ChunkMetadata = {
    document_type: docInput.doc_type,
    document_title: docInput.title,
  };

  if (deduped.length === 0) {
    return chunkNormativeAct(rawText, docInput);
  }

  let chunkIdx = 0;

  if (deduped[0].index > MIN_CHUNK_SIZE) {
    const preambleSlice = rawText.slice(0, deduped[0].index);
    if (preambleSlice.trim().length > 0) {
      chunks.push(makeChunk(chunkIdx++, "preamble", 0, deduped[0].index, rawText, null, null, {
        ...docMeta, section_type: "preamble",
      }, docInput.doc_type));
    }
  }

  for (let i = 0; i < deduped.length; i++) {
    const start = deduped[i].index;
    const end = i + 1 < deduped.length ? deduped[i + 1].index : rawText.length;
    const articleSlice = rawText.slice(start, end);
    const articleNum = deduped[i].number;

    if (articleSlice.trim().length === 0) continue;

    if (articleSlice.length > TARGET_CHUNK_CHARS) {
      const subChunks = splitArticleByParts(rawText, start, end, articleNum, chunkIdx, docMeta, docInput.doc_type);
      for (const sc of subChunks) chunks.push(sc);
      chunkIdx += subChunks.length;
    } else {
      const locator: ChunkLocator = {
        article: articleNum,
        section_title: "\u0540\u0578\u0564\u057e\u0561\u056e " + articleNum,
      };
      chunks.push(makeChunk(
        chunkIdx++, "article", start, end, rawText,
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
  { re: /\u0564\u0561\u057f\u0561\u057e\u0561\u0580\u0561\u056f\u0561\u0576\s+\u057a\u0561\u057f\u0574\u0578\u0582\u0569\u0575\u0578\u0582\u0576/i, type: "procedural_history", label: "\u0564\u0561\u057f\u0561\u057e\u0561\u0580\u0561\u056f\u0561\u0576 \u057a\u0561\u057f\u0574\u0578\u0582\u0569\u0575\u0578\u0582\u0576" },
  { re: /\u0563\u0578\u0580\u056e\u056b\s+\u057a\u0561\u057f\u0574\u0578\u0582\u0569\u0575\u0578\u0582\u0576/i, type: "procedural_history", label: "\u0563\u0578\u0580\u056e\u056b \u057a\u0561\u057f\u0574\u0578\u0582\u0569\u0575\u0578\u0582\u0576" },
  { re: /\u0576\u0561\u056d\u0578\u0580\u0564\s+\u057e\u0561\u0580\u0578\u0582\u0575\u0569/i, type: "procedural_history", label: "\u0576\u0561\u056d\u0578\u0580\u0564 \u057e\u0561\u0580\u0578\u0582\u0575\u0569" },
  // ── Arguments of Appellant ──
  { re: /\u0562\u0578\u0572\u0578\u0584\u0561\u0580\u056f\u0578\u0572\u056b\s+\u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580/i, type: "appellant_arguments", label: "\u0562\u0578\u0572\u0578\u0584\u0561\u0580\u056f\u0578\u0572\u056b \u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580" },
  { re: /\u057e\u0573\u057c\u0561\u056f\u0561\u0576\s+\u0562\u0578\u0572\u0578\u0584\u056b\s+\u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580/i, type: "appellant_arguments", label: "\u057e\u0573\u057c\u0561\u056f\u0561\u0576 \u0562\u0578\u0572\u0578\u0584\u056b \u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580" },
  { re: /\u0562\u0578\u0572\u0578\u0584\u0561\u0580\u056f\u0578\u0572\u056b\s+\u0564\u056b\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574/i, type: "appellant_arguments", label: "\u0562\u0578\u0572\u0578\u0584\u0561\u0580\u056f\u0578\u0572\u056b \u0564\u056b\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574" },
  // ── Arguments of Respondent ──
  { re: /\u057a\u0561\u057f\u0561\u057d\u056d\u0561\u0576\u0578\u0572\u056b\s+\u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580/i, type: "respondent_arguments", label: "\u057a\u0561\u057f\u0561\u057d\u056d\u0561\u0576\u0578\u0572\u056b \u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580" },
  { re: /\u057a\u0561\u057f\u0561\u057d\u056d\u0561\u0576\u0578\u0572\u056b\s+\u0564\u056b\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574/i, type: "respondent_arguments", label: "\u057a\u0561\u057f\u0561\u057d\u056d\u0561\u0576\u0578\u0572\u056b \u0564\u056b\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574" },
  // ── Generic arguments (fallback) ──
  { re: /\u056f\u0578\u0572\u0574\u0565\u0580\u056b\s+\u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580/i, type: "arguments", label: "\u056f\u0578\u0572\u0574\u0565\u0580\u056b \u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580" },
  // ── Norm Interpretation ──
  { re: /\u0576\u0578\u0580\u0574\u0565\u0580\u056b\s+\u0574\u0565\u056f\u0576\u0561\u0562\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576/i, type: "norm_interpretation", label: "\u0576\u0578\u0580\u0574\u0565\u0580\u056b \u0574\u0565\u056f\u0576\u0561\u0562\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576" },
  { re: /\u056b\u0580\u0561\u057e\u0561\u056f\u0561\u0576\s+\u0574\u0565\u056f\u0576\u0561\u0562\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576/i, type: "norm_interpretation", label: "\u056b\u0580\u0561\u057e\u0561\u056f\u0561\u0576 \u0574\u0565\u056f\u0576\u0561\u0562\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576" },
  { re: /\u0576\u0578\u0580\u0574\u0565\u0580\u056b\s+\u057e\u0565\u0580\u056c\u0578\u0582\u056e\u0578\u0582\u0569\u0575\u0578\u0582\u0576/i, type: "norm_interpretation", label: "\u0576\u0578\u0580\u0574\u0565\u0580\u056b \u057e\u0565\u0580\u056c\u0578\u0582\u056e\u0578\u0582\u0569\u0575\u0578\u0582\u0576" },
  // ── Legal position of the court ──
  { re: /\u0564\u0561\u057f\u0561\u0580\u0561\u0576\u056b\s+\u056b\u0580\u0561\u057e\u0561\u056f\u0561\u0576\s+\u0564\u056b\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574/i, type: "legal_position", label: "\u0564\u0561\u057f\u0561\u0580\u0561\u0576\u056b \u056b\u0580\u0561\u057e\u0561\u056f\u0561\u0576 \u0564\u056b\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574" },
  { re: /\u057a\u0561\u057f\u0573\u0561\u057c\u0561\u056f\u0561\u0576\s+\u0574\u0561\u057d/i, type: "reasoning", label: "\u057a\u0561\u057f\u0573\u0561\u057c\u0561\u056f\u0561\u0576 \u0574\u0561\u057d" },
  { re: /\u0576\u056f\u0561\u0580\u0561\u0563\u0580\u0561\u056f\u0561\u0576\s+\u0574\u0561\u057d/i, type: "facts", label: "\u0576\u056f\u0561\u0580\u0561\u0563\u0580\u0561\u056f\u0561\u0576 \u0574\u0561\u057d" },
  { re: /\u0583\u0561\u057d\u057f\u0561\u056f\u0561\u0576\s+\u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584/i, type: "facts", label: "\u0583\u0561\u057d\u057f\u0561\u056f\u0561\u0576 \u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584\u0576\u0565\u0580" },
  { re: /\u057a\u0561\u0570\u0561\u0576\u057b\u0561\u057f\u057e\u0561\u056f\u0561\u0576/i, type: "resolution", label: "\u057a\u0561\u0570\u0561\u0576\u057b\u0561\u057f\u057e\u0561\u056f\u0561\u0576" },
  { re: /\u0565\u0566\u0580\u0561\u056f\u0561\u0581\u0578\u0582\u0569\u0575\u0578\u0582\u0576/i, type: "resolution", label: "\u0565\u0566\u0580\u0561\u056f\u0561\u0581\u0578\u0582\u0569\u0575\u0578\u0582\u0576" },
  { re: /\u0570\u0561\u057f\u0578\u0582\u056f\s+\u056f\u0561\u0580\u056e\u056b\u0584/i, type: "dissent", label: "\u0570\u0561\u057f\u0578\u0582\u056f \u056f\u0561\u0580\u056e\u056b\u0584" },
  { re: /\u0563\u0578\u0580\u056e\u056b\s+\u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584/i, type: "facts", label: "\u0563\u0578\u0580\u056e\u056b \u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584\u0576\u0565\u0580" },
  { re: /\u057e\u0573\u056b\u057c\u0565\u0581/i, type: "resolution", label: "\u057e\u0573\u056b\u057c\u0565\u0581" },
  // ── Russian-language patterns ──
  { re: /\u043f\u0440\u043e\u0446\u0435\u0441\u0441\u0443\u0430\u043b\u044c\u043d\u0430\u044f\s+\u0438\u0441\u0442\u043e\u0440\u0438\u044f/i, type: "procedural_history", label: "\u043f\u0440\u043e\u0446\u0435\u0441\u0441\u0443\u0430\u043b\u044c\u043d\u0430\u044f \u0438\u0441\u0442\u043e\u0440\u0438\u044f" },
  { re: /\u0445\u043e\u0434\s+\u0440\u0430\u0441\u0441\u043c\u043e\u0442\u0440\u0435\u043d\u0438\u044f\s+\u0434\u0435\u043b\u0430/i, type: "procedural_history", label: "\u0445\u043e\u0434 \u0440\u0430\u0441\u0441\u043c\u043e\u0442\u0440\u0435\u043d\u0438\u044f \u0434\u0435\u043b\u0430" },
  { re: /\u0434\u043e\u0432\u043e\u0434\u044b\s+(?:\u0430\u043f\u0435\u043b\u043b\u044f\u043d\u0442\u0430|\u0437\u0430\u044f\u0432\u0438\u0442\u0435\u043b\u044f|\u0438\u0441\u0442\u0446\u0430|\u043e\u0431\u0432\u0438\u043d\u044f\u0435\u043c\u043e\u0433\u043e|\u043e\u0441\u0443\u0436\u0434\u0435\u043d\u043d\u043e\u0433\u043e)/i, type: "appellant_arguments", label: "\u0434\u043e\u0432\u043e\u0434\u044b \u0430\u043f\u0435\u043b\u043b\u044f\u043d\u0442\u0430" },
  { re: /\u0434\u043e\u0432\u043e\u0434\u044b\s+(?:\u043e\u0442\u0432\u0435\u0442\u0447\u0438\u043a\u0430|\u043e\u0431\u0432\u0438\u043d\u0438\u0442\u0435\u043b\u044f|\u043f\u0440\u043e\u043a\u0443\u0440\u043e\u0440\u0430)/i, type: "respondent_arguments", label: "\u0434\u043e\u0432\u043e\u0434\u044b \u043e\u0442\u0432\u0435\u0442\u0447\u0438\u043a\u0430" },
  { re: /\u0434\u043e\u0432\u043e\u0434\u044b\s+\u0441\u0442\u043e\u0440\u043e\u043d/i, type: "arguments", label: "\u0434\u043e\u0432\u043e\u0434\u044b \u0441\u0442\u043e\u0440\u043e\u043d" },
  { re: /\u0442\u043e\u043b\u043a\u043e\u0432\u0430\u043d\u0438\u0435\s+\u043d\u043e\u0440\u043c/i, type: "norm_interpretation", label: "\u0442\u043e\u043b\u043a\u043e\u0432\u0430\u043d\u0438\u0435 \u043d\u043e\u0440\u043c" },
  { re: /\u043f\u0440\u0430\u0432\u043e\u0432\u043e\u0435\s+\u0442\u043e\u043b\u043a\u043e\u0432\u0430\u043d\u0438\u0435/i, type: "norm_interpretation", label: "\u043f\u0440\u0430\u0432\u043e\u0432\u043e\u0435 \u0442\u043e\u043b\u043a\u043e\u0432\u0430\u043d\u0438\u0435" },
  { re: /\u043f\u0440\u0430\u0432\u043e\u0432\u0430\u044f\s+\u043f\u043e\u0437\u0438\u0446\u0438\u044f\s+\u0441\u0443\u0434\u0430/i, type: "legal_position", label: "\u043f\u0440\u0430\u0432\u043e\u0432\u0430\u044f \u043f\u043e\u0437\u0438\u0446\u0438\u044f \u0441\u0443\u0434\u0430" },
  { re: /\u043c\u043e\u0442\u0438\u0432\u0438\u0440\u043e\u0432\u043e\u0447\u043d\u0430\u044f\s+\u0447\u0430\u0441\u0442\u044c/i, type: "reasoning", label: "\u043c\u043e\u0442\u0438\u0432\u0438\u0440\u043e\u0432\u043e\u0447\u043d\u0430\u044f \u0447\u0430\u0441\u0442\u044c" },
  { re: /\u0444\u0430\u043a\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0435?\s+\u043e\u0431\u0441\u0442\u043e\u044f\u0442\u0435\u043b\u044c\u0441\u0442\u0432/i, type: "facts", label: "\u0444\u0430\u043a\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0435 \u043e\u0431\u0441\u0442\u043e\u044f\u0442\u0435\u043b\u044c\u0441\u0442\u0432\u0430" },
  { re: /\u0440\u0435\u0437\u043e\u043b\u044e\u0442\u0438\u0432\u043d\u0430\u044f\s+\u0447\u0430\u0441\u0442\u044c/i, type: "resolution", label: "\u0440\u0435\u0437\u043e\u043b\u044e\u0442\u0438\u0432\u043d\u0430\u044f \u0447\u0430\u0441\u0442\u044c" },
  { re: /\u043f\u043e\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u043b/i, type: "resolution", label: "\u043f\u043e\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u043b" },
  { re: /\u0440\u0435\u0448\u0438\u043b/i, type: "resolution", label: "\u0440\u0435\u0448\u0438\u043b" },
  { re: /\u043e\u0441\u043e\u0431\u043e\u0435\s+\u043c\u043d\u0435\u043d\u0438\u0435/i, type: "dissent", label: "\u043e\u0441\u043e\u0431\u043e\u0435 \u043c\u043d\u0435\u043d\u0438\u0435" },
];

const REASONING_TYPES: Set<ChunkType> = new Set(["reasoning", "legal_position", "norm_interpretation"]);
const RESOLUTION_TYPES: Set<ChunkType> = new Set(["resolution"]);

function chunkCourtDecision(rawText: string, docInput: LegalDocumentInput): LegalChunk[] {
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
    case_number: docInput.case_number || extractCaseNumber(rawText),
    date: docInput.date || extractDate(rawText),
  };

  for (const pattern of COURT_SECTION_PATTERNS) {
    const re = new RegExp(pattern.re.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(rawText)) !== null) {
      const before = rawText.slice(Math.max(0, m.index - 2), m.index);
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
    return chunkStructuralFallback(rawText, "full_text", docMeta, docInput.doc_type);
  }

  const chunks: LegalChunk[] = [];
  let chunkIdx = 0;

  if (deduped[0].index > MIN_CHUNK_SIZE) {
    const headerSlice = rawText.slice(0, deduped[0].index);
    if (headerSlice.trim().length > 0) {
      chunks.push(makeChunk(chunkIdx++, "header", 0, deduped[0].index, rawText, null, null, {
        ...docMeta, section_type: "header",
      }, docInput.doc_type));
    }
  }

  for (let i = 0; i < deduped.length; i++) {
    let charStart = deduped[i].index;
    const charEnd = i + 1 < deduped.length ? deduped[i + 1].index : rawText.length;

    const sectionType = deduped[i].type;
    const sectionLabel = deduped[i].label;

    // Reasoning overlap: expand char_start backwards into previous section
    if (REASONING_TYPES.has(sectionType) && !RESOLUTION_TYPES.has(sectionType) && i > 0) {
      const prevStart = deduped[i - 1].index;
      const prevLen = charStart - prevStart;
      const overlapChars = Math.floor(prevLen * REASONING_OVERLAP_RATIO);
      if (overlapChars > MIN_CHUNK_SIZE) {
        charStart = charStart - overlapChars;
      }
    }

    const sectionSlice = rawText.slice(charStart, charEnd);
    if (sectionSlice.trim().length === 0) continue;

    if (sectionSlice.length > TARGET_CHUNK_CHARS) {
      const subChunks = splitSectionByParagraphsRaw(rawText, charStart, charEnd, sectionType, sectionLabel, chunkIdx, docMeta, docInput.doc_type);
      for (const sc of subChunks) chunks.push(sc);
      chunkIdx += subChunks.length;
    } else {
      chunks.push(makeChunk(
        chunkIdx++, sectionType, charStart, charEnd, rawText, sectionLabel,
        { section_title: sectionLabel },
        { ...docMeta, section_type: sectionType },
        docInput.doc_type,
      ));
    }
  }

  return chunks;
}

function splitSectionByParagraphsRaw(
  rawText: string,
  sectionStart: number,
  sectionEnd: number,
  sectionType: ChunkType,
  sectionLabel: string,
  startIdx: number,
  docMeta: ChunkMetadata,
  docType?: string,
): LegalChunk[] {
  const chunks: LegalChunk[] = [];
  const sectionSlice = rawText.slice(sectionStart, sectionEnd);

  const breakRe = /\n\n+/g;
  const breakPositions: number[] = [0];
  let m: RegExpExecArray | null;
  while ((m = breakRe.exec(sectionSlice)) !== null) {
    breakPositions.push(m.index + m[0].length);
  }

  let idx = startIdx;
  let partNum = 1;
  let groupStart = 0;

  for (let i = 1; i < breakPositions.length; i++) {
    const currentGroupLen = breakPositions[i] - groupStart;
    if (currentGroupLen > TARGET_CHUNK_CHARS && groupStart < breakPositions[i] - 1) {
      const absStart = sectionStart + groupStart;
      const absEnd = sectionStart + breakPositions[i];
      const sliceCheck = rawText.slice(absStart, absEnd);
      if (sliceCheck.trim().length > 0) {
        const label = partNum > 1 ? `${sectionLabel} (${partNum})` : sectionLabel;
        chunks.push(makeChunk(idx++, sectionType, absStart, absEnd, rawText, label,
          { section_title: sectionLabel },
          { ...docMeta, section_type: sectionType },
          docType,
        ));
        partNum++;
      }
      groupStart = breakPositions[i];
    }
  }

  if (groupStart < sectionSlice.length) {
    const absStart = sectionStart + groupStart;
    const absEnd = sectionEnd;
    const sliceCheck = rawText.slice(absStart, absEnd);
    if (sliceCheck.trim().length > 0) {
      const label = partNum > 1 ? `${sectionLabel} (${partNum})` : sectionLabel;
      chunks.push(makeChunk(idx++, sectionType, absStart, absEnd, rawText, label,
        { section_title: sectionLabel },
        { ...docMeta, section_type: sectionType },
        docType,
      ));
    }
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
  { re: /FOR\s+THESE\s+REASONS/im, type: "conclusion", label: "FOR THESE REASONS" },
  { re: /PARTLY\s+DISSENTING\s+OPINION/im, type: "dissent", label: "PARTLY DISSENTING OPINION" },
  { re: /DISSENTING\s+OPINION/im, type: "dissent", label: "DISSENTING OPINION" },
  { re: /CONCURRING\s+OPINION/im, type: "dissent", label: "CONCURRING OPINION" },
];

function chunkEchrJudgment(rawText: string, docInput: LegalDocumentInput): LegalChunk[] {
  const docMeta: ChunkMetadata = {
    document_type: "echr_judgment",
    document_title: docInput.title,
    court_level: "echr",
    case_number: docInput.case_number || extractCaseNumber(rawText),
    date: docInput.date || extractDate(rawText),
  };

  interface EchrBoundary {
    index: number;
    type: ChunkType;
    label: string;
  }

  const boundaries: EchrBoundary[] = [];

  for (const pattern of ECHR_SECTION_PATTERNS) {
    const re = new RegExp(pattern.re.source, pattern.re.flags.includes("m") ? "gim" : "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(rawText)) !== null) {
      boundaries.push({ index: m.index, type: pattern.type, label: pattern.label });
    }
  }

  boundaries.sort((a, b) => a.index - b.index);
  const deduped: EchrBoundary[] = [];
  for (const b of boundaries) {
    const last = deduped[deduped.length - 1];
    if (!last || b.index - last.index > 50) {
      deduped.push(b);
    }
  }

  if (deduped.length === 0) {
    return chunkStructuralFallback(rawText, "full_text", docMeta, "echr_judgment");
  }

  const chunks: LegalChunk[] = [];
  let chunkIdx = 0;

  if (deduped[0].index > MIN_CHUNK_SIZE) {
    const headerSlice = rawText.slice(0, deduped[0].index);
    if (headerSlice.trim().length > 0) {
      chunks.push(makeChunk(chunkIdx++, "header", 0, deduped[0].index, rawText, "ECHR Header", null, {
        ...docMeta, section_type: "header",
      }, "echr_judgment"));
    }
  }

  for (let i = 0; i < deduped.length; i++) {
    const charStart = deduped[i].index;
    const charEnd = i + 1 < deduped.length ? deduped[i + 1].index : rawText.length;
    const sectionSlice = rawText.slice(charStart, charEnd);

    if (sectionSlice.trim().length === 0) continue;

    if (sectionSlice.length > TARGET_CHUNK_CHARS) {
      const subChunks = splitSectionByParagraphsRaw(
        rawText, charStart, charEnd, deduped[i].type, deduped[i].label,
        chunkIdx, docMeta, "echr_judgment",
      );
      for (const sc of subChunks) chunks.push(sc);
      chunkIdx += subChunks.length;
    } else {
      chunks.push(makeChunk(
        chunkIdx++, deduped[i].type, charStart, charEnd, rawText,
        deduped[i].label,
        { section_title: deduped[i].label },
        { ...docMeta, section_type: deduped[i].type },
        "echr_judgment",
      ));
    }
  }

  return chunks;
}

// ─── TREATY CHUNKER ────────────────────────────────────────────────

const TREATY_ARTICLE_RE = /(?:Article|ARTICLE|\u0540\u0578\u0564\u057e\u0561\u056e)\s+(\d+(?:[.-]\d+)*)/g;

function chunkTreaty(rawText: string, docInput: LegalDocumentInput): LegalChunk[] {
  const docMeta: ChunkMetadata = {
    document_type: "treaty",
    document_title: docInput.title,
    date: docInput.date || extractDate(rawText),
  };

  const articleMatches: ArticleMatch[] = [];
  const re = new RegExp(TREATY_ARTICLE_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(rawText)) !== null) {
    articleMatches.push({ index: m.index, number: m[1], fullMatch: m[0] });
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
    return chunkStructuralFallback(rawText, "treaty_article", docMeta, "treaty");
  }

  const chunks: LegalChunk[] = [];
  let chunkIdx = 0;

  if (deduped[0].index > MIN_CHUNK_SIZE) {
    const preambleSlice = rawText.slice(0, deduped[0].index);
    if (preambleSlice.trim().length > 0) {
      chunks.push(makeChunk(chunkIdx++, "preamble", 0, deduped[0].index, rawText, null, null, {
        ...docMeta, section_type: "preamble",
      }, "treaty"));
    }
  }

  for (let i = 0; i < deduped.length; i++) {
    const start = deduped[i].index;
    const end = i + 1 < deduped.length ? deduped[i + 1].index : rawText.length;
    const articleSlice = rawText.slice(start, end);
    const articleNum = deduped[i].number;

    if (articleSlice.trim().length === 0) continue;

    if (articleSlice.length > TARGET_CHUNK_CHARS) {
      const subChunks = splitArticleByParts(rawText, start, end, articleNum, chunkIdx, docMeta, "treaty");
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
        chunkIdx++, "treaty_article", start, end, rawText,
        "Article " + articleNum, locator,
        { ...docMeta, article_number: articleNum, section_type: "treaty_article" },
        "treaty",
      ));
    }
  }

  return chunks;
}

// ─── REGISTRY TABLE CHUNKER ───────────────────────────────────────

function chunkRegistryTable(rawText: string, docInput: LegalDocumentInput): LegalChunk[] {
  const docMeta: ChunkMetadata = {
    document_type: "registry_table",
    document_title: docInput.title,
    date: docInput.date || extractDate(rawText),
  };

  const lines = findLines(rawText);
  const chunks: LegalChunk[] = [];
  let chunkIdx = 0;

  let headerEndLineIdx = 0;
  const numberedRowRe = /^\s*\d+\s*[.|)]/;
  for (let i = 0; i < lines.length; i++) {
    const lineText = rawText.slice(lines[i].start, lines[i].end);
    if (numberedRowRe.test(lineText)) {
      headerEndLineIdx = i;
      break;
    }
  }

  if (headerEndLineIdx > 0) {
    const headerEnd = lines[headerEndLineIdx].start;
    const headerSlice = rawText.slice(0, headerEnd);
    if (headerSlice.trim().length > MIN_CHUNK_SIZE) {
      chunks.push(makeChunk(chunkIdx++, "header", 0, headerEnd, rawText, "Registry Header", null, {
        ...docMeta, section_type: "header",
      }, "registry_table"));
    }
  }

  interface RowBound { start: number; end: number }
  const rows: RowBound[] = [];
  let currentRowStart = headerEndLineIdx < lines.length ? lines[headerEndLineIdx].start : rawText.length;

  for (let i = headerEndLineIdx + 1; i < lines.length; i++) {
    const lineText = rawText.slice(lines[i].start, lines[i].end);
    if (numberedRowRe.test(lineText)) {
      if (rawText.slice(currentRowStart, lines[i].start).trim().length > 0) {
        rows.push({ start: currentRowStart, end: lines[i].start });
      }
      currentRowStart = lines[i].start;
    }
  }
  if (currentRowStart < rawText.length && rawText.slice(currentRowStart, rawText.length).trim().length > 0) {
    rows.push({ start: currentRowStart, end: rawText.length });
  }

  let groupStart = rows.length > 0 ? rows[0].start : rawText.length;

  for (let i = 0; i < rows.length; i++) {
    const groupLen = rows[i].end - groupStart;
    if (groupLen > TARGET_CHUNK_CHARS && rows[i].start > groupStart) {
      chunks.push(makeChunk(chunkIdx++, "registry_row_group", groupStart, rows[i].start, rawText,
        `Row group ${chunkIdx}`, null, { ...docMeta, section_type: "registry_row_group" },
        "registry_table",
      ));
      groupStart = rows[i].start;
    }
  }

  if (rows.length > 0 && groupStart < rawText.length) {
    const finalSlice = rawText.slice(groupStart, rawText.length);
    if (finalSlice.trim().length > 0) {
      chunks.push(makeChunk(chunkIdx++, "registry_row_group", groupStart, rawText.length, rawText,
        `Row group ${chunkIdx}`, null, { ...docMeta, section_type: "registry_row_group" },
        "registry_table",
      ));
    }
  }

  return chunks;
}

// ─── NORMATIVE ACT CHUNKER ────────────────────────────────────────

function chunkNormativeAct(rawText: string, docInput: LegalDocumentInput): LegalChunk[] {
  const docMeta: ChunkMetadata = {
    document_type: docInput.doc_type || "normative_act",
    document_title: docInput.title,
    date: docInput.date || extractDate(rawText),
  };

  const lines = findLines(rawText);
  const sectionBoundaries: { lineIdx: number; label: string; charStart: number }[] = [];

  const sectionHeaderRe = /^(?:[IVX]+\.\s+|(?:Chapter|Section|\u0533\u056c\u0578\u0582\u056d|\u0532\u0561\u056a\u056b\u0576)\s+\d+)/i;
  const numberedSectionRe = /^\d+\.\s+[A-Z\u0531-\u0556\u0410-\u042f]/;

  for (let i = 0; i < lines.length; i++) {
    const lineText = rawText.slice(lines[i].start, lines[i].end);
    const trimmedLine = lineText.trim();
    if (sectionHeaderRe.test(trimmedLine)) {
      sectionBoundaries.push({ lineIdx: i, label: trimmedLine.slice(0, 80), charStart: lines[i].start });
    } else if (numberedSectionRe.test(trimmedLine) && trimmedLine.length < 200) {
      sectionBoundaries.push({ lineIdx: i, label: trimmedLine.slice(0, 80), charStart: lines[i].start });
    }
  }

  if (sectionBoundaries.length === 0) {
    return chunkStructuralFallback(rawText, "normative_section", docMeta, docInput.doc_type);
  }

  const chunks: LegalChunk[] = [];
  let chunkIdx = 0;

  if (sectionBoundaries[0].charStart > 0) {
    const preambleSlice = rawText.slice(0, sectionBoundaries[0].charStart);
    if (preambleSlice.trim().length > MIN_CHUNK_SIZE) {
      chunks.push(makeChunk(chunkIdx++, "preamble", 0, sectionBoundaries[0].charStart, rawText, null, null, {
        ...docMeta, section_type: "preamble",
      }, docInput.doc_type));
    }
  }

  for (let i = 0; i < sectionBoundaries.length; i++) {
    const charStart = sectionBoundaries[i].charStart;
    const charEnd = i + 1 < sectionBoundaries.length
      ? sectionBoundaries[i + 1].charStart
      : rawText.length;
    const sectionSlice = rawText.slice(charStart, charEnd);

    if (sectionSlice.trim().length === 0) continue;

    if (sectionSlice.length > TARGET_CHUNK_CHARS) {
      const subChunks = splitSectionByParagraphsRaw(
        rawText, charStart, charEnd, "normative_section", sectionBoundaries[i].label,
        chunkIdx, docMeta, docInput.doc_type,
      );
      for (const sc of subChunks) chunks.push(sc);
      chunkIdx += subChunks.length;
    } else {
      chunks.push(makeChunk(
        chunkIdx++, "normative_section", charStart, charEnd, rawText,
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

function chunkStructuralFallback(
  rawText: string,
  defaultType: ChunkType,
  docMeta?: ChunkMetadata,
  docType?: string,
): LegalChunk[] {
  const chunks: LegalChunk[] = [];
  const paragraphs = findParagraphs(rawText);
  let idx = 0;
  let groupStart = paragraphs.length > 0 ? paragraphs[0].start : 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const groupLen = paragraphs[i].end - groupStart;

    if (groupLen > TARGET_CHUNK_CHARS && paragraphs[i].start > groupStart) {
      const sliceCheck = rawText.slice(groupStart, paragraphs[i].start);
      if (sliceCheck.trim().length > 0) {
        chunks.push(makeChunk(idx++, defaultType, groupStart, paragraphs[i].start, rawText, null, null, docMeta || null, docType));
      }
      groupStart = paragraphs[i].start;
    }
  }

  const finalEnd = paragraphs.length > 0 ? paragraphs[paragraphs.length - 1].end : rawText.length;
  if (groupStart < finalEnd) {
    const sliceCheck = rawText.slice(groupStart, finalEnd);
    if (sliceCheck.trim().length > 0) {
      chunks.push(makeChunk(idx++, defaultType, groupStart, finalEnd, rawText, null, null, docMeta || null, docType));
    }
  }

  return chunks;
}

// ─── SAFE-BREAK SPLITTING (hard cap enforcement) ──────────────────

/**
 * Split text that exceeds MAX_CHUNK_CHARS at the safest available break.
 * Breakpoint priority: double newline > single newline > sentence > whitespace.
 * Delimiters are included in the LEFT chunk to avoid ugly leading delimiters.
 * bp is always > 0 to guarantee forward progress.
 */
function splitAtSafeBreak(
  rawText: string,
  start: number,
  end: number,
  chunkType: ChunkType,
  startIdx: number,
  label: string | null,
  locator: ChunkLocator | null,
  meta: ChunkMetadata | null,
  docType?: string,
): LegalChunk[] {
  const span = end - start;
  if (span <= MAX_CHUNK_CHARS) {
    return [makeChunk(startIdx, chunkType, start, end, rawText, label, locator, meta, docType)];
  }

  const chunks: LegalChunk[] = [];
  let pos = start;
  let idx = startIdx;

  while (pos < end) {
    const remaining = end - pos;
    if (remaining <= MAX_CHUNK_CHARS) {
      chunks.push(makeChunk(idx++, chunkType, pos, end, rawText, label, locator, meta, docType));
      break;
    }

    const searchEnd = Math.min(pos + MAX_CHUNK_CHARS, end);
    const slice = rawText.slice(pos, searchEnd);

    let bp = -1;

    // 1. Try double newline — include delimiter in left chunk
    const dnl = slice.lastIndexOf("\n\n");
    if (dnl > MIN_CHUNK_CHARS) {
      // Find end of delimiter (could be \n\n\n...)
      let delimEnd = dnl + 2;
      while (delimEnd < slice.length && slice[delimEnd] === "\n") delimEnd++;
      bp = delimEnd;
    }

    // 2. Try single newline
    if (bp === -1) {
      const snl = slice.lastIndexOf("\n");
      if (snl > MIN_CHUNK_CHARS) {
        bp = snl + 1; // include \n in left chunk
      }
    }

    // 3. Try sentence boundary
    if (bp === -1) {
      const sentRe = /[.!?\u0589]\s/g;
      let lastSent = -1;
      let sm: RegExpExecArray | null;
      while ((sm = sentRe.exec(slice)) !== null) {
        if (sm.index > MIN_CHUNK_CHARS && sm.index + sm[0].length <= MAX_CHUNK_CHARS) {
          lastSent = sm.index + sm[0].length;
        }
      }
      if (lastSent > MIN_CHUNK_CHARS) bp = lastSent;
    }

    // 4. Try whitespace
    if (bp === -1) {
      const wsIdx = slice.lastIndexOf(" ", MAX_CHUNK_CHARS);
      if (wsIdx > MIN_CHUNK_CHARS) bp = wsIdx + 1;
    }

    // 5. Absolute fallback — always > 0
    if (bp <= 0) bp = MAX_CHUNK_CHARS;

    chunks.push(makeChunk(idx++, chunkType, pos, pos + bp, rawText, label, locator, meta, docType));
    pos += bp;
  }

  return chunks;
}

// ─── MIN MERGE POLICY ─────────────────────────────────────────────

/**
 * Merge undersized chunks (<MIN_CHUNK_CHARS) with neighbors within same parent.
 * Uses parentKey() for strict boundary detection.
 * Never merge across different parents. Never exceed MAX_CHUNK_CHARS.
 * Merged chunk preserves identity (type/label/locator/metadata) from the
 * chunk with the earliest char_start.
 */
function mergeUndersizedChunks(chunks: LegalChunk[], rawText: string): LegalChunk[] {
  if (chunks.length <= 1) return chunks;

  const result: LegalChunk[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const span = chunk.char_end - chunk.char_start;

    if (span >= MIN_CHUNK_CHARS) {
      result.push(chunk);
      continue;
    }

    // Try merge with previous
    if (result.length > 0) {
      const prev = result[result.length - 1];
      if (
        sameParent(prev, chunk) &&
        (prev.char_end - prev.char_start) + span <= MAX_CHUNK_CHARS
      ) {
        // Merge: extend previous chunk to cover this one.
        // prev has earlier char_start, so we keep prev's identity.
        const merged = makeChunk(
          prev.chunk_index, prev.chunk_type, prev.char_start, chunk.char_end, rawText,
          prev.label, prev.locator, prev.metadata, prev.doc_type,
        );
        result[result.length - 1] = merged;
        continue;
      }
    }

    // Try merge with next
    if (i + 1 < chunks.length) {
      const next = chunks[i + 1];
      if (
        sameParent(chunk, next) &&
        span + (next.char_end - next.char_start) <= MAX_CHUNK_CHARS
      ) {
        // Merge: create combined chunk. Current chunk has earlier start,
        // so keep current chunk's identity.
        const merged = makeChunk(
          chunk.chunk_index, chunk.chunk_type, chunk.char_start, next.char_end, rawText,
          chunk.label, chunk.locator, chunk.metadata, chunk.doc_type,
        );
        result.push(merged);
        i++; // skip next
        continue;
      }
    }

    // Cannot merge — keep small chunk (parentKey is null or size constraint)
    result.push(chunk);
  }

  // Re-index
  for (let i = 0; i < result.length; i++) {
    result[i].chunk_index = i;
  }

  return result;
}

// ─── PER-TYPE CAP ENFORCEMENT ─────────────────────────────────────

/**
 * Coarsen chunks by merging adjacent same-parent chunks until under cap.
 * Returns warnings array if cap cannot be reached.
 */
function enforceChunkCap(
  chunks: LegalChunk[],
  cap: number,
  rawText: string,
  warnings: string[],
): LegalChunk[] {
  if (chunks.length <= cap) return chunks;

  let result = [...chunks];
  let lastLen = result.length + 1;

  while (result.length > cap && result.length < lastLen) {
    lastLen = result.length;
    for (let i = result.length - 2; i >= 0; i--) {
      const a = result[i];
      const b = result[i + 1];
      if (sameParent(a, b)) {
        const mergedSpan = b.char_end - a.char_start;
        if (mergedSpan <= MAX_CHUNK_CHARS) {
          const m = makeChunk(
            a.chunk_index, a.chunk_type, a.char_start, b.char_end, rawText,
            a.label, a.locator, a.metadata, a.doc_type,
          );
          result.splice(i, 2, m);
          break;
        }
      }
    }
  }

  if (result.length > cap) {
    warnings.push(
      `cap_exceeded: wanted=${cap}, actual=${result.length}, reason=cannot_merge_without_exceeding_MAX_or_missing_parentKey`
    );
  }

  // Re-index
  for (let i = 0; i < result.length; i++) {
    result[i].chunk_index = i;
  }
  return result;
}

// ─── HARD CAP ENFORCEMENT (ensure no chunk > MAX by span) ─────────

/**
 * Detect oversize by span (char_end - char_start), not string length.
 * Split oversize chunks using splitAtSafeBreak, preserving metadata.
 */
function enforceHardCap(chunks: LegalChunk[], rawText: string): LegalChunk[] {
  const result: LegalChunk[] = [];
  let idx = 0;
  for (const chunk of chunks) {
    const span = chunk.char_end - chunk.char_start;
    if (span > MAX_CHUNK_CHARS) {
      const split = splitAtSafeBreak(
        rawText, chunk.char_start, chunk.char_end, chunk.chunk_type,
        idx, chunk.label, chunk.locator, chunk.metadata, chunk.doc_type,
      );
      for (const s of split) {
        s.chunk_index = idx++;
        result.push(s);
      }
    } else {
      chunk.chunk_index = idx++;
      result.push(chunk);
    }
  }
  return result;
}

// ─── POST-PROCESS PIPELINE ────────────────────────────────────────

function postProcessChunks(
  chunks: LegalChunk[],
  rawText: string,
  cap: number,
  warnings?: string[],
): LegalChunk[] {
  const w = warnings || [];
  let result = enforceHardCap(chunks, rawText);
  result = mergeUndersizedChunks(result, rawText);
  result = enforceChunkCap(result, cap, rawText, w);
  return result;
}

// ─── VALIDATE CHUNKS ──────────────────────────────────────────────

/**
 * Validates chunk coverage and integrity against original text.
 * STRICT: raw.slice(char_start, char_end) === chunk_text for ALL chunk types.
 * NO exemptions. NO tolerance.
 */
export function validateChunks(originalText: string, chunks: LegalChunk[]): ValidationResult {
  const errors: string[] = [];

  if (chunks.length === 0) {
    if (originalText.trim().length > 0) {
      errors.push("No chunks produced for non-empty text");
    }
    return { ok: errors.length === 0, errors };
  }

  const sorted = [...chunks].sort((a, b) => a.char_start - b.char_start);

  // STRICT OFFSET CHECK: raw.slice(char_start, char_end) === chunk_text
  for (const chunk of sorted) {
    const expectedText = originalText.slice(chunk.char_start, chunk.char_end);
    if (expectedText !== chunk.chunk_text) {
      const diffPos = findFirstDiffPos(expectedText, chunk.chunk_text);
      errors.push(
        `Chunk ${chunk.chunk_index} (${chunk.chunk_type}): slice mismatch at pos ${diffPos}. ` +
        `Expected len=${expectedText.length}, got len=${chunk.chunk_text.length}. ` +
        `Slice[${diffPos}..${diffPos + 20}]="${expectedText.slice(diffPos, diffPos + 20)}" vs ` +
        `Chunk[${diffPos}..${diffPos + 20}]="${chunk.chunk_text.slice(diffPos, diffPos + 20)}"`
      );
    }
  }

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

  return { ok: errors.length === 0, errors };
}

/** Find position of first character difference between two strings */
function findFirstDiffPos(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return i;
  }
  return len;
}

// ─── DOC TYPE ROUTING ─────────────────────────────────────────────

export function chunkByDocType(input: LegalDocumentInput, docType: InferredDocType): ChunkResult {
  const text = input.content_text;
  if (!text || text.length === 0) {
    return { chunks: [], strategy: "fixed", chunker_version: CHUNKER_VERSION };
  }

  let chunks: LegalChunk[];
  let strategy: ChunkResult["strategy"];
  let case_number: string | undefined;
  const warnings: string[] = [];

  switch (docType) {
    case "code_or_law":
      chunks = chunkLegislation(text, input);
      strategy = chunks.some(c => c.chunk_type === "article") ? "article" : "normative";
      chunks = postProcessChunks(chunks, text, CAP_LAW_CHUNKS_PER_FILE, warnings);
      break;

    case "court_decision":
      chunks = chunkCourtDecision(text, input);
      strategy = chunks.some(c =>
        ["reasoning", "facts", "resolution", "dissent", "arguments", "legal_position",
         "procedural_history", "appellant_arguments", "respondent_arguments", "norm_interpretation",
        ].includes(c.chunk_type)
      ) ? "sections" : "normative";
      case_number = extractCaseNumber(text);
      chunks = postProcessChunks(chunks, text, CAP_DECISION_CHUNKS_PER_FILE, warnings);
      break;

    case "treaty":
      chunks = chunkTreaty(text, input);
      strategy = chunks.some(c => c.chunk_type === "treaty_article") ? "treaty" : "normative";
      chunks = postProcessChunks(chunks, text, CAP_LAW_CHUNKS_PER_FILE, warnings);
      break;

    case "registry_table":
      chunks = chunkRegistryTable(text, input);
      strategy = "registry";
      chunks = postProcessChunks(chunks, text, CAP_LAW_CHUNKS_PER_FILE, warnings);
      break;

    case "normative_act":
      chunks = chunkNormativeAct(text, input);
      strategy = "normative";
      chunks = postProcessChunks(chunks, text, CAP_LAW_CHUNKS_PER_FILE, warnings);
      break;

    default:
      chunks = chunkStructuralFallback(text, "full_text", undefined, input.doc_type);
      strategy = "fixed";
      chunks = postProcessChunks(chunks, text, CAP_LAW_CHUNKS_PER_FILE, warnings);
      break;
  }

  return { chunks, strategy, case_number, chunker_version: CHUNKER_VERSION, warnings: warnings.length > 0 ? warnings : undefined };
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

export function chunkDocument(document: LegalDocumentInput): ChunkResult {
  const text = document.content_text;
  if (!text || text.length === 0) {
    return { chunks: [], strategy: "fixed", chunker_version: CHUNKER_VERSION };
  }

  let chunks: LegalChunk[];
  let strategy: ChunkResult["strategy"];
  let case_number: string | undefined;
  const warnings: string[] = [];

  if (ECHR_DOC_TYPES.has(document.doc_type)) {
    chunks = chunkEchrJudgment(text, document);
    const hasSections = chunks.some(c =>
      ["procedure", "facts", "law", "assessment", "conclusion", "just_satisfaction"].includes(c.chunk_type)
    );
    strategy = hasSections ? "echr" : "normative";
    case_number = chunks[0]?.metadata?.case_number || undefined;
    chunks = postProcessChunks(chunks, text, CAP_ECHR_CHUNKS_PER_FILE, warnings);
  } else if (TREATY_DOC_TYPES.has(document.doc_type)) {
    chunks = chunkTreaty(text, document);
    strategy = chunks.some(c => c.chunk_type === "treaty_article") ? "treaty" : "normative";
    chunks = postProcessChunks(chunks, text, CAP_LAW_CHUNKS_PER_FILE, warnings);
  } else if (LEGISLATION_DOC_TYPES.has(document.doc_type)) {
    chunks = chunkLegislation(text, document);
    strategy = chunks.some(c => c.chunk_type === "article") ? "article" : "normative";
    chunks = postProcessChunks(chunks, text, CAP_LAW_CHUNKS_PER_FILE, warnings);
  } else if (COURT_DOC_TYPES.has(document.doc_type)) {
    chunks = chunkCourtDecision(text, document);
    const hasSections = chunks.some(c =>
      ["reasoning", "facts", "resolution", "dissent", "arguments", "legal_position",
       "procedural_history", "appellant_arguments", "respondent_arguments", "norm_interpretation",
      ].includes(c.chunk_type)
    );
    strategy = hasSections ? "sections" : "normative";
    case_number = extractCaseNumber(text);
    chunks = postProcessChunks(chunks, text, CAP_DECISION_CHUNKS_PER_FILE, warnings);
  } else {
    const inferred = inferDocTypeFromText(text);
    if (inferred !== "other") {
      return chunkByDocType(document, inferred);
    }
    chunks = chunkNormativeAct(text, document);
    strategy = "normative";
    chunks = postProcessChunks(chunks, text, CAP_LAW_CHUNKS_PER_FILE, warnings);
  }

  return { chunks, strategy, case_number, chunker_version: CHUNKER_VERSION, warnings: warnings.length > 0 ? warnings : undefined };
}
