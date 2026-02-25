import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Loader2, Layers, RotateCcw, BarChart3, AlertTriangle, Database,
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
      // Worker is kicked automatically by enqueue + cron runs every 2 min
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
        <Button size="sm" onClick={enqueueChunks}>
          {t("enqueue_missing_chunks")}
        </Button>
        <Button size="sm" onClick={enqueueEmbeddings}>
          {t("enqueue_missing_embeddings")}
        </Button>
        {(diag?.jobs.dead_letter ?? 0) > 0 && (
          <Button size="sm" variant="outline" onClick={resetDeadLetters}>
            <RotateCcw className="mr-1 h-3 w-3" /> {t("reset_dead_letters")}
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        ⚡ Worker runs automatically every 2 minutes via cron. After enqueue, processing starts immediately.
      </p>
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
