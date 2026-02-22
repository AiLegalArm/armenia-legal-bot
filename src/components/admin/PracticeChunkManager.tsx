import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2, Layers, Play, Square, RotateCcw, BarChart3, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Diagnostics {
  total_docs: number;
  total_chunks: number;
  docs_without_chunks: number | null;
  avg_chunks_per_doc: number | null;
  embedding_pending: number;
  embedding_failed: number;
  jobs: {
    pending: number;
    processing: number;
    done: number;
    failed: number;
    dead_letter: number;
  };
}

export function PracticeChunkManager() {
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, remaining: 0, chunks: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    loadDiagnostics();
    return () => { mountedRef.current = false; };
  }, []);

  const loadDiagnostics = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("practice-chunk-enqueue", {
        body: { action: "diagnostics" },
      });
      if (error) throw error;
      if (mountedRef.current) setDiag(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load diagnostics");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const enqueueChunks = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("practice-chunk-enqueue", {
        body: { action: "enqueue_missing_chunks" },
      });
      if (error) throw error;
      toast.success(`Enqueued ${data.enqueued} chunk jobs`);
      loadDiagnostics();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enqueue failed");
    }
  };

  const enqueueEmbeddings = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("practice-chunk-enqueue", {
        body: { action: "enqueue_missing_embeddings" },
      });
      if (error) throw error;
      toast.success(`Reset ${data.reset} docs for embedding`);
      loadDiagnostics();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enqueue failed");
    }
  };

  const resetDeadLetters = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("practice-chunk-enqueue", {
        body: { action: "reset_dead_letters" },
      });
      if (error) throw error;
      toast.success("Dead-letter jobs reset to pending");
      loadDiagnostics();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed");
    }
  };

  const runWorker = useCallback(async () => {
    setRunning(true);
    setProgress({ processed: 0, remaining: 0, chunks: 0 });
    abortRef.current = new AbortController();

    let totalProcessed = 0;
    let totalChunks = 0;
    let remaining = Infinity;

    try {
      while (remaining > 0 && !abortRef.current.signal.aborted) {
        const { data, error } = await supabase.functions.invoke("practice-chunk-worker", {
          body: { concurrency_docs: 2 },
        });
        if (error) throw error;

        totalProcessed += data.processed || 0;
        totalChunks += data.total_chunks_inserted || 0;
        remaining = data.remaining || 0;

        if (mountedRef.current) {
          setProgress({ processed: totalProcessed, remaining, chunks: totalChunks });
        }

        if ((data.processed || 0) === 0) break;
      }

      toast.success(`Chunking complete: ${totalProcessed} docs, ${totalChunks} chunks`);
      loadDiagnostics();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Worker error");
    } finally {
      if (mountedRef.current) setRunning(false);
    }
  }, []);

  const stop = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  const coveragePct = diag
    ? diag.total_docs > 0
      ? Math.round(((diag.total_docs - (diag.docs_without_chunks || 0)) / diag.total_docs) * 100)
      : 0
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5" />
          Practice Chunk Pipeline
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Chunk legal practice documents and generate embeddings. Safe to re-run (idempotent).
        </p>

        {/* Diagnostics */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading diagnostics...
          </div>
        ) : diag ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">Docs: {diag.total_docs}</Badge>
              <Badge variant="secondary">Chunks: {diag.total_chunks}</Badge>
              <Badge variant="secondary">
                Avg: {diag.avg_chunks_per_doc?.toFixed(1) ?? "N/A"} chunks/doc
              </Badge>
              <Badge
                variant={coveragePct >= 95 ? "secondary" : "destructive"}
                className={coveragePct >= 95 ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : ""}
              >
                Coverage: {coveragePct}%
              </Badge>
            </div>

            {(diag.docs_without_chunks ?? 0) > 0 && (
              <div className="flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400">
                <AlertTriangle className="h-3 w-3" />
                {diag.docs_without_chunks} docs without chunks
              </div>
            )}

            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">Jobs pending: {diag.jobs.pending}</Badge>
              <Badge variant="outline">Processing: {diag.jobs.processing}</Badge>
              <Badge variant="outline" className="bg-green-50 dark:bg-green-950">Done: {diag.jobs.done}</Badge>
              {diag.jobs.failed > 0 && <Badge variant="outline" className="text-orange-600">Failed: {diag.jobs.failed}</Badge>}
              {diag.jobs.dead_letter > 0 && <Badge variant="destructive">Dead: {diag.jobs.dead_letter}</Badge>}
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">Emb pending: {diag.embedding_pending}</Badge>
              {diag.embedding_failed > 0 && (
                <Badge variant="outline" className="text-orange-600">Emb failed: {diag.embedding_failed}</Badge>
              )}
            </div>
          </div>
        ) : null}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={loadDiagnostics} disabled={loading}>
            <BarChart3 className="mr-1 h-4 w-4" /> Refresh
          </Button>
          <Button size="sm" onClick={enqueueChunks} disabled={running}>
            Enqueue Missing Chunks
          </Button>
          <Button size="sm" onClick={enqueueEmbeddings} disabled={running}>
            Enqueue Missing Embeddings
          </Button>
          {(diag?.jobs.dead_letter ?? 0) > 0 && (
            <Button size="sm" variant="outline" onClick={resetDeadLetters}>
              <RotateCcw className="mr-1 h-3 w-3" /> Reset Dead Letters
            </Button>
          )}
        </div>

        {/* Worker control */}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={runWorker} disabled={running}>
            {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
            {running ? "Processing..." : "Run Worker"}
          </Button>
          {running && (
            <Button size="sm" variant="destructive" onClick={stop}>
              <Square className="mr-1 h-4 w-4" /> Stop
            </Button>
          )}
        </div>

        {/* Progress */}
        {running && (
          <div className="space-y-1">
            <Progress
              value={
                progress.remaining + progress.processed > 0
                  ? (progress.processed / (progress.processed + progress.remaining)) * 100
                  : 0
              }
            />
            <p className="text-xs text-muted-foreground">
              Processed: {progress.processed} | Chunks created: {progress.chunks} | Remaining: {progress.remaining}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
