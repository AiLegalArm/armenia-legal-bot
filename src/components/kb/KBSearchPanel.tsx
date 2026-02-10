import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, FileText, ChevronDown, ChevronRight, Loader2, Scale, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useLegalPracticeKB, type KBDocument, type PracticeCategory } from "@/hooks/useLegalPracticeKB";

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

interface KBSearchPanelProps {
  onInsertReference?: (docId: string, chunkIndex: number, text: string) => void;
}

export function KBSearchPanel({ onInsertReference }: KBSearchPanelProps) {
  const { t } = useTranslation("kb");
  const [query, setQuery] = useState("");
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
    searchKB,
    clearSearch,
  } = useLegalPracticeKB();

  const handleSearch = async () => {
    if (!query.trim()) return;
    await searchKB(query, category === "all" ? null : category);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const toggleDocExpanded = (docId: string) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
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
        const current = next.get(doc.id) || [];
        next.set(doc.id, [...current, nextIndex]);
        return next;
      });
    }
  };

  const handleInsertReference = (docId: string, chunkIndex: number, text: string) => {
    if (onInsertReference) {
      onInsertReference(docId, chunkIndex, text);
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4" />
          {"\u0531\u0576\u0561\u056C\u0578\u0563 \u0564\u0561\u057F\u0561\u056F\u0561\u0576 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561 (KB)"}
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
              placeholder={"\u0548\u0580\u0578\u0576\u0565\u056C \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561\u0575\u056B \u0562\u0561\u0566\u0561\u0575\u0578\u0582\u0574..."}
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
              <SelectItem value="criminal">{"\u0554\u0580\u0565\u0561\u056F\u0561\u0576"}</SelectItem>
              <SelectItem value="civil">{"\u0554\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576"}</SelectItem>
              <SelectItem value="administrative">{"\u054E\u0561\u0580\u0579\u0561\u056F\u0561\u0576"}</SelectItem>
              <SelectItem value="echr">{"\u0544\u053B\u0535\u0534"}</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleSearch} disabled={isSearching} size="sm" className="h-9">
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "\u0548\u0580\u0578\u0576\u0565\u056C"}
          </Button>
        </div>

        {/* Error display */}
        {searchError && (
          <Alert variant="destructive" className="py-2">
            <AlertDescription className="text-xs">{searchError}</AlertDescription>
          </Alert>
        )}

        {/* Results */}
        <ScrollArea className="flex-1">
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

        {documents.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearSearch} className="text-xs">
            {"\u0544\u0561\u0584\u0580\u0565\u056C \u0561\u0580\u0564\u0575\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u0568"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

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
      {/* Header */}
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
                <span className="text-xs text-muted-foreground">
                  DocID: {document.id.substring(0, 8)}...
                </span>
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3 space-y-3">
          {/* Decision Map buttons */}
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

          {/* Top chunks from search */}
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

          {/* Loaded additional chunks */}
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

          {/* Load more button */}
          {hasMoreChunks && (
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs"
              onClick={onLoadNextChunk}
              disabled={isLoadingChunk}
            >
              {isLoadingChunk ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : null}
              {"\u0532\u0561\u0581\u0565\u056C \u0570\u0561\u057B\u0578\u0580\u0564 \u0570\u0561\u057F\u057E\u0561\u056E\u0568"}
            </Button>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

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
          DocID: {docId.substring(0, 8)}... | Chunk: {chunkIndex + 1}/{totalChunks}
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
