/**
 * Shared Legal Document Chunker — v2.0
 *
 * Structural chunking optimized for Armenian legal documents:
 * - Laws / Codes: chunk = one article; oversized articles split by parts
 * - Court decisions (RA courts): chunk = logical section (facts, reasoning, resolution, etc.)
 * - ECHR judgments: chunk = structural section (Procedure, Facts, Law, Assessment, etc.)
 * - International treaties: chunk = article; oversized articles split by points
 *
 * IMPORTANT: No Armenian glyphs — all Unicode escapes \uXXXX.
 */

import { extractTables, type ExtractedTable } from "./table-extractor.ts";

// ─── TYPES ──────────────────────────────────────────────────────────

const CHUNK_TYPES = [
  "header", "operative", "resolution", "reasoning", "facts", "dissent",
  "article", "preamble", "table", "reference_list", "full_text", "other",
  // ECHR-specific
  "procedure", "law", "assessment", "conclusion", "just_satisfaction",
  // Court decision extended
  "arguments", "legal_position",
  // International treaties
  "treaty_article",
] as const;
export type ChunkType = typeof CHUNK_TYPES[number];

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
  strategy: "article" | "sections" | "echr" | "treaty" | "fixed";
  case_number?: string;
}

// ─── CONSTANTS ──────────────────────────────────────────────────────

// Token-aware limits (1 Armenian token ≈ 3-5 chars, avg ~4)
const CHARS_PER_TOKEN = 4;
const OPTIMAL_TOKENS_MIN = 800;
const OPTIMAL_TOKENS_MAX = 1500;
const MAX_TOKENS = 1500;
const MAX_CHUNK_CHARS = MAX_TOKENS * CHARS_PER_TOKEN; // 6000
const OPTIMAL_MIN_CHARS = OPTIMAL_TOKENS_MIN * CHARS_PER_TOKEN; // 3200
const MIN_CHUNK_SIZE = 100;

// For articles that are too large: split by parts
const MAX_ARTICLE_CHARS = MAX_CHUNK_CHARS;

// Overlap: 10-15% for reasoning sections only
const REASONING_OVERLAP_RATIO = 0.12;

// ─── REGEX PATTERNS (Unicode-escaped Armenian) ──────────────────────

// Matches: "\u0540\u0578\u0564\u057e\u0561\u056e 85." etc.
const ARTICLE_HEADER_RE = /\u0540\u0578\u0564\u057e\u0561\u056e\s+(\d+(?:[.-]\d+)*)\s*[.\u0589]/g;
const ARTICLE_HEADER_NEWLINE_RE = /\u0540\u0578\u0564\u057e\u0561\u056e\n(\d+(?:[.-]\d+)*)\s*[.\u0589]/g;
const ARTICLE_HEADER_SPLIT_RE = /\u0540\u0578\u0564\u057e\u0561\u056e\s+[^\n]+\n(\d+(?:[.-]\d+)*)\.\s/g;

// Article title line after "Հdelays N." — capture the rest of the first line as title
const ARTICLE_TITLE_RE = /\u0540\u0578\u0564\u057e\u0561\u056e\s+\d+(?:[.-]\d+)*\s*[.\u0589]\s*([^\n]+)/;

// Part pattern: "1. ...", "1) ..." at line start
const PART_LINE_RE = /^(\d+)\s*[.)]\s+/;

// ─── CASE NUMBER PATTERNS ──────────────────────────────────────────
const CASE_NUMBER_PATTERNS: RegExp[] = [
  /\u0563\u0578\u0580\u056e\s+\u0569\u056b\u057e[.:]?\s*([A-Z\u0531-\u0556]{1,5}[\-\/]\d[\d\-\/]+)/i,
  /\b([A-Z\u0531-\u0556]{2,5}[\-\/]\d{1,6}[\-\/]\d{2,4}(?:[\-\/]\d{2,4})?)\b/,
  /\u0434\u0435\u043b[\u043e\u0443]\s*(?:\u2116|N|No\.?)\s*([A-Z\u0410-\u042f\d][\d\-\/A-Z\u0410-\u042f]+)/i,
];

/**
 * Extract case number from the first ~2000 chars of a court decision.
 */
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
  // DD.MM.YYYY or DD/MM/YYYY
  /(\d{1,2}[.\/]\d{1,2}[.\/]\d{4})/,
  // Armenian date format: "20 հdelays 2024 թ."
  /(\d{1,2}\s+\u0570\u0578\u0582\u0576\u056b\u057d\u056b\s+\d{4})/i,
  /(\d{1,2}\s+\u0570\u0578\u056f\u057f\u0565\u0574\u0562\u0565\u0580\u056b\s+\d{4})/i,
  // YYYY-MM-DD
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
  };
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
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

  // Deduplicate by position
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

/**
 * Extract the article title from the first line after "Հoddv. N."
 */
function extractArticleTitle(articleText: string): string | null {
  const m = articleText.match(ARTICLE_TITLE_RE);
  return m ? m[1].trim() : null;
}

/**
 * Split an oversized article into parts.
 * Each part starts with a numbered line (1., 2., etc.)
 * Parts are never split internally.
 */
function splitArticleByParts(
  articleText: string,
  articleNum: string,
  baseOffset: number,
  startIdx: number,
  docMeta: ChunkMetadata,
): LegalChunk[] {
  const lines = articleText.split("\n");
  const partBoundaries: { lineIdx: number; partNum: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(PART_LINE_RE);
    if (m) {
      partBoundaries.push({ lineIdx: i, partNum: m[1] });
    }
  }

  // If no parts found or only 1, return as single chunk (even if large)
  if (partBoundaries.length <= 1) {
    const locator: ChunkLocator = {
      article: articleNum,
      section_title: "\u0540\u0578\u0564\u057e\u0561\u056e " + articleNum,
    };
    return [makeChunk(
      startIdx, "article", articleText, baseOffset,
      "\u0540\u0578\u0564\u057e\u0561\u056e " + articleNum, locator,
      { ...docMeta, article_number: articleNum, section_type: "article" },
    )];
  }

  // Group parts into chunks that fit within MAX_CHUNK_CHARS
  const chunks: LegalChunk[] = [];
  let idx = startIdx;

  // Include article header (lines before first part) in the first chunk
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
      // Flush current chunk
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
      }));

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

  // Flush remaining
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
    }));
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
    return chunkFixedWindow(text, "article", docMeta);
  }

  let chunkIdx = 0;

  // Preamble
  if (deduped[0].index > MIN_CHUNK_SIZE) {
    const preambleText = text.slice(0, deduped[0].index).trim();
    if (preambleText.length > 0) {
      chunks.push(makeChunk(chunkIdx++, "preamble", preambleText, 0, null, null, {
        ...docMeta, section_type: "preamble",
      }));
    }
  }

  for (let i = 0; i < deduped.length; i++) {
    const start = deduped[i].index;
    const end = i + 1 < deduped.length ? deduped[i + 1].index : text.length;
    const articleText = text.slice(start, end).trim();
    const articleNum = deduped[i].number;

    if (articleText.length === 0) continue;

    if (articleText.length > MAX_CHUNK_CHARS) {
      // Split by parts — NEVER inside a part
      const subChunks = splitArticleByParts(articleText, articleNum, start, chunkIdx, docMeta);
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
  // Arguments of parties (доводы сторон)
  {
    re: /\u056f\u0578\u0572\u0574\u0565\u0580\u056b\s+\u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580/i,
    type: "arguments",
    label: "\u056f\u0578\u0572\u0574\u0565\u0580\u056b \u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580",
  },
  // Legal position of the court
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
    re: /\u0444\u0430\u043a\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0435?\s+\u043e\u0431\u0441\u0442\u043e\u044f\u0442\u0435\u043b\u044c\u0441\u0442\u0432/i,
    type: "facts",
    label: "\u0444\u0430\u043a\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0435 \u043e\u0431\u0441\u0442\u043e\u044f\u0442\u0435\u043b\u044c\u0441\u0442\u0432\u0430",
  },
  {
    re: /\u0434\u043e\u0432\u043e\u0434\u044b\s+\u0441\u0442\u043e\u0440\u043e\u043d/i,
    type: "arguments",
    label: "\u0434\u043e\u0432\u043e\u0434\u044b \u0441\u0442\u043e\u0440\u043e\u043d",
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

// Types that get reasoning overlap
const REASONING_TYPES: Set<ChunkType> = new Set(["reasoning", "legal_position"]);

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
    return chunkFixedWindow(text, "full_text", docMeta);
  }

  const chunks: LegalChunk[] = [];
  let chunkIdx = 0;

  // Header (requisites)
  if (deduped[0].index > MIN_CHUNK_SIZE) {
    const headerText = text.slice(0, deduped[0].index).trim();
    if (headerText.length > 0) {
      chunks.push(makeChunk(chunkIdx++, "header", headerText, 0, null, null, {
        ...docMeta, section_type: "header",
      }));
    }
  }

  for (let i = 0; i < deduped.length; i++) {
    const start = deduped[i].index;
    const end = i + 1 < deduped.length ? deduped[i + 1].index : text.length;
    let sectionText = text.slice(start, end).trim();
    if (sectionText.length === 0) continue;

    const sectionType = deduped[i].type;
    const sectionLabel = deduped[i].label;

    // Add overlap from previous section for reasoning/legal_position only
    if (REASONING_TYPES.has(sectionType) && i > 0) {
      const prevStart = deduped[i - 1].index;
      const prevText = text.slice(prevStart, start);
      const overlapChars = Math.floor(prevText.length * REASONING_OVERLAP_RATIO);
      if (overlapChars > MIN_CHUNK_SIZE) {
        const overlapText = prevText.slice(-overlapChars);
        sectionText = overlapText + "\n\n" + sectionText;
      }
    }

    if (sectionText.length > MAX_CHUNK_CHARS) {
      // Split oversized sections by paragraph boundaries, preserving section type
      const subChunks = splitSectionByParagraphs(sectionText, sectionType, sectionLabel, start, chunkIdx, docMeta);
      for (const sc of subChunks) chunks.push(sc);
      chunkIdx += subChunks.length;
    } else {
      chunks.push(makeChunk(
        chunkIdx++, sectionType, sectionText, start, sectionLabel,
        { section_title: sectionLabel },
        { ...docMeta, section_type: sectionType },
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

// ECHR case number patterns
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

  // Try to extract ECHR case number
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
  // Deduplicate close boundaries
  const deduped: typeof boundaries = [];
  for (const b of boundaries) {
    const last = deduped[deduped.length - 1];
    if (!last || b.index - last.index > 80) {
      deduped.push(b);
    }
  }

  if (deduped.length === 0) {
    return chunkFixedWindow(text, "full_text", docMeta);
  }

  const chunks: LegalChunk[] = [];
  let chunkIdx = 0;

  // Header before first section
  if (deduped[0].index > MIN_CHUNK_SIZE) {
    const headerText = text.slice(0, deduped[0].index).trim();
    if (headerText.length > 0) {
      chunks.push(makeChunk(chunkIdx++, "header", headerText, 0, null, null, {
        ...docMeta, section_type: "header",
      }));
    }
  }

  for (let i = 0; i < deduped.length; i++) {
    const start = deduped[i].index;
    const end = i + 1 < deduped.length ? deduped[i + 1].index : text.length;
    const sectionText = text.slice(start, end).trim();
    if (sectionText.length === 0) continue;

    if (sectionText.length > MAX_CHUNK_CHARS) {
      const subChunks = splitSectionByParagraphs(sectionText, deduped[i].type, deduped[i].label, start, chunkIdx, docMeta);
      for (const sc of subChunks) chunks.push(sc);
      chunkIdx += subChunks.length;
    } else {
      chunks.push(makeChunk(
        chunkIdx++, deduped[i].type, sectionText, start, deduped[i].label,
        { section_title: deduped[i].label },
        { ...docMeta, section_type: deduped[i].type },
      ));
    }
  }

  return chunks;
}

// ─── INTERNATIONAL TREATY CHUNKER ──────────────────────────────────

// Treaty article patterns (multilingual)
const TREATY_ARTICLE_PATTERNS: RegExp[] = [
  // Armenian: Հoddv. N
  /\u0540\u0578\u0564\u057e\u0561\u056e\s+(\d+(?:[.-]\d+)*)\s*[.\u0589]/g,
  // English: Article N
  /\bArticle\s+(\d+(?:[.-]\d+)*)\b/gi,
  // Russian: Статья N
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
    return chunkFixedWindow(text, "treaty_article", docMeta);
  }

  const chunks: LegalChunk[] = [];
  let chunkIdx = 0;

  // Preamble
  if (deduped[0].index > MIN_CHUNK_SIZE) {
    const preambleText = text.slice(0, deduped[0].index).trim();
    if (preambleText.length > 0) {
      chunks.push(makeChunk(chunkIdx++, "preamble", preambleText, 0, null, null, {
        ...docMeta, section_type: "preamble",
      }));
    }
  }

  for (let i = 0; i < deduped.length; i++) {
    const start = deduped[i].index;
    const end = i + 1 < deduped.length ? deduped[i + 1].index : text.length;
    const articleText = text.slice(start, end).trim();
    const articleNum = deduped[i].number;

    if (articleText.length === 0) continue;

    if (articleText.length > MAX_CHUNK_CHARS) {
      // Split by points for treaties
      const subChunks = splitArticleByParts(articleText, articleNum, start, chunkIdx, docMeta);
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
      ));
    }
  }

  return chunks;
}

// ─── FIXED-WINDOW FALLBACK (paragraph-aware) ───────────────────────

function chunkFixedWindow(text: string, defaultType: ChunkType, docMeta?: ChunkMetadata): LegalChunk[] {
  const chunks: LegalChunk[] = [];
  // Split by double newline (paragraphs), then group
  const paragraphs = text.split(/\n\n+/);
  let currentText = "";
  let currentOffset = 0;
  let idx = 0;

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (trimmedPara.length === 0) continue;

    if (currentText.length + trimmedPara.length + 2 > MAX_CHUNK_CHARS && currentText.trim().length > 0) {
      const trimmed = currentText.trim();
      chunks.push(makeChunk(idx++, defaultType, trimmed, currentOffset, null, null, docMeta || null));
      currentOffset += currentText.length + 2;
      currentText = trimmedPara;
    } else {
      if (currentText.length > 0) currentText += "\n\n";
      currentText += trimmedPara;
    }
  }

  if (currentText.trim().length > 0) {
    chunks.push(makeChunk(idx++, defaultType, currentText.trim(), currentOffset, null, null, docMeta || null));
  }

  return chunks;
}

// ─── TABLE CHUNK POST-PROCESSOR ────────────────────────────────────

function appendTableChunks(
  existingChunks: LegalChunk[],
  fullText: string,
  docMeta?: ChunkMetadata,
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
    );

    tableChunks.push(chunk);
  }

  return [...existingChunks, ...tableChunks];
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
  if (!text || text.trim().length === 0) {
    return { chunks: [], strategy: "fixed" };
  }

  let chunks: LegalChunk[];
  let strategy: ChunkResult["strategy"];
  let case_number: string | undefined;

  if (ECHR_DOC_TYPES.has(document.doc_type)) {
    chunks = chunkEchrJudgment(text, document);
    const hasSections = chunks.some(c =>
      ["procedure", "facts", "law", "assessment", "conclusion", "just_satisfaction"].includes(c.chunk_type)
    );
    strategy = hasSections ? "echr" : "fixed";
    case_number = chunks[0]?.metadata?.case_number || undefined;
  } else if (TREATY_DOC_TYPES.has(document.doc_type)) {
    chunks = chunkTreaty(text, document);
    strategy = chunks.some(c => c.chunk_type === "treaty_article") ? "treaty" : "fixed";
  } else if (LEGISLATION_DOC_TYPES.has(document.doc_type)) {
    chunks = chunkLegislation(text, document);
    strategy = chunks.some(c => c.chunk_type === "article") ? "article" : "fixed";
  } else if (COURT_DOC_TYPES.has(document.doc_type)) {
    chunks = chunkCourtDecision(text, document);
    const hasSections = chunks.some(c =>
      ["reasoning", "facts", "resolution", "dissent", "arguments", "legal_position"].includes(c.chunk_type)
    );
    strategy = hasSections ? "sections" : "fixed";
    case_number = extractCaseNumber(text);
  } else {
    chunks = chunkFixedWindow(text, "full_text");
    strategy = "fixed";
  }

  // Post-process: extract and append table chunks
  const allChunks = appendTableChunks(chunks, text);
  return { chunks: allChunks, strategy, case_number };
}

// Re-export for direct use
export { extractTables, type ExtractedTable } from "./table-extractor.ts";
