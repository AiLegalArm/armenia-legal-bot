import { useState, useCallback, useRef } from "react";
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

/**
 * Safely render a value that might be a JSON object/array as readable text.
 */
function renderValue(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return val.map(renderValue).filter(Boolean).join(", ");
  if (typeof val === "object") {
    // Try to extract meaningful text from object
    const obj = val as Record<string, unknown>;
    // If it has a "text" or "title" or "name" key, use that
    for (const key of ["text", "title", "name", "value", "description"]) {
      if (typeof obj[key] === "string") return obj[key] as string;
    }
    // Otherwise join all string values
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
 * Remove JSON artifacts from text that might contain raw JSON data.
 */
function cleanJsonArtifacts(text: string): string {
  if (!text) return "";
  let cleaned = text;
  // Try to parse if the whole text looks like JSON
  if ((cleaned.startsWith("{") || cleaned.startsWith("[")) && (cleaned.endsWith("}") || cleaned.endsWith("]"))) {
    try {
      const parsed = JSON.parse(cleaned);
      return renderValue(parsed);
    } catch {
      // not valid JSON, continue
    }
  }
  // Remove common JSON noise patterns
  cleaned = cleaned
    .replace(/^\s*[\[{]\s*"[^"]*"\s*:\s*/m, "")  // remove leading {"key":
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\t/g, "\t");
  return cleaned;
}

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

interface KBSearchPanelProps {
  onInsertReference?: (docId: string, chunkIndex: number, text: string) => void;
}

export function KBSearchPanel({ onInsertReference }: KBSearchPanelProps) {
  const { t } = useTranslation("kb");
  const [query, setQuery] = useState("");
  
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

      // Group chunks by doc_id
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
        return {
          ...doc,
          relevancePct,
          chunks: chunksByDoc.get(doc.id) || [],
        };
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
    if (e.key === "Enter") {
      handleSearch();
    }
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
    if (onInsertReference) {
      onInsertReference(docId, chunkIndex, text);
    }
  };

  const clearAll = () => {
    clearPractice();
    setKbResults([]);
  };

  const hasAnyResults = documents.length > 0 || kbResults.length > 0;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4" />
          {"\u0548\u0580\u0578\u0576\u0578\u0582\u0574"}
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
          <Button onClick={handleSearch} disabled={isSearching || isSearchingKB} size="sm" className="h-9">
            {(isSearching || isSearchingKB) ? <Loader2 className="h-4 w-4 animate-spin" /> : "\u0548\u0580\u0578\u0576\u0565\u056C"}
          </Button>
        </div>

        {/* Tabs for results */}
        {/* Practice results */}
        {searchError && (
          <Alert variant="destructive" className="py-2 mb-2">
            <AlertDescription className="text-xs">{searchError}</AlertDescription>
          </Alert>
        )}
        <ScrollArea className="flex-1">
          <div className="space-y-3">
            {/* Legislation results */}
            {kbResults.length > 0 && (
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

            {/* Practice results */}
            {documents.length > 0 && (
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

            {documents.length === 0 && kbResults.length === 0 && !isSearching && !isSearchingKB && query && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                {"\u0531\u0580\u0564\u0575\u0578\u0582\u0576\u0584\u0576\u0565\u0580 \u0579\u0565\u0576 \u0563\u057F\u0576\u057E\u0565\u056C"}
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
  // Track which chunks have been expanded to full text
  const [expandedChunks, setExpandedChunks] = useState<Map<number, string>>(new Map());
  const [loadingChunks, setLoadingChunks] = useState<Set<number>>(new Set());

  const handleExpandChunk = async (chunkIndex: number) => {
    // If already expanded, collapse it
    if (expandedChunks.has(chunkIndex)) {
      setExpandedChunks((prev) => {
        const next = new Map(prev);
        next.delete(chunkIndex);
        return next;
      });
      return;
    }

    setLoadingChunks((prev) => new Set(prev).add(chunkIndex));
    try {
      const { data, error } = await supabase.rpc("get_kb_chunk_full", {
        p_kb_id: result.id,
        p_chunk_index: chunkIndex,
      });
      if (error) throw error;
      // Robust: handle array or single object
      const row = Array.isArray(data) ? data[0] : data;
      const text = typeof row === "object" && row !== null && "chunk_text" in row
        ? String((row as Record<string, unknown>).chunk_text)
        : typeof row === "string" ? row : "";
      if (!text) throw new Error("chunk_text missing from RPC response");
      setExpandedChunks((prev) => new Map(prev).set(chunkIndex, text));
    } catch (err) {
      console.error("Failed to load full chunk:", err);
    } finally {
      setLoadingChunks((prev) => {
        const next = new Set(prev);
        next.delete(chunkIndex);
        return next;
      });
    }
  };

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-card">
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <button className="flex items-start gap-2 w-full text-left">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 mt-0.5 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <BookOpen className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium text-sm">{result.title}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <Badge variant="outline" className="text-xs py-0">
                  {result.category}
                </Badge>
                {result.source_name && (
                  <Badge variant="secondary" className="text-xs py-0">
                    {result.source_name}
                  </Badge>
                )}
                {chunks.length > 0 && (
                  <Badge variant="secondary" className="text-xs py-0">
                    {chunks.length} {chunks.length === 1 ? "fragment" : "fragments"}
                  </Badge>
                )}
                {Number.isFinite(result.relevancePct) && result.relevancePct > 0 && (
                  <Badge variant="outline" className="text-xs py-0">
                    {t('relevance')}: {result.relevancePct}%
                  </Badge>
                )}
              </div>
              {/* Show first chunk excerpt as preview when collapsed */}
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

              // Determine what text to show
              let displayText: string;
              let showFull: boolean;
              if (isRpcExpanded) {
                // Manually expanded via button or has inline full_text toggled on
                displayText = expandedChunks.get(chunk.chunk_index)!;
                showFull = true;
              } else if (isManuallyCollapsed) {
                // Was full, user collapsed it back
                displayText = chunk.excerpt;
                showFull = false;
              } else {
                // Default: always show excerpt first
                displayText = chunk.excerpt;
                showFull = false;
              }

              const handleToggle = (e: React.MouseEvent) => {
                e.stopPropagation();
                if (showFull) {
                  // Collapse back to excerpt
                  setExpandedChunks((prev) => { const m = new Map(prev); m.delete(chunk.chunk_index); return m; });
                } else if (hasFullText) {
                  // Expand using inline full_text
                  setExpandedChunks((prev) => new Map(prev).set(chunk.chunk_index, chunk.full_text!));
                } else {
                  // Expand via RPC
                  handleExpandChunk(chunk.chunk_index);
                }
              };

              return (
                <div
                  key={idx}
                  className="border rounded-lg p-3 bg-secondary/20 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-primary flex items-center gap-1.5">
                      <BookOpen className="h-3 w-3" />
                      {chunk.label || `${chunk.chunk_type} #${chunk.chunk_index}`}
                    </span>
                    <span className="text-muted-foreground">
                      score: {(chunk.score * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className={`text-sm text-foreground/90 leading-relaxed ${showFull ? 'whitespace-pre-wrap' : ''}`}>
                    {highlightTerms(displayText, searchQuery).map((seg, i) =>
                      seg.highlight ? (
                        <mark key={i} className="bg-primary/20 text-foreground rounded px-0.5">
                          {seg.text}
                        </mark>
                      ) : (
                        <span key={i}>{seg.text}</span>
                      )
                    )}
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs px-3"
                      disabled={isChunkLoading}
                      onClick={handleToggle}
                    >
                      {isChunkLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : showFull ? (
                        <Minimize2 className="h-3 w-3 mr-1" />
                      ) : (
                        <Maximize2 className="h-3 w-3 mr-1" />
                      )}
                      {isChunkLoading ? t("kb_loading") : showFull ? t("kb_collapse") : t("kb_show_full")}
                    </Button>
                    {onInsertReference && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs px-3 text-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          onInsertReference(result.id, chunk.chunk_index, displayText);
                        }}
                      >
                        {"\u054f\u0565\u0572\u0561\u0564\u0580\u0565\u056c \u0578\u0580\u057a\u0565\u057d KB \u0570\u0572\u0578\u0582\u0574"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="border rounded-lg p-3 bg-secondary/20">
              <p className="text-sm text-muted-foreground italic">
                {"\u0549\u0561\u0576\u056f\u0565\u0580 \u0579\u0565\u0576 \u0563\u057f\u0576\u057e\u0565\u056c"}
              </p>
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
  const [showDecisionMap, setShowDecisionMap] = useState(false);
  const hasMoreChunks = loadedChunkIndexes.length + document.top_chunks.length < document.totalChunks;

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-card">
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <button className="flex items-start gap-2 w-full text-left">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 mt-0.5 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium text-sm truncate">{document.title}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <Badge variant="outline" className="text-xs py-0">
                  {COURT_LABELS[document.court_type] || document.court_type}
                </Badge>
                <Badge variant="secondary" className="text-xs py-0">
                  {OUTCOME_LABELS[document.outcome] || document.outcome}
                </Badge>
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3 space-y-3">
          {document.decision_map && (
            <div className="space-y-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs w-full justify-start"
                onClick={() => setShowDecisionMap(!showDecisionMap)}
              >
                {showDecisionMap ? "\u053F\u0580\u0573\u0565\u056C \u0584\u0561\u0580\u057F\u0565\u0566\u0568" : "\u0532\u0561\u0581\u0565\u056C \u056B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0584\u0561\u0580\u057F\u0565\u0566\u0568"}
              </Button>

              {showDecisionMap && (
                <div className="bg-muted/50 rounded p-2 text-xs space-y-1.5">
                  {document.decision_map.legal_question && (
                    <div>
                      <span className="font-medium">{"\u053B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0570\u0561\u0580\u0581"}:</span>{" "}
                      {renderValue(document.decision_map.legal_question)}
                    </div>
                  )}
                  {document.decision_map.holding && (
                    <div>
                      <span className="font-medium">{"\u0534\u056B\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574"}:</span>{" "}
                      {renderValue(document.decision_map.holding)}
                    </div>
                  )}
                  {document.decision_map.tests_or_criteria && (
                    <div>
                      <span className="font-medium">{"\u0539\u0565\u057D\u057F\u0565\u0580/\u0579\u0561\u0583\u0561\u0576\u056B\u0577\u0576\u0565\u0580"}:</span>{" "}
                      {renderValue(document.decision_map.tests_or_criteria)}
                    </div>
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
                <ChunkDisplay
                  key={chunk.chunkIndex}
                  docId={document.id}
                  chunkIndex={chunk.chunkIndex}
                  totalChunks={document.totalChunks}
                  text={chunk.text}
                  onInsertReference={onInsertReference}
                />
              ))}
            </div>
          ) : document.legal_reasoning_summary ? (
            <div className="border rounded-lg p-3 bg-secondary/20 space-y-2">
              <span className="font-semibold text-xs text-primary flex items-center gap-1.5">
                <Gavel className="h-3 w-3" />
                {"\u053b\u0580\u0561\u057e\u0561\u056f\u0561\u0576 \u0570\u056b\u0574\u0576\u0561\u057e\u0578\u0580\u0578\u0582\u0574"}
              </span>
              <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                {document.legal_reasoning_summary}
              </div>
            </div>
          ) : null}

          {loadedChunkIndexes.map((idx) => {
            const chunk = getCachedChunk(document.id, idx);
            if (!chunk) return null;
            return (
              <ChunkDisplay
                key={`loaded-${idx}`}
                docId={document.id}
                chunkIndex={chunk.chunkIndex}
                totalChunks={chunk.totalChunks}
                text={chunk.text}
                onInsertReference={onInsertReference}
              />
            );
          })}

          {hasMoreChunks && (
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs"
              onClick={onLoadNextChunk}
              disabled={isLoadingChunk}
            >
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
  // Clean JSON artifacts from text if present
  const cleanText = cleanJsonArtifacts(text);
  const displayText = isCollapsed ? cleanText.substring(0, 300) : cleanText;
  const canCollapse = cleanText.length > 300;

  return (
    <div className="border rounded-lg p-3 bg-secondary/20 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-primary flex items-center gap-1.5">
          <Gavel className="h-3 w-3" />
          {"\u0531\u0576\u0561\u056C\u0578\u0563 \u0564\u0561\u057F\u0561\u056F\u0561\u0576 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561 (KB)"}
        </span>
        <Badge variant="outline" className="text-[10px] py-0 px-1.5">
          {chunkIndex + 1}/{totalChunks}
        </Badge>
      </div>
      <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed font-normal">
        {displayText}
        {isCollapsed && canCollapse && "..."}
      </div>
      <div className="flex items-center gap-2 pt-1 border-t border-border/50">
        {canCollapse && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-3"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            {isCollapsed ? "\u0538\u0576\u0564\u056C\u0561\u0575\u0576\u0565\u056C" : "\u053F\u0580\u0573\u0565\u056C"}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs px-3 text-primary"
          onClick={() => onInsertReference(docId, chunkIndex, text)}
        >
          {"\u054F\u0565\u0572\u0561\u0564\u0580\u0565\u056C \u0578\u0580\u057A\u0565\u057D KB \u0570\u0572\u0578\u0582\u0574"}
        </Button>
      </div>
    </div>
  );
}
