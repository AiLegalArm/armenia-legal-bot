import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, FileText, ChevronDown, ChevronRight, Loader2, Scale, AlertTriangle, BookOpen, Gavel } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useLegalPracticeKB, type KBDocument, type PracticeCategory } from "@/hooks/useLegalPracticeKB";
import { supabase } from "@/integrations/supabase/client";

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

interface KBSearchResult {
  id: string;
  title: string;
  content_text: string;
  category: string;
  source_name: string | null;
  version_date: string | null;
  rank: number;
}

interface KBSearchPanelProps {
  onInsertReference?: (docId: string, chunkIndex: number, text: string) => void;
}

export function KBSearchPanel({ onInsertReference }: KBSearchPanelProps) {
  const { t } = useTranslation("kb");
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"practice" | "laws">("practice");
  
  // Practice search state
  const [category, setCategory] = useState<PracticeCategory | "all">("all");
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [loadedChunkIndexes, setLoadedChunkIndexes] = useState<Map<string, number[]>>(new Map());

  // KB (laws) search state
  const [kbResults, setKbResults] = useState<KBSearchResult[]>([]);
  const [isKbSearching, setIsKbSearching] = useState(false);
  const [kbError, setKbError] = useState<string | null>(null);
  const [expandedKbDocs, setExpandedKbDocs] = useState<Set<string>>(new Set());

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

  const searchKBLaws = async (q: string) => {
    if (!q.trim()) return;
    setIsKbSearching(true);
    setKbError(null);
    try {
      const { data, error } = await supabase.rpc("search_knowledge_base", {
        search_query: q,
        result_limit: 20,
      });
      if (error) throw error;
      setKbResults((data as KBSearchResult[]) || []);
    } catch (err) {
      setKbError(err instanceof Error ? err.message : "Search failed");
      setKbResults([]);
    } finally {
      setIsKbSearching(false);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    if (activeTab === "practice") {
      await searchPractice(query, category === "all" ? null : category);
    } else {
      await searchKBLaws(query);
    }
  };

  const handleSearchBoth = async () => {
    if (!query.trim()) return;
    // Search both in parallel
    await Promise.all([
      searchPractice(query, category === "all" ? null : category),
      searchKBLaws(query),
    ]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearchBoth();
    }
  };

  const toggleDocExpanded = (docId: string) => {
    setExpandedDocs((prev) => {
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
    setKbError(null);
    setExpandedKbDocs(new Set());
  };

  const isAnySearching = isSearching || isKbSearching;
  const hasAnyResults = documents.length > 0 || kbResults.length > 0;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4" />
          {"\u0548\u0580\u0578\u0576\u0578\u0582\u0574 \u056B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0562\u0561\u0566\u0561\u0575\u0578\u0582\u0574"}
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
          <Button onClick={handleSearchBoth} disabled={isAnySearching} size="sm" className="h-9">
            {isAnySearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "\u0548\u0580\u0578\u0576\u0565\u056C"}
          </Button>
        </div>

        {/* Tabs for results */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "practice" | "laws")} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full grid grid-cols-2 h-9">
            <TabsTrigger value="practice" className="text-xs flex items-center gap-1.5">
              <Gavel className="h-3.5 w-3.5" />
              {"\u0534\u0561\u057F\u0561\u056F\u0561\u0576 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561"}
              {documents.length > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0 ml-1">{documents.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="laws" className="text-xs flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              {"\u0555\u0580\u0565\u0576\u057D\u0564\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576"}
              {kbResults.length > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0 ml-1">{kbResults.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Practice results */}
          <TabsContent value="practice" className="flex-1 overflow-hidden mt-2">
            {searchError && (
              <Alert variant="destructive" className="py-2 mb-2">
                <AlertDescription className="text-xs">{searchError}</AlertDescription>
              </Alert>
            )}
            <ScrollArea className="h-full">
              <div className="space-y-2">
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
                {documents.length === 0 && !isSearching && query && (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    {"\u0531\u0580\u0564\u0575\u0578\u0582\u0576\u0584\u0576\u0565\u0580 \u0579\u0565\u0576 \u0563\u057F\u0576\u057E\u0565\u056C"}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Laws / KB results */}
          <TabsContent value="laws" className="flex-1 overflow-hidden mt-2">
            {kbError && (
              <Alert variant="destructive" className="py-2 mb-2">
                <AlertDescription className="text-xs">{kbError}</AlertDescription>
              </Alert>
            )}
            <ScrollArea className="h-full">
              <div className="space-y-2">
                {kbResults.map((result) => (
                  <KBLawCard
                    key={result.id}
                    result={result}
                    isExpanded={expandedKbDocs.has(result.id)}
                    onToggle={() => {
                      setExpandedKbDocs((prev) => {
                        const next = new Set(prev);
                        next.has(result.id) ? next.delete(result.id) : next.add(result.id);
                        return next;
                      });
                    }}
                    onInsertReference={onInsertReference}
                  />
                ))}
                {kbResults.length === 0 && !isKbSearching && query && (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    {"\u0531\u0580\u0564\u0575\u0578\u0582\u0576\u0584\u0576\u0565\u0580 \u0579\u0565\u0576 \u0563\u057F\u0576\u057E\u0565\u056C"}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

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
  isExpanded: boolean;
  onToggle: () => void;
  onInsertReference?: (docId: string, chunkIndex: number, text: string) => void;
}

function KBLawCard({ result, isExpanded, onToggle, onInsertReference }: KBLawCardProps) {
  const previewLength = 400;
  const needsExpand = result.content_text.length > previewLength;
  const displayText = isExpanded ? result.content_text : result.content_text.substring(0, previewLength);

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
                <span className="font-medium text-sm truncate">{result.title}</span>
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
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3 space-y-2">
          <div className="border rounded p-2 bg-secondary/30 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-primary">
                {"\u053B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0576\u0578\u0580\u0574 (KB)"}
              </span>
            </div>
            <div className="text-xs text-foreground/80 whitespace-pre-wrap">
              {displayText}
              {needsExpand && !isExpanded && "..."}
            </div>
            <div className="flex items-center gap-2">
              {needsExpand && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={(e) => { e.stopPropagation(); onToggle(); }}
                >
                  {isExpanded ? "\u053F\u0580\u0573\u0565\u056C" : "\u0538\u0576\u0564\u056C\u0561\u0575\u0576\u0565\u056C"}
                </Button>
              )}
              {onInsertReference && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2 text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onInsertReference(result.id, 0, result.content_text.substring(0, 2000));
                  }}
                >
                  {"\u054F\u0565\u0572\u0561\u0564\u0580\u0565\u056C \u0578\u0580\u057A\u0565\u057D KB \u0570\u0572\u0578\u0582\u0574"}
                </Button>
              )}
            </div>
          </div>
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
                      {document.decision_map.legal_question}
                    </div>
                  )}
                  {document.decision_map.holding && (
                    <div>
                      <span className="font-medium">{"\u0534\u056B\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574"}:</span>{" "}
                      {document.decision_map.holding}
                    </div>
                  )}
                  {document.decision_map.tests_or_criteria && (
                    <div>
                      <span className="font-medium">{"\u0539\u0565\u057D\u057F\u0565\u0580/\u0579\u0561\u0583\u0561\u0576\u056B\u0577\u0576\u0565\u0580"}:</span>{" "}
                      {document.decision_map.tests_or_criteria}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {document.top_chunks.length > 0 && (
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
          )}

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
  const [isExpanded, setIsExpanded] = useState(false);
  const previewLength = 300;
  const needsExpand = text.length > previewLength;
  const displayText = isExpanded ? text : text.substring(0, previewLength);

  return (
    <div className="border rounded p-2 bg-secondary/30 space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-primary">
          {"\u0531\u0576\u0561\u056C\u0578\u0563 \u0564\u0561\u057F\u0561\u056F\u0561\u0576 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561 (KB)"}
        </span>
        <span className="text-muted-foreground">
          Chunk: {chunkIndex + 1}/{totalChunks}
        </span>
      </div>
      <div className="text-xs text-foreground/80 whitespace-pre-wrap">
        {displayText}
        {needsExpand && !isExpanded && "..."}
      </div>
      <div className="flex items-center gap-2">
        {needsExpand && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? "\u053F\u0580\u0573\u0565\u056C" : "\u0538\u0576\u0564\u056C\u0561\u0575\u0576\u0565\u056C"}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs px-2 text-primary"
          onClick={() => onInsertReference(docId, chunkIndex, text)}
        >
          {"\u054F\u0565\u0572\u0561\u0564\u0580\u0565\u056C \u0578\u0580\u057A\u0565\u057D KB \u0570\u0572\u0578\u0582\u0574"}
        </Button>
      </div>
    </div>
  );
}
