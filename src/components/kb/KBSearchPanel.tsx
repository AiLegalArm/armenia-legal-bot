import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Search, FileText, ChevronDown, ChevronRight, Loader2, Scale, AlertTriangle, BookOpen, Gavel, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLegalPracticeKB, type KBDocument, type PracticeCategory } from "@/hooks/useLegalPracticeKB";
import { supabase } from "@/integrations/supabase/client";
import { highlightTerms } from "@/lib/snippet-extractor";

const CATEGORY_LABELS: Record<PracticeCategory, string> = {
  criminal: "\u0554\u0580\u0565\u0561\u056F\u0561\u0576",
  civil: "\u0554\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576",
  administrative: "\u054E\u0561\u0580\u0579\u0561\u056F\u0561\u0576",
  echr: "\u0544\u053B\u0535\u0534",
  constitutional: "\u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576",
};

const COURT_LABELS: Record<string, string> = {
  first_instance: "\u0531\u057C\u0561\u057B\u056B\u0576 \u0561\u057F\u0575\u0561\u0576",
  appeal: "\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579",
  cassation: "\u054E\u0573\u057C\u0561\u0562\u0565\u056F",
  constitutional: "\u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576",
  echr: "\u0544\u053B\u0535\u0534",
};

const OUTCOME_LABELS: Record<string, string> = {
  granted: "\u0532\u0561\u057E\u0561\u0580\u0561\u0580\u057E\u0565\u056C \u0567",
  rejected: "\u0544\u0565\u0580\u056A\u057E\u0565\u056C \u0567",
  partial: "\u0544\u0561\u057D\u0576\u0561\u056F\u056B",
  remanded: "\u054E\u0565\u0580\u0561\u0564\u0561\u0580\u0571\u057E\u0565\u056C",
  discontinued: "\u053F\u0561\u0580\u0573\u057E\u0565\u056C \u0567",
};

function renderValue(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return val.map(renderValue).filter(Boolean).join(", ");
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    for (const key of ["text", "title", "name", "value", "description"]) {
      if (typeof obj[key] === "string") return obj[key] as string;
    }
    const parts = Object.entries(obj)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => {
        const rendered = renderValue(v);
        return rendered ? `${k}: ${rendered}` : "";
      })
      .filter(Boolean);
    return parts.join("; ");
  }
  return String(val);
}

/**
 * Safely clean JSON artifacts from text that might contain raw JSON data.
 * Only attempts JSON.parse when text is short (<5000 chars), starts with '{',
 * and contains a known content key — avoiding false positives on legal text
 * that may contain braces (e.g. "{...}" in Armenian legal citations).
 */
function cleanJsonArtifacts(text: string): string {
  if (!text) return "";

  const trimmed = text.trimStart();
  const shouldTryParse =
    trimmed.length < 5000 &&
    trimmed.startsWith("{") &&
    trimmed.endsWith("}") &&
    /"(?:text|title|value|name|description)"\s*:/.test(trimmed);

  if (shouldTryParse) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null) {
        return renderValue(parsed);
      }
    } catch { /* not valid JSON, fall through */ }
  }

  // Minimal unescape only
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\t/g, "\t");
}

// ================================================================
// Types
// ================================================================

interface KBChunkResult {
  doc_id: string;
  chunk_index: number;
  chunk_type: string;
  label: string | null;
  char_start: number;
  excerpt: string;
  full_text: string | null;
  score: number;
}

interface KBSearchResult {
  id: string;
  title: string;
  category: string;
  source_name: string | null;
  article_number: string | null;
  source_url: string | null;
  max_score: number;
  relevancePct: number;
  chunks: KBChunkResult[];
}

/** Unified merged item for cross-source ranking */
export interface MergedSearchItem {
  source: "kb" | "practice";
  id: string;
  title: string;
  category: string;
  normalizedScore: number;
  preview: string;
  meta: Record<string, string>;
}

type ViewFilter = "all" | "kb" | "practice";

// ================================================================
// Score normalization
// ================================================================

/**
 * Normalize scores within a set to 0..1 range using max-normalization.
 * If all scores are 0 or empty, returns 0 for all.
 */
function normalizeScores(scores: number[]): number[] {
  const max = Math.max(...scores, 0);
  if (max === 0) return scores.map(() => 0);
  return scores.map((s) => s / max);
}

// ================================================================
// Main Panel
// ================================================================

interface KBSearchPanelProps {
  onInsertReference?: (docId: string, chunkIndex: number, text: string) => void;
}

export function KBSearchPanel({ onInsertReference }: KBSearchPanelProps) {
  const { t } = useTranslation("kb");
  const [query, setQuery] = useState("");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");

  // Practice search state
  const [category, setCategory] = useState<PracticeCategory | "all">("all");
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [loadedChunkIndexes, setLoadedChunkIndexes] = useState<Map<string, number[]>>(new Map());

  const {
    documents,
    isSearching,
    searchError,
    isLoadingChunk,
    loadChunk,
    getCachedChunk,
    searchKB: searchPractice,
    clearSearch: clearPractice,
  } = useLegalPracticeKB();

  // KB legislation search state
  const [kbResults, setKbResults] = useState<KBSearchResult[]>([]);
  const [isSearchingKB, setIsSearchingKB] = useState(false);
  const [expandedKBDocs, setExpandedKBDocs] = useState<Set<string>>(new Set());

  // ─── Merged results ────────────────────────────────────────────────
  const mergedResults = useMemo<MergedSearchItem[]>(() => {
    const items: MergedSearchItem[] = [];

    // Normalize KB scores
    const kbScores = kbResults.map((r) => Number(r.max_score) || 0);
    const kbNorm = normalizeScores(kbScores);

    for (let i = 0; i < kbResults.length; i++) {
      const r = kbResults[i];
      const preview = r.chunks.length > 0
        ? (r.chunks[0].excerpt || "").substring(0, 300)
        : "";
      items.push({
        source: "kb",
        id: r.id,
        title: r.title,
        category: r.category,
        normalizedScore: kbNorm[i],
        preview,
        meta: {
          ...(r.source_name ? { source: r.source_name } : {}),
          ...(r.article_number ? { article: r.article_number } : {}),
        },
      });
    }

    // Normalize Practice scores using real max_score from RPC
    const practiceScores = documents.map((d) => Number(d.max_score) || 0);
    const allZero = practiceScores.every((s) => s === 0);
    const practiceNorm = allZero
      ? documents.map((_, idx) => documents.length > 1 ? 1 - idx / documents.length : 1)
      : normalizeScores(practiceScores);

    for (let i = 0; i < documents.length; i++) {
      const d = documents[i];
      const preview = d.legal_reasoning_summary
        ? d.legal_reasoning_summary.substring(0, 300)
        : d.top_chunks.length > 0
          ? d.top_chunks[0].text.substring(0, 300)
          : "";
      items.push({
        source: "practice",
        id: d.id,
        title: d.title,
        category: d.practice_category,
        normalizedScore: practiceNorm[i],
        preview,
        meta: {
          court: COURT_LABELS[d.court_type] || d.court_type,
          outcome: OUTCOME_LABELS[d.outcome] || d.outcome,
        },
      });
    }

    // Sort by normalizedScore descending, stable
    items.sort((a, b) => b.normalizedScore - a.normalizedScore);
    return items;
  }, [kbResults, documents]);

  // ─── Search handlers ───────────────────────────────────────────────
  const searchKBLegislation = useCallback(async (searchQuery: string) => {
    setIsSearchingKB(true);
    try {
      const trimmed = searchQuery.trim();
      if (trimmed.length < 2) { setIsSearchingKB(false); return; }

      const { data, error } = await supabase.rpc("search_kb_chunks", {
        p_query: trimmed,
        p_category: null,
        p_limit_chunks: 50,
        p_limit_docs: 10,
        p_chunks_per_doc: 3,
      });

      if (error) throw error;

      const parsed = data as unknown as { documents: Array<{
        id: string; title: string; category: string;
        source_name: string | null; article_number: string | null;
        source_url: string | null; max_score: number;
      }>; chunks: KBChunkResult[] };

      const chunksByDoc = new Map<string, KBChunkResult[]>();
      for (const chunk of parsed.chunks || []) {
        const arr = chunksByDoc.get(chunk.doc_id) || [];
        arr.push(chunk);
        chunksByDoc.set(chunk.doc_id, arr);
      }

      const docs = parsed.documents || [];
      const globalMax = docs.reduce((mx, d) => Math.max(mx, Number(d.max_score) || 0), 0);

      const results: KBSearchResult[] = docs.map((doc) => {
        const raw = Number(doc.max_score) || 0;
        const relevancePct = globalMax > 0 ? Math.round((raw / globalMax) * 100) : 0;
        return { ...doc, relevancePct, chunks: chunksByDoc.get(doc.id) || [] };
      });

      setKbResults(results);
    } catch (err) {
      console.error("KB chunk search error:", err);
      setKbResults([]);
    } finally {
      setIsSearchingKB(false);
    }
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    await Promise.all([
      searchPractice(query, category === "all" ? null : category),
      searchKBLegislation(query),
    ]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const toggleDocExpanded = (docId: string) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev);
      next.has(docId) ? next.delete(docId) : next.add(docId);
      return next;
    });
  };

  const toggleKBDocExpanded = (docId: string) => {
    setExpandedKBDocs((prev) => {
      const next = new Set(prev);
      next.has(docId) ? next.delete(docId) : next.add(docId);
      return next;
    });
  };

  const handleLoadNextChunk = async (doc: KBDocument) => {
    const currentLoaded = loadedChunkIndexes.get(doc.id) || [];
    const lastLoaded = currentLoaded.length > 0 ? Math.max(...currentLoaded) : -1;
    const nextIndex = lastLoaded + 1;
    if (nextIndex >= doc.totalChunks) return;

    const chunk = await loadChunk(doc.id, nextIndex);
    if (chunk) {
      setLoadedChunkIndexes((prev) => {
        const next = new Map(prev);
        next.set(doc.id, [...(next.get(doc.id) || []), nextIndex]);
        return next;
      });
    }
  };

  const handleInsertReference = (docId: string, chunkIndex: number, text: string) => {
    if (onInsertReference) onInsertReference(docId, chunkIndex, text);
  };

  const clearAll = () => {
    clearPractice();
    setKbResults([]);
  };

  const hasAnyResults = documents.length > 0 || kbResults.length > 0;
  const isLoading = isSearching || isSearchingKB;

  // ─── Scroll to source card on merged item click ────────────────────
  const handleMergedItemClick = (item: MergedSearchItem) => {
    if (item.source === "kb") {
      setViewFilter("kb");
      setExpandedKBDocs((prev) => new Set(prev).add(item.id));
    } else {
      setViewFilter("practice");
      setExpandedDocs((prev) => new Set(prev).add(item.id));
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4" />
          {t("unified_search_title", "\u0548\u0580\u0578\u0576\u0578\u0582\u0574")}
        </CardTitle>
        <CardDescription className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="h-3 w-3" />
          {"\u0540\u0572\u0578\u0582\u0574\u0561\u0575\u056B\u0576 \u0576\u0575\u0578\u0582\u0569 \u0567\u0589 \u0549\u056B \u0570\u0561\u0576\u0564\u056B\u057D\u0561\u0576\u0578\u0582\u0574 \u0563\u0578\u0580\u056E\u056B \u0583\u0561\u057D\u057F"}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-3 overflow-hidden">
        {/* Search controls */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={"\u0548\u0580\u0578\u0576\u0565\u056C \u0570\u0578\u0564\u057E\u0561\u056E, \u057D\u057F\u0561\u057F\u057B\u0561, \u0562\u0561\u0576\u0561\u056C\u056B \u0562\u0561\u057C..."}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-8 h-9"
            />
          </div>
          <Select value={category} onValueChange={(v) => setCategory(v as PracticeCategory | "all")}>
            <SelectTrigger className="w-[130px] h-9">
              <SelectValue placeholder={"\u053F\u0561\u057F\u0565\u0563\u0578\u0580\u056B\u0561"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{"\u0532\u0578\u056C\u0578\u0580\u0568"}</SelectItem>
              {(Object.keys(CATEGORY_LABELS) as PracticeCategory[]).map((key) => (
                <SelectItem key={key} value={key}>{CATEGORY_LABELS[key]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleSearch} disabled={isLoading} size="sm" className="h-9">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "\u0548\u0580\u0578\u0576\u0565\u056C"}
          </Button>
        </div>

        {/* View filter tabs */}
        {hasAnyResults && (
          <Tabs value={viewFilter} onValueChange={(v) => setViewFilter(v as ViewFilter)} className="w-full">
            <TabsList className="w-full h-8">
              <TabsTrigger value="all" className="flex-1 text-xs h-7">
                {t("filter_all", "\u0532\u0578\u056C\u0578\u0580\u0568")} ({mergedResults.length})
              </TabsTrigger>
              <TabsTrigger value="kb" className="flex-1 text-xs h-7">
                <BookOpen className="h-3 w-3 mr-1" />
                {t("filter_kb", "\u0555\u0580\u0565\u0576\u057D\u0564\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576")} ({kbResults.length})
              </TabsTrigger>
              <TabsTrigger value="practice" className="flex-1 text-xs h-7">
                <Gavel className="h-3 w-3 mr-1" />
                {t("filter_practice", "\u054A\u0580\u0561\u056F\u057F\u056B\u056F\u0561")} ({documents.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {searchError && (
          <Alert variant="destructive" className="py-2 mb-2">
            <AlertDescription className="text-xs">{searchError}</AlertDescription>
          </Alert>
        )}

        <ScrollArea className="flex-1">
          <div className="space-y-3">
            {/* ─── ALL: merged view ─── */}
            {viewFilter === "all" && mergedResults.length > 0 && (
              <div className="space-y-1.5">
                {mergedResults.map((item) => (
                  <MergedResultCard
                    key={`${item.source}-${item.id}`}
                    item={item}
                    onClick={() => handleMergedItemClick(item)}
                  />
                ))}
              </div>
            )}

            {/* ─── KB: legislation results ─── */}
            {viewFilter === "kb" && kbResults.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-primary flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5" />
                  {"\u0555\u0580\u0565\u0576\u057D\u0564\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576"} ({kbResults.length})
                </div>
                {kbResults.map((result) => (
                  <KBLawCard
                    key={result.id}
                    result={result}
                    searchQuery={query}
                    isExpanded={expandedKBDocs.has(result.id)}
                    onToggle={() => toggleKBDocExpanded(result.id)}
                    onInsertReference={onInsertReference ? handleInsertReference : undefined}
                  />
                ))}
              </div>
            )}

            {/* ─── PRACTICE: court decisions ─── */}
            {viewFilter === "practice" && documents.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-primary flex items-center gap-1.5">
                  <Gavel className="h-3.5 w-3.5" />
                  {"\u0534\u0561\u057F\u0561\u056F\u0561\u0576 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561"} ({documents.length})
                </div>
                {documents.map((doc) => (
                  <KBDocumentCard
                    key={doc.id}
                    document={doc}
                    isExpanded={expandedDocs.has(doc.id)}
                    onToggle={() => toggleDocExpanded(doc.id)}
                    loadedChunkIndexes={loadedChunkIndexes.get(doc.id) || []}
                    onLoadNextChunk={() => handleLoadNextChunk(doc)}
                    isLoadingChunk={isLoadingChunk}
                    getCachedChunk={getCachedChunk}
                    onInsertReference={handleInsertReference}
                  />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!hasAnyResults && !isLoading && query && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                {"\u0531\u0580\u0564\u0575\u0578\u0582\u0576\u0584\u0576\u0565\u0580 \u0579\u0565\u0576 \u0563\u057F\u0576\u057E\u0565\u056C"}
              </div>
            )}

            {/* Empty for current filter */}
            {hasAnyResults && (
              (viewFilter === "kb" && kbResults.length === 0) ||
              (viewFilter === "practice" && documents.length === 0)
            ) && (
              <div className="text-center py-4 text-muted-foreground text-xs">
                {t("no_results_in_filter", "\u0531\u0575\u057D \u0562\u0561\u056A\u0576\u0578\u0582\u0574 \u0561\u0580\u0564\u0575\u0578\u0582\u0576\u0584\u0576\u0565\u0580 \u0579\u056F\u0561\u0576")}
              </div>
            )}
          </div>
        </ScrollArea>

        {hasAnyResults && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs">
            {"\u0544\u0561\u0584\u0580\u0565\u056C \u0561\u0580\u0564\u0575\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u0568"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ================================================================
// Merged Result Card (compact, click-to-navigate)
// ================================================================

function MergedResultCard({ item, onClick }: { item: MergedSearchItem; onClick: () => void }) {
  const { t } = useTranslation("kb");
  const scorePct = Math.round(item.normalizedScore * 100);

  return (
    <button
      onClick={onClick}
      className="w-full text-left border rounded-md px-3 py-2 bg-card hover:bg-accent/50 transition-colors flex items-start gap-2"
    >
      {item.source === "kb" ? (
        <BookOpen className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
      ) : (
        <Gavel className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium whitespace-normal break-words leading-tight">
            {item.title}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          <Badge variant={item.source === "kb" ? "default" : "secondary"} className="text-[10px] py-0 px-1.5 h-4">
            {item.source === "kb"
              ? t("source_kb", "\u0555\u0580\u0565\u0576\u057D\u0564\u0580.")
              : t("source_practice", "\u054A\u0580\u0561\u056F\u057F.")}
          </Badge>
          <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
            {item.category}
          </Badge>
          {scorePct > 0 && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
              {scorePct}%
            </Badge>
          )}
          {Object.entries(item.meta).map(([k, v]) => (
            <Badge key={k} variant="outline" className="text-[10px] py-0 px-1.5 h-4">
              {v}
            </Badge>
          ))}
        </div>
        {item.preview && (
          <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1 leading-snug">
            {item.preview}
          </p>
        )}
      </div>
    </button>
  );
}

// ================================================================
// KB Law Card (knowledge_base results)
// ================================================================

interface KBLawCardProps {
  result: KBSearchResult;
  searchQuery: string;
  isExpanded: boolean;
  onToggle: () => void;
  onInsertReference?: (docId: string, chunkIndex: number, text: string) => void;
}

function KBLawCard({ result, searchQuery, isExpanded, onToggle, onInsertReference }: KBLawCardProps) {
  const { t } = useTranslation("kb");
  const chunks = result.chunks;
  const [expandedChunks, setExpandedChunks] = useState<Map<number, string>>(new Map());
  const [loadingChunks, setLoadingChunks] = useState<Set<number>>(new Set());

  const handleExpandChunk = async (chunkIndex: number) => {
    if (expandedChunks.has(chunkIndex)) {
      setExpandedChunks((prev) => { const next = new Map(prev); next.delete(chunkIndex); return next; });
      return;
    }

    setLoadingChunks((prev) => new Set(prev).add(chunkIndex));
    try {
      const { data, error } = await supabase.rpc("get_kb_chunk_full", {
        p_kb_id: result.id,
        p_chunk_index: chunkIndex,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const text = typeof row === "object" && row !== null && "chunk_text" in row
        ? String((row as Record<string, unknown>).chunk_text)
        : typeof row === "string" ? row : "";
      if (!text) throw new Error("chunk_text missing from RPC response");
      setExpandedChunks((prev) => new Map(prev).set(chunkIndex, text));
    } catch (err) {
      console.error("Failed to load full chunk:", err);
    } finally {
      setLoadingChunks((prev) => { const next = new Set(prev); next.delete(chunkIndex); return next; });
    }
  };

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-card">
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <button className="flex items-start gap-2 w-full text-left">
            {isExpanded ? <ChevronDown className="h-4 w-4 mt-0.5 shrink-0" /> : <ChevronRight className="h-4 w-4 mt-0.5 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <BookOpen className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium text-sm">{result.title}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <Badge variant="outline" className="text-xs py-0">{result.category}</Badge>
                {result.source_name && <Badge variant="secondary" className="text-xs py-0">{result.source_name}</Badge>}
                {chunks.length > 0 && (
                  <Badge variant="secondary" className="text-xs py-0">
                    {chunks.length} {chunks.length === 1 ? "fragment" : "fragments"}
                  </Badge>
                )}
                {Number.isFinite(result.relevancePct) && result.relevancePct > 0 && (
                  <Badge variant="outline" className="text-xs py-0">{t('relevance')}: {result.relevancePct}%</Badge>
                )}
              </div>
              {!isExpanded && chunks.length > 0 && (
                <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">
                  {chunks[0].label && <span className="font-medium">{chunks[0].label}: </span>}
                  {chunks[0].excerpt}
                </p>
              )}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3 space-y-2">
          {chunks.length > 0 ? (
            chunks.map((chunk, idx) => {
              const hasFullText = chunk.chunk_type === 'article' && !!chunk.full_text;
              const isManuallyCollapsed = expandedChunks.get(chunk.chunk_index) === '__collapsed__';
              const isRpcExpanded = expandedChunks.has(chunk.chunk_index) && !isManuallyCollapsed;
              const isChunkLoading = loadingChunks.has(chunk.chunk_index);

              let displayText: string;
              let showFull: boolean;
              if (isRpcExpanded) {
                displayText = expandedChunks.get(chunk.chunk_index)!;
                showFull = true;
              } else if (isManuallyCollapsed) {
                displayText = chunk.excerpt;
                showFull = false;
              } else {
                displayText = chunk.excerpt;
                showFull = false;
              }

              const handleToggle = (e: React.MouseEvent) => {
                e.stopPropagation();
                if (showFull) {
                  setExpandedChunks((prev) => { const m = new Map(prev); m.delete(chunk.chunk_index); return m; });
                } else if (hasFullText) {
                  setExpandedChunks((prev) => new Map(prev).set(chunk.chunk_index, chunk.full_text!));
                } else {
                  handleExpandChunk(chunk.chunk_index);
                }
              };

              return (
                <div key={idx} className="border rounded-lg p-3 bg-secondary/20 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-primary flex items-center gap-1.5">
                      <BookOpen className="h-3 w-3" />
                      {chunk.label || `${chunk.chunk_type} #${chunk.chunk_index}`}
                    </span>
                    <span className="text-muted-foreground">score: {(chunk.score * 100).toFixed(0)}%</span>
                  </div>
                  <div className={`text-sm text-foreground/90 leading-relaxed ${showFull ? 'whitespace-pre-wrap' : ''}`}>
                    {highlightTerms(displayText, searchQuery).map((seg, i) =>
                      seg.highlight ? (
                        <mark key={i} className="bg-primary/20 text-foreground rounded px-0.5">{seg.text}</mark>
                      ) : (
                        <span key={i}>{seg.text}</span>
                      )
                    )}
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                    <Button variant="ghost" size="sm" className="h-7 text-xs px-3" disabled={isChunkLoading} onClick={handleToggle}>
                      {isChunkLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : showFull ? <Minimize2 className="h-3 w-3 mr-1" /> : <Maximize2 className="h-3 w-3 mr-1" />}
                      {isChunkLoading ? t("kb_loading") : showFull ? t("kb_collapse") : t("kb_show_full")}
                    </Button>
                    {onInsertReference && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs px-3 text-primary"
                        onClick={(e) => { e.stopPropagation(); onInsertReference(result.id, chunk.chunk_index, displayText); }}>
                        {"\u054f\u0565\u0572\u0561\u0564\u0580\u0565\u056c \u0578\u0580\u057a\u0565\u057d KB \u0570\u0572\u0578\u0582\u0574"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="border rounded-lg p-3 bg-secondary/20">
              <p className="text-sm text-muted-foreground italic">{"\u0549\u0561\u0576\u056f\u0565\u0580 \u0579\u0565\u0576 \u0563\u057f\u0576\u057e\u0565\u056c"}</p>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ================================================================
// Practice Document Card (legal_practice_kb results)
// ================================================================

interface KBDocumentCardProps {
  document: KBDocument;
  isExpanded: boolean;
  onToggle: () => void;
  loadedChunkIndexes: number[];
  onLoadNextChunk: () => void;
  isLoadingChunk: boolean;
  getCachedChunk: (docId: string, chunkIndex: number) => ReturnType<ReturnType<typeof useLegalPracticeKB>["getCachedChunk"]>;
  onInsertReference: (docId: string, chunkIndex: number, text: string) => void;
}

function KBDocumentCard({
  document,
  isExpanded,
  onToggle,
  loadedChunkIndexes,
  onLoadNextChunk,
  isLoadingChunk,
  getCachedChunk,
  onInsertReference,
}: KBDocumentCardProps) {
  const { t } = useTranslation("kb");
  const [showDecisionMap, setShowDecisionMap] = useState(false);
  const hasMoreChunks = loadedChunkIndexes.length + document.top_chunks.length < document.totalChunks;

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-card">
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <button className="flex items-start gap-2 w-full text-left">
            {isExpanded ? <ChevronDown className="h-4 w-4 mt-0.5 shrink-0" /> : <ChevronRight className="h-4 w-4 mt-0.5 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium text-sm whitespace-normal break-words">{document.title}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <Badge variant="outline" className="text-xs py-0">{COURT_LABELS[document.court_type] || document.court_type}</Badge>
                <Badge variant="secondary" className="text-xs py-0">{OUTCOME_LABELS[document.outcome] || document.outcome}</Badge>
                {document.top_chunks.length > 0 && (
                  <Badge variant="secondary" className="text-xs py-0">
                    {document.top_chunks.length} {t("snippet", { count: document.top_chunks.length })}
                  </Badge>
                )}
              </div>
              {!isExpanded && document.legal_reasoning_summary && (
                <p className="mt-1.5 text-xs text-muted-foreground line-clamp-3 whitespace-normal break-words">
                  {document.legal_reasoning_summary.substring(0, 400)}
                </p>
              )}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3 space-y-3">
          {document.decision_map && (
            <div className="space-y-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs w-full justify-start"
                onClick={() => setShowDecisionMap(!showDecisionMap)}>
                {showDecisionMap ? "\u053F\u0580\u0573\u0565\u056C \u0584\u0561\u0580\u057F\u0565\u0566\u0568" : "\u0532\u0561\u0581\u0565\u056C \u056B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0584\u0561\u0580\u057F\u0565\u0566\u0568"}
              </Button>
              {showDecisionMap && (
                <div className="bg-muted/50 rounded p-2 text-xs space-y-1.5">
                  {document.decision_map.legal_question && (
                    <div><span className="font-medium">{"\u053B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0570\u0561\u0580\u0581"}:</span> {renderValue(document.decision_map.legal_question)}</div>
                  )}
                  {document.decision_map.holding && (
                    <div><span className="font-medium">{"\u0534\u056B\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574"}:</span> {renderValue(document.decision_map.holding)}</div>
                  )}
                  {document.decision_map.tests_or_criteria && (
                    <div><span className="font-medium">{"\u0539\u0565\u057D\u057F\u0565\u0580/\u0579\u0561\u0583\u0561\u0576\u056B\u0577\u0576\u0565\u0580"}:</span> {renderValue(document.decision_map.tests_or_criteria)}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {document.top_chunks.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                {"\u0540\u0561\u0574\u0561\u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576 \u0570\u0561\u057F\u057E\u0561\u056E\u0576\u0565\u0580"} ({document.top_chunks.length}/{document.totalChunks})
              </div>
              {document.top_chunks.map((chunk) => (
                <ChunkDisplay key={chunk.chunkIndex} docId={document.id} chunkIndex={chunk.chunkIndex}
                  totalChunks={document.totalChunks} text={chunk.text} onInsertReference={onInsertReference} />
              ))}
            </div>
          ) : document.legal_reasoning_summary ? (
            <div className="border rounded-lg p-3 bg-secondary/20 space-y-2">
              <span className="font-semibold text-xs text-primary flex items-center gap-1.5">
                <Gavel className="h-3 w-3" />{"\u053b\u0580\u0561\u057e\u0561\u056f\u0561\u0576 \u0570\u056b\u0574\u0576\u0561\u057e\u0578\u0580\u0578\u0582\u0574"}
              </span>
              <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{document.legal_reasoning_summary}</div>
            </div>
          ) : null}

          {loadedChunkIndexes.map((idx) => {
            const chunk = getCachedChunk(document.id, idx);
            if (!chunk) return null;
            return <ChunkDisplay key={`loaded-${idx}`} docId={document.id} chunkIndex={chunk.chunkIndex}
              totalChunks={chunk.totalChunks} text={chunk.text} onInsertReference={onInsertReference} />;
          })}

          {hasMoreChunks && (
            <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={onLoadNextChunk} disabled={isLoadingChunk}>
              {isLoadingChunk ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              {"\u0532\u0561\u0581\u0565\u056C \u0570\u0561\u057B\u0578\u0580\u0564 \u0570\u0561\u057F\u057E\u0561\u056E\u0568"}
            </Button>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ================================================================
// Chunk Display
// ================================================================

interface ChunkDisplayProps {
  docId: string;
  chunkIndex: number;
  totalChunks: number;
  text: string;
  onInsertReference: (docId: string, chunkIndex: number, text: string) => void;
}

function ChunkDisplay({ docId, chunkIndex, totalChunks, text, onInsertReference }: ChunkDisplayProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const cleanText = cleanJsonArtifacts(text);
  const displayText = isCollapsed ? cleanText.substring(0, 300) : cleanText;
  const canCollapse = cleanText.length > 300;

  return (
    <div className="border rounded-lg p-3 bg-secondary/20 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-primary flex items-center gap-1.5">
          <Gavel className="h-3 w-3" />{"\u0531\u0576\u0561\u056C\u0578\u0563 \u0564\u0561\u057F\u0561\u056F\u0561\u0576 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561 (KB)"}
        </span>
        <Badge variant="outline" className="text-[10px] py-0 px-1.5">{chunkIndex + 1}/{totalChunks}</Badge>
      </div>
      <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed font-normal">
        {displayText}
        {isCollapsed && canCollapse && "..."}
      </div>
      <div className="flex items-center gap-2 pt-1 border-t border-border/50">
        {canCollapse && (
          <Button variant="ghost" size="sm" className="h-7 text-xs px-3" onClick={() => setIsCollapsed(!isCollapsed)}>
            {isCollapsed ? "\u0538\u0576\u0564\u056C\u0561\u0575\u0576\u0565\u056C" : "\u053F\u0580\u0573\u0565\u056C"}
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-7 text-xs px-3 text-primary"
          onClick={() => onInsertReference(docId, chunkIndex, text)}>
          {"\u054F\u0565\u0572\u0561\u0564\u0580\u0565\u056C \u0578\u0580\u057A\u0565\u057D KB \u0570\u0572\u0578\u0582\u0574"}
        </Button>
      </div>
    </div>
  );
}
