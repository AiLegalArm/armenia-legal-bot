import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Loader2, Layers, Play, Square, RotateCcw, BarChart3, AlertTriangle, Database,
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

type SourceTable = "legal_practice_kb" | "knowledge_base";

function PipelineSection({ source }: { source: SourceTable }) {
  const { t } = useTranslation("admin");
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
        body: { action: "diagnostics", source_table: source },
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
        body: { action: "enqueue_missing_chunks", source_table: source },
      });
      if (error) throw error;
      toast.success(`${t("enqueue_missing_chunks")}: ${data.enqueued}`);
      loadDiagnostics();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enqueue failed");
    }
  };

  const enqueueEmbeddings = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("practice-chunk-enqueue", {
        body: { action: "enqueue_missing_embeddings", source_table: source },
      });
      if (error) throw error;
      toast.success(`${t("enqueue_missing_embeddings")}: ${data.reset}`);
      loadDiagnostics();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enqueue failed");
    }
  };

  const resetDeadLetters = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("practice-chunk-enqueue", {
        body: { action: "reset_dead_letters", source_table: source },
      });
      if (error) throw error;
      toast.success(t("reset_dead_letters"));
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
          body: { concurrency_docs: 2, source_table: source },
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

      toast.success(`${t("progress_processed", { processed: totalProcessed })} | ${t("progress_chunks", { chunks: totalChunks })}`);
      loadDiagnostics();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Worker error");
    } finally {
      if (mountedRef.current) setRunning(false);
    }
  }, [source]);

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
    <div className="space-y-4">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("loading_diagnostics")}
        </div>
      ) : diag ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">{t("docs")}: {diag.total_docs.toLocaleString()}</Badge>
            <Badge variant="secondary">{t("chunks")}: {diag.total_chunks.toLocaleString()}</Badge>
            <Badge variant="secondary">
              {t("avg_chunks_per_doc", { value: diag.avg_chunks_per_doc?.toFixed(1) ?? "N/A" })}
            </Badge>
            <Badge variant={coveragePct >= 95 ? "secondary" : "destructive"}>
              {t("coverage", { value: coveragePct })}
            </Badge>
          </div>

          {(diag.docs_without_chunks ?? 0) > 0 && (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertTriangle className="h-3 w-3" />
              {t("docs_without_chunks", { count: diag.docs_without_chunks ?? 0 } as Record<string, unknown>)}
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">{t("jobs_pending", { count: diag.jobs.pending })}</Badge>
            <Badge variant="outline">{t("jobs_processing", { count: diag.jobs.processing })}</Badge>
            <Badge variant="outline">{t("jobs_done", { count: diag.jobs.done })}</Badge>
            {diag.jobs.failed > 0 && <Badge variant="outline">{t("jobs_failed", { count: diag.jobs.failed })}</Badge>}
            {diag.jobs.dead_letter > 0 && <Badge variant="destructive">{t("jobs_dead", { count: diag.jobs.dead_letter })}</Badge>}
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">{t("emb_pending", { count: diag.embedding_pending })}</Badge>
            {diag.embedding_failed > 0 && (
              <Badge variant="outline">{t("emb_failed", { count: diag.embedding_failed })}</Badge>
            )}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={loadDiagnostics} disabled={loading}>
          <BarChart3 className="mr-1 h-4 w-4" /> {t("refresh")}
        </Button>
        <Button size="sm" onClick={enqueueChunks} disabled={running}>
          {t("enqueue_missing_chunks")}
        </Button>
        <Button size="sm" onClick={enqueueEmbeddings} disabled={running}>
          {t("enqueue_missing_embeddings")}
        </Button>
        {(diag?.jobs.dead_letter ?? 0) > 0 && (
          <Button size="sm" variant="outline" onClick={resetDeadLetters}>
            <RotateCcw className="mr-1 h-3 w-3" /> {t("reset_dead_letters")}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={runWorker} disabled={running}>
          {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
          {running ? t("processing_worker") : t("run_worker")}
        </Button>
        {running && (
          <Button size="sm" variant="destructive" onClick={stop}>
            <Square className="mr-1 h-4 w-4" /> {t("stop")}
          </Button>
        )}
      </div>

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
            {t("progress_processed", { processed: progress.processed })} | {t("progress_chunks", { chunks: progress.chunks })} | {t("progress_remaining", { remaining: progress.remaining })}
          </p>
        </div>
      )}
    </div>
  );
}

export function PracticeChunkManager() {
  const { t } = useTranslation("admin");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5" />
          {t("chunk_pipeline")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("chunk_pipeline_desc")}</p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="knowledge_base">
          <TabsList className="mb-4">
            <TabsTrigger value="knowledge_base" className="gap-1">
              <Database className="h-3.5 w-3.5" />
              {t("knowledge_base")} 
            </TabsTrigger>
            <TabsTrigger value="legal_practice_kb" className="gap-1">
              <Layers className="h-3.5 w-3.5" />
              {t("legal_practice")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="knowledge_base">
            <PipelineSection source="knowledge_base" />
          </TabsContent>
          <TabsContent value="legal_practice_kb">
            <PipelineSection source="legal_practice_kb" />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
