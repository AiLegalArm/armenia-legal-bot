/**
 * Shared chunker logic — extracted from legal-chunker/index.ts
 * so that both the chunker endpoint and ingest-document orchestrator
 * can reuse the same code.
 *
 * IMPORTANT: No Armenian glyphs — all Unicode escapes \uXXXX.
 */

import { extractTables, type ExtractedTable } from "./table-extractor.ts";

// ─── TYPES ──────────────────────────────────────────────────────────

const CHUNK_TYPES = [
  "header", "operative", "resolution", "reasoning", "facts", "dissent",
  "article", "preamble", "table", "reference_list", "full_text", "other",
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
}

export interface ChunkLocator {
  article?: string;
  part?: string;
  point?: string;
  section_title?: string;
}

export interface LegalDocumentInput {
  doc_type: string;
  content_text: string;
  title?: string;
}

export interface ChunkResult {
  chunks: LegalChunk[];
  strategy: "article" | "sections" | "fixed";
  case_number?: string;
}

// ─── CONSTANTS ──────────────────────────────────────────────────────
const MAX_CHUNK_SIZE = 8000;
const MIN_CHUNK_SIZE = 200;

// ─── REGEX PATTERNS (Unicode-escaped Armenian) ──────────────────────

// Matches: "\u0540\u0578\u0564\u057e\u0561\u056e 85." and "\u0540\u0578\u0564\u057e\u0561\u056e\n85." and "\u0540\u0578\u0564\u057e\u0561\u056e 345.2\u0589"
// Captures article number including sub-articles (e.g. 60.3, 345.2, 1100)
const ARTICLE_HEADER_RE = /\u0540\u0578\u0564\u057e\u0561\u056e\s+(\d+(?:[.-]\d+)*)\s*[.\u0589]/g;
// Variant with linebreak between "\u0540\u0578\u0564\u057e\u0561\u056e" and number (common in OCR/arlis TXT)
const ARTICLE_HEADER_NEWLINE_RE = /\u0540\u0578\u0564\u057e\u0561\u056e\n(\d+(?:[.-]\d+)*)\s*[.\u0589]/g;

// ─── CASE NUMBER PATTERNS ──────────────────────────────────────────
// Armenian court decisions: "\u0533\u0578\u0580\u056e \u0569\u056b\u057e XX-XXXX-XX-XXXX" or variants
// Also: \u0543\u0544-XX-XXXX, \u0535\u053f\u0534-XXXX, \u0535\u0544/XXXX/XX/XX, etc.
const CASE_NUMBER_PATTERNS: RegExp[] = [
  // Armenian: "\u0563\u0578\u0580\u056e \u0569\u056b\u057e" followed by case number
  /\u0563\u0578\u0580\u056e\s+\u0569\u056b\u057e[.:]?\s*([A-Z\u0531-\u0556]{1,5}[\-\/]\d[\d\-\/]+)/i,
  // Standalone formatted case numbers: ԵԴ/1234/02/24, ՀՀ-123-2024, etc.
  /\b([A-Z\u0531-\u0556]{2,5}[\-\/]\d{1,6}[\-\/]\d{2,4}(?:[\-\/]\d{2,4})?)\b/,
  // Russian: "\u0434\u0435\u043b\u043e \u2116" or "\u0434\u0435\u043b\u043e N"
  /\u0434\u0435\u043b[\u043e\u0443]\s*(?:\u2116|N|No\.?)\s*([A-Z\u0410-\u042f\d][\d\-\/A-Z\u0410-\u042f]+)/i,
];

/**
 * Extract case number from the first ~2000 chars of a court decision.
 * Returns the first match or undefined.
 */
export function extractCaseNumber(text: string): string | undefined {
  const header = text.slice(0, 2000);
  for (const pattern of CASE_NUMBER_PATTERNS) {
    const m = header.match(pattern);
    if (m && m[1]) return m[1].trim();
  }
  return undefined;
}

const PART_RE = /^(\d+)\s*[.)]\s+/gm;

interface SectionPattern {
  re: RegExp;
  type: ChunkType;
  label: string;
}

const COURT_SECTION_PATTERNS: SectionPattern[] = [
  // ── Armenian patterns ──
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
  // ── Russian-language patterns (bilingual documents) ──
  {
    re: /\u0444\u0430\u043a\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0435?\s+\u043e\u0431\u0441\u0442\u043e\u044f\u0442\u0435\u043b\u044c\u0441\u0442\u0432/i,
    type: "facts",
    label: "\u0444\u0430\u043a\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0435 \u043e\u0431\u0441\u0442\u043e\u044f\u0442\u0435\u043b\u044c\u0441\u0442\u0432\u0430",
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
  locator: ChunkLocator | null
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
  };
}

// ─── LEGISLATION CHUNKER ────────────────────────────────────────────

function chunkLegislation(text: string): LegalChunk[] {
  const chunks: LegalChunk[] = [];
  const articleMatches: { index: number; number: string; fullMatch: string }[] = [];

  // Scan with both patterns (same-line and newline variants)
  for (const pattern of [ARTICLE_HEADER_RE, ARTICLE_HEADER_NEWLINE_RE]) {
    const re = new RegExp(pattern.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      articleMatches.push({ index: m.index, number: m[1], fullMatch: m[0] });
    }
  }

  // Deduplicate by position (both patterns may match same article)
  articleMatches.sort((a, b) => a.index - b.index);
  const deduped: typeof articleMatches = [];
  for (const am of articleMatches) {
    const last = deduped[deduped.length - 1];
    if (!last || am.index - last.index > 5) {
      deduped.push(am);
    }
  }

  if (deduped.length === 0) {
    return chunkFixedWindow(text, "article");
  }

  let chunkIdx = 0;

  if (deduped[0].index > MIN_CHUNK_SIZE) {
    const preambleText = text.slice(0, deduped[0].index).trim();
    if (preambleText.length > 0) {
      chunks.push(makeChunk(chunkIdx++, "preamble", preambleText, 0, null, null));
    }
  }

  for (let i = 0; i < deduped.length; i++) {
    const start = deduped[i].index;
    const end = i + 1 < deduped.length ? deduped[i + 1].index : text.length;
    const articleText = text.slice(start, end).trim();
    const articleNum = deduped[i].number;

    if (articleText.length === 0) continue;

    const parts = splitByParts(articleText);

    if (parts.length > 1) {
      for (const part of parts) {
        const partLocator: ChunkLocator = {
          article: articleNum,
          part: part.partNum || undefined,
          section_title: "\u0540\u0578\u0564\u057e\u0561\u056e " + articleNum,
        };
        const absStart = start + part.offset;
        chunks.push(makeChunk(
          chunkIdx++,
          "article",
          part.text,
          absStart,
          "\u0540\u0578\u0564\u057e\u0561\u056e " + articleNum +
            (part.partNum ? ", \u0574\u0561\u057d " + part.partNum : ""),
          partLocator
        ));
      }
    } else {
      const locator: ChunkLocator = {
        article: articleNum,
        section_title: "\u0540\u0578\u0564\u057e\u0561\u056e " + articleNum,
      };
      chunks.push(makeChunk(
        chunkIdx++,
        "article",
        articleText,
        start,
        "\u0540\u0578\u0564\u057e\u0561\u056e " + articleNum,
        locator
      ));
    }
  }

  return splitOversized(chunks);
}

interface PartSegment {
  partNum: string | null;
  text: string;
  offset: number;
}

function splitByParts(articleText: string): PartSegment[] {
  const lines = articleText.split("\n");
  const segments: PartSegment[] = [];
  let currentPart: string | null = null;
  let currentLines: string[] = [];
  let currentOffset = 0;
  let charPos = 0;

  for (const line of lines) {
    const partMatch = line.match(/^(\d+)\s*[.)]\s+/);
    if (partMatch && segments.length > 0 || (partMatch && charPos > 0)) {
      if (currentLines.length > 0) {
        segments.push({ partNum: currentPart, text: currentLines.join("\n"), offset: currentOffset });
      }
      currentPart = partMatch![1];
      currentLines = [line];
      currentOffset = charPos;
    } else {
      if (partMatch && charPos === 0) {
        currentPart = partMatch[1];
      }
      currentLines.push(line);
    }
    charPos += line.length + 1;
  }

  if (currentLines.length > 0) {
    segments.push({ partNum: currentPart, text: currentLines.join("\n"), offset: currentOffset });
  }

  return segments;
}

// ─── COURT DECISION CHUNKER ────────────────────────────────────────

function chunkCourtDecision(text: string): LegalChunk[] {
  interface SectionBoundary {
    index: number;
    type: ChunkType;
    label: string;
  }

  const boundaries: SectionBoundary[] = [];

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
    return chunkFixedWindow(text, "full_text");
  }

  const chunks: LegalChunk[] = [];
  let chunkIdx = 0;

  if (deduped[0].index > MIN_CHUNK_SIZE) {
    const headerText = text.slice(0, deduped[0].index).trim();
    if (headerText.length > 0) {
      chunks.push(makeChunk(chunkIdx++, "header", headerText, 0, null, null));
    }
  }

  for (let i = 0; i < deduped.length; i++) {
    const start = deduped[i].index;
    const end = i + 1 < deduped.length ? deduped[i + 1].index : text.length;
    const sectionText = text.slice(start, end).trim();
    if (sectionText.length === 0) continue;
    chunks.push(makeChunk(
      chunkIdx++,
      deduped[i].type,
      sectionText,
      start,
      deduped[i].label,
      { section_title: deduped[i].label }
    ));
  }

  return splitOversized(chunks);
}

// ─── FIXED-WINDOW FALLBACK ─────────────────────────────────────────

function chunkFixedWindow(text: string, defaultType: ChunkType): LegalChunk[] {
  const chunks: LegalChunk[] = [];
  const overlap = 200;
  let pos = 0;
  let idx = 0;

  while (pos < text.length) {
    let end = Math.min(pos + MAX_CHUNK_SIZE, text.length);
    if (end < text.length) {
      const lastNewline = text.lastIndexOf("\n\n", end);
      if (lastNewline > pos + MIN_CHUNK_SIZE) {
        end = lastNewline;
      } else {
        const lastSingleNl = text.lastIndexOf("\n", end);
        if (lastSingleNl > pos + MIN_CHUNK_SIZE) {
          end = lastSingleNl;
        }
      }
    }
    const chunkText = text.slice(pos, end).trim();
    if (chunkText.length > 0) {
      chunks.push(makeChunk(idx++, defaultType, chunkText, pos, null, null));
    }
    pos = end > pos ? end - overlap : end + 1;
    if (end >= text.length) break;
  }

  return chunks;
}

// ─── OVERSIZED CHUNK SPLITTER ──────────────────────────────────────

function splitOversized(chunks: LegalChunk[]): LegalChunk[] {
  const result: LegalChunk[] = [];
  let idx = 0;

  for (const chunk of chunks) {
    if (chunk.chunk_text.length <= MAX_CHUNK_SIZE) {
      result.push({ ...chunk, chunk_index: idx++ });
    } else {
      const subChunks = chunkFixedWindow(chunk.chunk_text, chunk.chunk_type);
      for (const sub of subChunks) {
        result.push({
          ...sub,
          chunk_index: idx++,
          char_start: chunk.char_start + sub.char_start,
          char_end: chunk.char_start + sub.char_end,
          label: chunk.label,
          locator: chunk.locator,
        });
      }
    }
  }

  return result;
}

// ─── TABLE CHUNK POST-PROCESSOR ────────────────────────────────────

/**
 * Extract tables from text and append as separate table-type chunks.
 * Tables found within existing chunks are emitted as additional chunks
 * with block_type="table" metadata.
 */
function appendTableChunks(
  existingChunks: LegalChunk[],
  fullText: string
): LegalChunk[] {
  const tables = extractTables(fullText);
  if (tables.length === 0) return existingChunks;

  let nextIndex = existingChunks.length;
  const tableChunks: LegalChunk[] = [];

  for (const table of tables) {
    // Build chunk text with markdown table
    const captionLine = table.caption ? `${table.caption}\n\n` : "";
    const chunkText = `${captionLine}${table.markdown}`;

    const locator: ChunkLocator = {
      section_title: table.caption || `Table ${table.tableIndex + 1}`,
    };

    const chunk = makeChunk(
      nextIndex++,
      "table",
      chunkText,
      table.charStart,
      table.caption || `Table ${table.tableIndex + 1}`,
      locator
    );

    // Attach table-specific metadata via a convention in the label
    // The JSONL builder will read chunk_type="table" for block_type
    tableChunks.push(chunk);
  }

  return [...existingChunks, ...tableChunks];
}

// ─── MAIN CHUNKER ──────────────────────────────────────────────────

const COURT_DOC_TYPES = new Set([
  "court_decision", "cassation_ruling", "appeal_ruling",
  "first_instance_ruling", "constitutional_court", "echr_judgment",
]);

const LEGISLATION_DOC_TYPES = new Set([
  "law", "code", "regulation",
]);

export function chunkDocument(document: LegalDocumentInput): ChunkResult {
  const text = document.content_text;
  if (!text || text.trim().length === 0) {
    return { chunks: [], strategy: "fixed" };
  }

  let chunks: LegalChunk[];
  let strategy: ChunkResult["strategy"];
  let case_number: string | undefined;

  if (LEGISLATION_DOC_TYPES.has(document.doc_type)) {
    chunks = chunkLegislation(text);
    strategy = "article";
  } else if (COURT_DOC_TYPES.has(document.doc_type)) {
    const raw = chunkCourtDecision(text);
    // Determine if we actually found section boundaries
    const hasSections = raw.some(c =>
      ["reasoning", "facts", "resolution", "dissent"].includes(c.chunk_type)
    );
    strategy = hasSections ? "sections" : "fixed";
    chunks = raw;
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
