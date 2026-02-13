/**
 * legal-chunker
 *
 * Problem:
 *   Current chunking (kb-backfill-chunks) uses fixed 8000-char windows with
 *   200-char overlap. This destroys semantic boundaries: articles get split
 *   mid-sentence, court reasoning merges with facts. RAG retrieval returns
 *   fragments that lack self-contained meaning.
 *
 * Risk:
 *   - LLM receives partial articles -> hallucinated legal conclusions
 *   - Court decision facts mixed with reasoning -> wrong legal basis cited
 *   - chunk_type always "full_text" -> no filtering by section role
 *   - Locator metadata absent -> cannot cite "Article 391, Part 1"
 *
 * Solution:
 *   Semantic chunker that:
 *   1) For legislation: splits by Article markers, then by numbered parts
 *   2) For court decisions: detects section headers (facts/reasoning/operative)
 *   3) Each chunk carries: chunk_type, locator, char_range
 *   4) Falls back to fixed-window for unstructured text
 *   5) Deterministic — same input always produces same output
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ─── CORS ───────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── TYPES ──────────────────────────────────────────────────────────

const CHUNK_TYPES = [
  "header", "operative", "reasoning", "facts", "dissent",
  "article", "preamble", "table", "reference_list", "full_text", "other",
] as const;
type ChunkType = typeof CHUNK_TYPES[number];

interface LegalChunk {
  chunk_index: number;
  chunk_type: ChunkType;
  chunk_text: string;
  char_start: number;
  char_end: number;
  label: string | null;
  locator: ChunkLocator | null;
  chunk_hash: string;
}

interface ChunkLocator {
  article?: string;
  part?: string;
  point?: string;
  section_title?: string;
}

// Minimal LegalDocument shape (only fields we need)
interface LegalDocumentInput {
  doc_type: string;
  content_text: string;
  title?: string;
}

// ─── CONSTANTS ──────────────────────────────────────────────────────
const MAX_CHUNK_SIZE = 8000;
const MIN_CHUNK_SIZE = 200;

// ─── REGEX PATTERNS (Unicode-escaped Armenian) ──────────────────────

/**
 * Article header patterns:
 * \u0540\u0578\u0564\u057e\u0561\u056e = Hodvac (Article)
 * Pattern: "Hodvac NNN." or "Hodvac NNN-N."
 */
const ARTICLE_HEADER_RE = /\u0540\u0578\u0564\u057e\u0561\u056e\s+(\d+(?:[.-]\d+)?)\s*[.\u0589]/g;

/**
 * Numbered part within article:
 * "1. text" or "1) text" at line start
 */
const PART_RE = /^(\d+)\s*[.)]\s+/gm;

/**
 * Court decision section headers:
 *
 * \u054a\u0531\u054f\u0543\u0531\u054c\u0531\u053f\u0531\u0546 \u0544\u0531\u054d = PATCHARAKAN MAS (REASONING PART)
 * \u0546\u053f\u0531\u0550\u0531\u0533\u0550\u0531\u053f\u0531\u0546 \u0544\u0531\u054d = NKARAGRAKAN MAS (DESCRIPTIVE PART / FACTS)
 * \u054a\u0531\u0540\u0531\u0546\u054b\u0531\u054f\u054e\u0531\u053f\u0531\u0546 = PAHANJATVAAKAN (OPERATIVE)
 * \u0535\u0536\u0550\u0531\u053f\u0531\u0551\u0548\u0552\u054f\u0545\u0548\u0552\u0546 = EZRAKACUTYUN (CONCLUSION)
 *
 * Also lowercase variants:
 * \u057a\u0561\u057f\u0573\u0561\u057c\u0561\u056f\u0561\u0576 \u0574\u0561\u057d = patcharakan mas
 * \u0576\u056f\u0561\u0580\u0561\u0563\u0580\u0561\u056f\u0561\u0576 \u0574\u0561\u057d = nkaragrakan mas
 * \u057a\u0561\u0570\u0561\u0576\u057b\u0561\u057f\u057e\u0561\u056f\u0561\u0576 = pahanjatvaakan
 */

interface SectionPattern {
  re: RegExp;
  type: ChunkType;
  label: string;
}

const COURT_SECTION_PATTERNS: SectionPattern[] = [
  // Preamble / header (before any section)
  // Reasoning part
  {
    re: /\u057a\u0561\u057f\u0573\u0561\u057c\u0561\u056f\u0561\u0576\s+\u0574\u0561\u057d/i,
    type: "reasoning",
    label: "\u057a\u0561\u057f\u0573\u0561\u057c\u0561\u056f\u0561\u0576 \u0574\u0561\u057d",
  },
  // Descriptive / facts part
  {
    re: /\u0576\u056f\u0561\u0580\u0561\u0563\u0580\u0561\u056f\u0561\u0576\s+\u0574\u0561\u057d/i,
    type: "facts",
    label: "\u0576\u056f\u0561\u0580\u0561\u0563\u0580\u0561\u056f\u0561\u0576 \u0574\u0561\u057d",
  },
  // Operative part
  {
    re: /\u057a\u0561\u0570\u0561\u0576\u057b\u0561\u057f\u057e\u0561\u056f\u0561\u0576/i,
    type: "operative",
    label: "\u057a\u0561\u0570\u0561\u0576\u057b\u0561\u057f\u057e\u0561\u056f\u0561\u0576",
  },
  // Conclusion
  {
    re: /\u0565\u0566\u0580\u0561\u056f\u0561\u0581\u0578\u0582\u0569\u0575\u0578\u0582\u0576/i,
    type: "operative",
    label: "\u0565\u0566\u0580\u0561\u056f\u0561\u0581\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
  },
  // Dissenting opinion: \u0570\u0561\u057f\u0578\u0582\u056f \u056f\u0561\u0580\u056e\u056b\u0584 (hatuk karciq)
  {
    re: /\u0570\u0561\u057f\u0578\u0582\u056f\s+\u056f\u0561\u0580\u056e\u056b\u0584/i,
    type: "dissent",
    label: "\u0570\u0561\u057f\u0578\u0582\u056f \u056f\u0561\u0580\u056e\u056b\u0584",
  },
  // \u0563\u0578\u0580\u056e\u056b \u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584\u0576\u0565\u0580 = gorci hangamanqner (case circumstances/facts)
  {
    re: /\u0563\u0578\u0580\u056e\u056b\s+\u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584/i,
    type: "facts",
    label: "\u0563\u0578\u0580\u056e\u056b \u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584\u0576\u0565\u0580",
  },
  // \u057e\u0573\u056b\u057c = vchir (decision/ruling)
  {
    re: /\u057e\u0573\u056b\u057c\u0565\u0581/i,
    type: "operative",
    label: "\u057e\u0573\u056b\u057c\u0565\u0581",
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

  // Find all article positions
  const articleMatches: { index: number; number: string; fullMatch: string }[] = [];
  const re = new RegExp(ARTICLE_HEADER_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    articleMatches.push({
      index: m.index,
      number: m[1],
      fullMatch: m[0],
    });
  }

  if (articleMatches.length === 0) {
    // No article structure -> fall back to fixed-window
    return chunkFixedWindow(text, "article");
  }

  let chunkIdx = 0;

  // Preamble: text before first article
  if (articleMatches[0].index > MIN_CHUNK_SIZE) {
    const preambleText = text.slice(0, articleMatches[0].index).trim();
    if (preambleText.length > 0) {
      chunks.push(makeChunk(chunkIdx++, "preamble", preambleText, 0, null, null));
    }
  }

  // Each article
  for (let i = 0; i < articleMatches.length; i++) {
    const start = articleMatches[i].index;
    const end = i + 1 < articleMatches.length
      ? articleMatches[i + 1].index
      : text.length;
    const articleText = text.slice(start, end).trim();
    const articleNum = articleMatches[i].number;

    if (articleText.length === 0) continue;

    // Try splitting by numbered parts within article
    const parts = splitByParts(articleText);

    if (parts.length > 1) {
      // Multiple parts found
      for (const part of parts) {
        const partLocator: ChunkLocator = {
          article: articleNum,
          part: part.partNum || undefined,
          // \u0540\u0578\u0564\u057e\u0561\u056e = Hodvac (Article)
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
      // Single chunk for entire article
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

  // Post-process: split oversized chunks
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
      // Save previous segment
      if (currentLines.length > 0) {
        segments.push({
          partNum: currentPart,
          text: currentLines.join("\n"),
          offset: currentOffset,
        });
      }
      currentPart = partMatch[1];
      currentLines = [line];
      currentOffset = charPos;
    } else {
      if (partMatch && charPos === 0) {
        // First part at very start (article header line may have "1." already)
        currentPart = partMatch[1];
      }
      currentLines.push(line);
    }
    charPos += line.length + 1; // +1 for \n
  }

  // Final segment
  if (currentLines.length > 0) {
    segments.push({
      partNum: currentPart,
      text: currentLines.join("\n"),
      offset: currentOffset,
    });
  }

  return segments;
}

// ─── COURT DECISION CHUNKER ────────────────────────────────────────

function chunkCourtDecision(text: string): LegalChunk[] {
  // Find all section boundaries
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
      // Check if this is a line-start or standalone header (not mid-sentence)
      const before = text.slice(Math.max(0, m.index - 2), m.index);
      const isLineStart = m.index === 0 || /[\n\r]/.test(before);
      if (isLineStart || before.trim() === "") {
        boundaries.push({
          index: m.index,
          type: pattern.type,
          label: pattern.label,
        });
      }
    }
  }

  // Sort by position, deduplicate nearby matches
  boundaries.sort((a, b) => a.index - b.index);
  const deduped: SectionBoundary[] = [];
  for (const b of boundaries) {
    const last = deduped[deduped.length - 1];
    if (!last || b.index - last.index > 50) {
      deduped.push(b);
    }
  }

  if (deduped.length === 0) {
    // No section structure detected -> fixed window
    return chunkFixedWindow(text, "full_text");
  }

  const chunks: LegalChunk[] = [];
  let chunkIdx = 0;

  // Header: text before first section
  if (deduped[0].index > MIN_CHUNK_SIZE) {
    const headerText = text.slice(0, deduped[0].index).trim();
    if (headerText.length > 0) {
      chunks.push(makeChunk(chunkIdx++, "header", headerText, 0, null, null));
    }
  }

  // Each section
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

    // Try to break at paragraph boundary
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
      // Split by paragraphs first, then by size
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

// ─── MAIN CHUNKER ──────────────────────────────────────────────────

const COURT_DOC_TYPES = new Set([
  "court_decision", "cassation_ruling", "appeal_ruling",
  "first_instance_ruling", "constitutional_court", "echr_judgment",
]);

const LEGISLATION_DOC_TYPES = new Set([
  "law", "code", "regulation",
]);

export function chunkDocument(document: LegalDocumentInput): LegalChunk[] {
  const text = document.content_text;

  if (!text || text.trim().length === 0) {
    return [];
  }

  if (LEGISLATION_DOC_TYPES.has(document.doc_type)) {
    return chunkLegislation(text);
  }

  if (COURT_DOC_TYPES.has(document.doc_type)) {
    return chunkCourtDecision(text);
  }

  // Default: fixed-window chunking
  return chunkFixedWindow(text, "full_text");
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
    const { document } = body;

    if (!document || !document.content_text) {
      return new Response(
        JSON.stringify({ error: "document with content_text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!document.doc_type) {
      return new Response(
        JSON.stringify({ error: "document.doc_type is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const chunks = chunkDocument(document);

    return new Response(
      JSON.stringify({
        chunks,
        total_chunks: chunks.length,
        doc_type: document.doc_type,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("legal-chunker error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
