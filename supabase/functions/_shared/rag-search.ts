// =============================================================================
// UNIFIED RAG SEARCH — Single module for all KB + Practice hybrid search
// Used by: ai-analyze, legal-chat, multi-agent-analyze, generate-complaint,
//          generate-document, vector-search
// =============================================================================
//
// INDEX SEPARATION RULE (MANDATORY):
// 1. Normative KB (knowledge_base) → laws/legislation ONLY
// 2. Practice KB (legal_practice_kb) → RA court decisions ONLY
// 3. ECHR KB → ECHR decisions ONLY (filtered by practice_category='echr')
// NEVER mix indexes across these boundaries.
// NEVER embed entire documents for generation — use precedent_units only.
// When Practice results contain key_paragraphs (precedent_units), prefer them
// over full content_text for AI prompt injection.
// =============================================================================

import type { KBSearchResult, PracticeSearchResult, VectorSearchResponse } from "./rag-types.ts";

// ─── Configuration ──────────────────────────────────────────────────────────

export interface RAGSearchOptions {
  /** Supabase client (service_role) */
  supabase: SupabaseClient;
  /** Supabase URL for vector-search edge function calls */
  supabaseUrl: string;
  /** Service role key for auth */
  supabaseKey: string;
  /** The user query to search */
  query: string;
  /** Reference date for temporal legislation filtering (ISO string) */
  referenceDate?: string | null;
  /** Practice category filter */
  category?: string | null;
}

export interface RAGKBOptions extends RAGSearchOptions {
  /** Max results to return (default: 8) */
  limit?: number;
  /** Max content chars per result (default: 4000) */
  snippetLength?: number;
}

export interface RAGPracticeOptions extends RAGSearchOptions {
  /** Max results to return (default: 5) */
  limit?: number;
  /** Max content chars per result (default: full text) */
  snippetLength?: number;
}

export interface RAGResult<T> {
  results: T[];
  sources: Array<{ title: string; category?: string; source_name?: string }>;
}

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

// ─── Keyword extraction ─────────────────────────────────────────────────────

/** Extract and sanitize search keywords from query text */
export function extractKeywords(text: string, maxCount = 10): string[] {
  return text
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^[0-9]+$/.test(w))
    .slice(0, maxCount);
}

/** Sanitize keyword for Postgrest ILIKE (remove special chars) */
export function sanitizeForPostgrest(input: string): string {
  return input
    .replace(/[%_]/g, "")
    .replace(/[(),.*\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 200);
}

// ─── Vector Search Helper ───────────────────────────────────────────────────

/** Call the vector-search edge function */
async function callVectorSearch(
  supabaseUrl: string,
  supabaseKey: string,
  query: string,
  tables: "kb" | "practice" | "both",
  opts: { limit?: number; category?: string | null; referenceDate?: string | null } = {}
): Promise<VectorSearchResponse> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/vector-search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        query,
        tables,
        category: opts.category || undefined,
        limit: opts.limit || 10,
        threshold: 0.3,
        reference_date: opts.referenceDate || undefined,
      }),
    });
    if (!response.ok) return { kb: [], practice: [] };
    return await response.json();
  } catch {
    return { kb: [], practice: [] };
  }
}

// ─── Keyword Relevance Scoring ──────────────────────────────────────────────

interface ScoredItem {
  id: string;
  title: string;
  score: number;
  [key: string]: unknown;
}

/** Score items by keyword overlap: title=3, reasoning/summary=2, content=1 */
function scoreByKeywords<T extends { id: string; title: string; content_text?: string; legal_reasoning_summary?: string }>(
  items: T[],
  keywords: string[]
): (T & { score: number })[] {
  return items.map((r) => {
    let score = 0;
    const titleLower = (r.title || "").toLowerCase();
    const contentLower = (r.content_text || "").toLowerCase();
    const reasoningLower = (r.legal_reasoning_summary || "").toLowerCase();
    for (const kw of keywords) {
      const kwLower = kw.toLowerCase();
      if (titleLower.includes(kwLower)) score += 3;
      if (reasoningLower.includes(kwLower)) score += 2;
      if (contentLower.includes(kwLower)) score += 1;
    }
    return { ...r, score };
  });
}

// ─── Deduplication ──────────────────────────────────────────────────────────

/** Merge arrays of items by id, preserving insertion order (first wins) */
function dedup<T extends { id: string }>(
  ...arrays: T[][]
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const arr of arrays) {
    for (const item of arr) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        out.push(item);
      }
    }
  }
  return out;
}

// ─── Knowledge Base Search ──────────────────────────────────────────────────

/**
 * Hybrid KB search: vector + keyword ILIKE + FTS RPC fallback.
 * Returns deduplicated, scored, trimmed results.
 */
export async function searchKB(opts: RAGKBOptions): Promise<RAGResult<KBSearchResult>> {
  const { supabase, supabaseUrl, supabaseKey, query, referenceDate } = opts;
  const limit = opts.limit ?? 8;
  const snippetLen = opts.snippetLength ?? 4000;
  const keywords = extractKeywords(query);
  const safeKeywords = keywords.map(sanitizeForPostgrest).filter((k) => k.length > 0);

  // Phase 1: Parallel vector + keyword search
  const vectorPromise = callVectorSearch(supabaseUrl, supabaseKey, query, "kb", {
    limit: 10,
    referenceDate,
  });

  const keywordPromise = (async (): Promise<KBSearchResult[]> => {
    if (safeKeywords.length === 0) return [];
    const orConditions = safeKeywords
      .map((k) => `title.ilike.%${k}%,content_text.ilike.%${k}%`)
      .join(",");
    const { data, error } = await supabase
      .from("knowledge_base")
      .select("id, title, content_text, category, source_name")
      .eq("is_active", true)
      .or(orConditions)
      .limit(50);
    return !error && data ? data : [];
  })();

  const [vectorResults, keywordResults] = await Promise.all([vectorPromise, keywordPromise]);

  // Vector results get semantic-based rank
  const vectorItems = (vectorResults.kb || []).map((r: KBSearchResult) => ({
    ...r,
    score: (r.similarity || 0) * 10,
  }));

  // Keyword results get keyword-relevance score
  const scoredKeyword = scoreByKeywords(keywordResults, keywords);

  // Merge: vector first (semantic), then keyword
  let merged = dedup(vectorItems, scoredKeyword);

  // Phase 2: FTS RPC fallback if nothing found
  if (merged.length === 0) {
    const rpcParams: Record<string, unknown> = { search_query: query, result_limit: 20 };
    if (referenceDate) rpcParams.reference_date = referenceDate;
    const { data, error } = await supabase.rpc("search_knowledge_base", rpcParams);
    if (!error && data) {
      merged = (data as KBSearchResult[]).filter((r) => (r.rank ?? 0) > 0.001);
    }
  }

  // Sort by score descending, trim
  const sorted = merged
    .sort((a, b) => (b.score ?? b.rank ?? 0) - (a.score ?? a.rank ?? 0))
    .slice(0, limit);

  // Trim content
  const trimmed = sorted.map((r) => ({
    ...r,
    content_text: (r.content_text || "").substring(0, snippetLen),
  }));

  const sources = trimmed.map((r) => ({
    title: r.title,
    category: r.category,
    source_name: r.source_name || "RA Legal Database",
  }));

  return { results: trimmed, sources };
}

// ─── Legal Practice Search ──────────────────────────────────────────────────

/**
 * Hybrid practice search: vector + keyword ILIKE + FTS RPC fallback.
 * Returns deduplicated, scored, trimmed results.
 */
export async function searchPractice(opts: RAGPracticeOptions): Promise<RAGResult<PracticeSearchResult>> {
  const { supabase, supabaseUrl, supabaseKey, query, category } = opts;
  const limit = opts.limit ?? 5;
  const keywords = extractKeywords(query, 8);
  const safeKeywords = keywords.map(sanitizeForPostgrest).filter((k) => k.length > 0);

  // Phase 1: Parallel vector + keyword
  const vectorPromise = callVectorSearch(supabaseUrl, supabaseKey, query, "practice", {
    limit: 10,
    category,
  });

  const keywordPromise = (async (): Promise<PracticeSearchResult[]> => {
    if (safeKeywords.length === 0) return [];
    const orConditions = safeKeywords
      .map((k) => `title.ilike.%${k}%,legal_reasoning_summary.ilike.%${k}%`)
      .join(",");
    let q = supabase
      .from("legal_practice_kb")
      .select("id, title, content_text, practice_category, court_type, outcome, legal_reasoning_summary, applied_articles, key_violations")
      .eq("is_active", true)
      .or(orConditions)
      .limit(30);
    if (category) q = q.eq("practice_category", category);
    const { data, error } = await q;
    return !error && data ? data : [];
  })();

  const [vectorResults, keywordResults] = await Promise.all([vectorPromise, keywordPromise]);

  // Normalize vector results (content_snippet → content_text)
  const vectorItems = (vectorResults.practice || []).map((r: PracticeSearchResult) => ({
    ...r,
    content_text: r.content_text || r.content_snippet || "",
    score: (r.similarity || 0) * 10,
  }));

  const scoredKeyword = scoreByKeywords(
    keywordResults as Array<PracticeSearchResult & { legal_reasoning_summary?: string }>,
    keywords
  );

  let merged = dedup(vectorItems, scoredKeyword);

  // Phase 2: FTS RPC fallback
  if (merged.length === 0) {
    const rpcParams: Record<string, unknown> = {
      search_query: query,
      result_limit: 10,
    };
    if (category) rpcParams.category = category;
    const { data, error } = await supabase.rpc("search_legal_practice", rpcParams);
    if (!error && data) {
      merged = data as PracticeSearchResult[];
    }
  }

  // Sort and trim
  const sorted = merged
    .sort((a, b) => (b.score ?? b.rank ?? b.relevance_rank ?? 0) - (a.score ?? a.rank ?? a.relevance_rank ?? 0))
    .slice(0, limit);

  const sources = sorted.map((r) => ({
    title: r.title,
    category: r.practice_category,
  }));

  return { results: sorted, sources };
}

// ─── Formatters ─────────────────────────────────────────────────────────────

/** Format KB results into context string for AI prompt */
export function formatKBContext(results: KBSearchResult[], snippetLength = 4000): string {
  if (results.length === 0) return "";
  return results
    .map(
      (r, i) =>
        `[${i + 1}] ${r.title} (${r.category}, ${r.source_name || "N/A"}):\n${(r.content_text || "").substring(0, snippetLength)}`
    )
    .join("\n\n---\n\n");
}

/** Format practice results into context string for AI prompt.
 * INDEX SEPARATION: Only RA court decisions appear here. ECHR is filtered separately.
 * Prefers precedent_units (key_paragraphs) over full document text per INDEX SEPARATION RULE.
 */
export function formatPracticeContext(results: PracticeSearchResult[], fullText = true): string {
  if (results.length === 0) return "";

  const outcomeLabels: Record<string, string> = {
    granted: "\u0532\u0561\u057E\u0561\u0580\u0561\u0580\u057E\u0565\u056C",
    rejected: "\u0544\u0565\u0580\u056A\u057E\u0565\u056C",
    partial: "\u0544\u0561\u057D\u0576\u0561\u056F\u056B",
    remanded: "\u054E\u0565\u0580\u0561\u0564\u0561\u0580\u0571\u057E\u0565\u056C",
    discontinued: "\u053F\u0561\u0580\u0573\u057E\u0565\u056C",
  };

  const courtLabels: Record<string, string> = {
    first_instance: "\u0531\u057C\u0561\u057B\u056B\u0576 \u0561\u057F\u0575\u0561\u0576",
    appeal: "\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579",
    cassation: "\u054E\u0573\u057C\u0561\u0562\u0565\u056F",
    constitutional: "\u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576",
    echr: "\u0535\u054D\u054A\u053F",
  };

  return results
    .map((r, i) => {
      const articles = r.applied_articles
        ? Array.isArray(r.applied_articles)
          ? r.applied_articles.join(", ")
          : JSON.stringify(r.applied_articles)
        : "\u0546/\u0531";
      const violations = r.key_violations?.join(", ") || "\u0546/\u0531";
      const court = courtLabels[r.court_type || ""] || r.court_type || "";
      const outcome = outcomeLabels[r.outcome || ""] || r.outcome || "";

      // INDEX SEPARATION: Prefer precedent_units over full document embedding
      let contentBlock = "";
      const keyParas = r.key_paragraphs;
      if (keyParas && Array.isArray(keyParas) && keyParas.length > 0) {
        // Use precedent_units embeddings only (not entire documents)
        const units = keyParas.slice(0, 6).map((u: Record<string, unknown>, idx: number) => {
          const ruleText = u.rule_text || u.holding || "";
          const quote = u.quote || u.exact_quote || "";
          const anchor = u.anchor || u.paragraph || "";
          const issueId = u.issue_id || "";
          return `  ${idx + 1}) ${ruleText}${quote ? `\n     \u00AB${quote}\u00BB` : ""}${anchor ? ` [\u00A7${anchor}]` : ""}${issueId ? ` [${issueId}]` : ""}`;
        }).join("\n");
        contentBlock = `\n\nPRECEDENT UNITS:\n${units}`;
      } else if (fullText) {
        contentBlock = `\n\n${r.legal_reasoning_summary || (r.content_text || r.content_snippet || "").substring(0, 2000)}`;
      } else {
        contentBlock = `\n${(r.content_snippet || r.content_text || "").substring(0, 1500)}`;
      }

      return `[\u054A\u0580\u0561\u056F\u057F\u056B\u056F\u0561 ${i + 1}] ${r.title}
\u0534\u0561\u057F\u0561\u0580\u0561\u0576: ${court} | \u053F\u0561\u057F\u0565\u0563\u0578\u0580\u056B\u0561: ${r.practice_category || ""} | \u0535\u056C\u0584: ${outcome}
\u053F\u056B\u0580\u0561\u057C\u057E\u0561\u056E \u0570\u0578\u0564\u057E\u0561\u056E\u0576\u0565\u0580: ${articles}
\u0540\u056B\u0574\u0576\u0561\u056F\u0561\u0576 \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580: ${violations}
\u053B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0570\u056B\u0574\u0576\u0561\u057E\u0578\u0580\u0578\u0582\u0574: ${r.legal_reasoning_summary || "\u0546/\u0531"}${contentBlock}`;
    })
    .join("\n\n---\n\n");
}

/** Build temporal disclaimer for RAG context */
export function temporalDisclaimer(referenceDate: string | null | undefined, dateAssumed: boolean): string {
  if (dateAssumed) {
    return "\n\n[TEMPORAL NOTE: No case date provided. Legislation shown is the currently effective version. If events occurred on a different date, applicable law may differ. State this assumption explicitly.]";
  }
  if (referenceDate) {
    return `\n\n[TEMPORAL NOTE: Legislation filtered for versions effective as of ${referenceDate}.]`;
  }
  return "";
}

// ─── Convenience: Full dual-bucket search ───────────────────────────────────

export interface DualRAGResult {
  kbContext: string;
  practiceContext: string;
  kbResults: KBSearchResult[];
  practiceResults: PracticeSearchResult[];
  sources: Array<{ title: string; category?: string; source_name?: string }>;
}

/**
 * One-call dual-bucket RAG: searches both KB and Practice in parallel,
 * returns formatted context strings ready for AI prompt injection.
 */
export async function dualSearch(opts: RAGSearchOptions & {
  kbLimit?: number;
  practiceLimit?: number;
  kbSnippetLength?: number;
  fullPracticeText?: boolean;
}): Promise<DualRAGResult> {
  const [kb, practice] = await Promise.all([
    searchKB({
      ...opts,
      limit: opts.kbLimit ?? 8,
      snippetLength: opts.kbSnippetLength ?? 4000,
    }),
    searchPractice({
      ...opts,
      limit: opts.practiceLimit ?? 5,
    }),
  ]);

  return {
    kbContext: formatKBContext(kb.results, opts.kbSnippetLength ?? 4000),
    practiceContext: formatPracticeContext(practice.results, opts.fullPracticeText ?? true),
    kbResults: kb.results,
    practiceResults: practice.results,
    sources: [...kb.sources, ...practice.sources],
  };
}
