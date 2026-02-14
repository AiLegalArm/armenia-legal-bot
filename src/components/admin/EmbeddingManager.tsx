import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { runBatchEmbedding } from "@/lib/batchEmbedding";
import { Loader2, Zap, Database, BookOpen, AlertTriangle, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type TableStats = {
  success: number;
  pending: number;
  failed: number;
  deadLetter: number;
  running: boolean;
  processed: number;
};

const emptyStats = (): TableStats => ({
  success: 0, pending: 0, failed: 0, deadLetter: 0, running: false, processed: 0,
});

export function EmbeddingManager() {
  const [kbStats, setKbStats] = useState<TableStats>(emptyStats());
  const [practiceStats, setPracticeStats] = useState<TableStats>(emptyStats());
  const [errors, setErrors] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const safeSetKb = useCallback((fn: (prev: TableStats) => TableStats) => {
    if (mountedRef.current) setKbStats(fn);
  }, []);
  const safeSetPractice = useCallback((fn: (prev: TableStats) => TableStats) => {
    if (mountedRef.current) setPracticeStats(fn);
  }, []);
  const safeSetErrors = useCallback((fn: (prev: string[]) => string[]) => {
    if (mountedRef.current) setErrors(fn);
  }, []);

  const loadStats = async () => {
    const tables = ["knowledge_base", "legal_practice_kb"] as const;
    const setters = [setKbStats, setPracticeStats];

    for (let i = 0; i < tables.length; i++) {
      const t = tables[i];
      const [successRes, pendingRes, failedRes, deadRes] = await Promise.all([
        supabase.from(t).select("id", { count: "exact", head: true }).eq("is_active", true).eq("embedding_status", "success"),
        supabase.from(t).select("id", { count: "exact", head: true }).eq("is_active", true).eq("embedding_status", "pending"),
        supabase.from(t).select("id", { count: "exact", head: true }).eq("is_active", true).eq("embedding_status", "failed").lt("embedding_attempts", 5),
        supabase.from(t).select("id", { count: "exact", head: true }).eq("is_active", true).eq("embedding_status", "failed").gte("embedding_attempts", 5),
      ]);
      const setter = i === 0 ? safeSetKb : safeSetPractice;
      setter(prev => ({
        ...prev,
        success: successRes.count || 0,
        pending: pendingRes.count || 0,
        failed: failedRes.count || 0,
        deadLetter: deadRes.count || 0,
      }));
    }
  };

  useEffect(() => { loadStats(); }, []);

  const runEmbeddings = async (table: "knowledge_base" | "legal_practice_kb") => {
    const setStats = table === "knowledge_base" ? safeSetKb : safeSetPractice;
    setStats(p => ({ ...p, running: true, processed: 0 }));
    safeSetErrors(() => []);

    abortRef.current = new AbortController();

    try {
      const result = await runBatchEmbedding({
        table,
        batchLimit: 5,
        signal: abortRef.current.signal,
        onProgress: (p) => {
          setStats(prev => ({
            ...prev,
            processed: p.processedDocs,
            pending: p.totalRemaining,
            deadLetter: p.deadLetterCount || prev.deadLetter,
            running: true,
          }));
          if (p.errors) safeSetErrors(prev => [...new Set([...prev, ...p.errors!])]);
        },
      });

      setStats(p => ({ ...p, running: false, success: p.success + result.processedDocs }));
      toast.success(`Processed ${result.processedDocs} docs. Remaining: ${result.totalRemaining}. Dead-letter: ${result.deadLetterCount || 0}`);
      loadStats();
    } catch (e) {
      setStats(p => ({ ...p, running: false }));
      toast.error(e instanceof Error ? e.message : "Embedding generation error");
    }
  };

  const retryDeadLetters = async (table: "knowledge_base" | "legal_practice_kb") => {
    const { error } = await supabase
      .from(table)
      .update({ embedding_status: "pending" as string, embedding_attempts: 0, embedding_error: null } as Record<string, unknown>)
      .eq("is_active", true)
      .eq("embedding_status", "failed")
      .gte("embedding_attempts", 5);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Dead-letter docs reset to pending");
      loadStats();
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    safeSetKb(p => ({ ...p, running: false }));
    safeSetPractice(p => ({ ...p, running: false }));
  };

  const isRunning = kbStats.running || practiceStats.running;

  const renderSection = (
    label: string,
    icon: React.ReactNode,
    stats: TableStats,
    table: "knowledge_base" | "legal_practice_kb"
  ) => (
    <div className="space-y-2 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium">{label}</span>
        </div>
        <Button size="sm" onClick={() => runEmbeddings(table)} disabled={isRunning}>
          {stats.running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          {stats.running ? "Processing..." : "Run"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          {"\u2713"} {stats.success}
        </Badge>
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
          Pending: {stats.pending}
        </Badge>
        {stats.failed > 0 && (
          <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
            Retrying: {stats.failed}
          </Badge>
        )}
        {stats.deadLetter > 0 && (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Dead-letter: {stats.deadLetter}
          </Badge>
        )}
      </div>

      {stats.deadLetter > 0 && (
        <Button variant="outline" size="sm" className="text-xs" onClick={() => retryDeadLetters(table)}>
          <RotateCcw className="mr-1 h-3 w-3" /> Reset dead-letters
        </Button>
      )}

      {stats.running && (
        <div className="space-y-1">
          <Progress value={stats.pending > 0 ? (stats.processed / (stats.processed + stats.pending)) * 100 : 0} />
          <p className="text-xs text-muted-foreground">
            Processed: {stats.processed} | Remaining: {stats.pending}
          </p>
        </div>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Vector Embeddings (Semantic Search)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Generate embeddings for AI-powered semantic document search. Failed docs are retried with exponential backoff up to 5 attempts before being dead-lettered.
        </p>

        {renderSection("Knowledge Base", <Database className="h-4 w-4" />, kbStats, "knowledge_base")}
        {renderSection("Legal Practice", <BookOpen className="h-4 w-4" />, practiceStats, "legal_practice_kb")}

        {isRunning && (
          <Button variant="destructive" size="sm" onClick={stop}>
            Stop
          </Button>
        )}

        {errors.length > 0 && (
          <div className="max-h-32 overflow-auto rounded border border-destructive/30 bg-destructive/5 p-2 text-xs">
            {errors.slice(-10).map((e, i) => (
              <div key={i} className={e.includes("[DEAD-LETTER]") ? "font-bold text-destructive" : ""}>
                {e}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
