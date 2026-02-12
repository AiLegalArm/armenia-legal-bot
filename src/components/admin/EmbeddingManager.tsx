import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { runBatchEmbedding } from "@/lib/batchEmbedding";
import { Loader2, Zap, Database, BookOpen } from "lucide-react";

export function EmbeddingManager() {
  const { t } = useTranslation(["admin"]);
  const [kbProgress, setKbProgress] = useState({ processed: 0, remaining: 0, running: false, alreadyDone: 0 });
  const [practiceProgress, setPracticeProgress] = useState({ processed: 0, remaining: 0, running: false, alreadyDone: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Check how many already have embeddings
  const checkExisting = async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const [kbDone, kbRemaining, prDone, prRemaining] = await Promise.all([
      supabase.from("knowledge_base").select("id", { count: "exact", head: true }).eq("is_active", true).not("embedding", "is", null),
      supabase.from("knowledge_base").select("id", { count: "exact", head: true }).eq("is_active", true).is("embedding", null),
      supabase.from("legal_practice_kb").select("id", { count: "exact", head: true }).eq("is_active", true).not("embedding", "is", null),
      supabase.from("legal_practice_kb").select("id", { count: "exact", head: true }).eq("is_active", true).is("embedding", null),
    ]);
    setKbProgress(p => ({ ...p, alreadyDone: kbDone.count || 0, remaining: kbRemaining.count || 0 }));
    setPracticeProgress(p => ({ ...p, alreadyDone: prDone.count || 0, remaining: prRemaining.count || 0 }));
  };

  // Load stats on mount
  useState(() => { checkExisting(); });

  const runEmbeddings = async (table: "knowledge_base" | "legal_practice_kb") => {
    const setProgress = table === "knowledge_base" ? setKbProgress : setPracticeProgress;
    setProgress(p => ({ ...p, running: true, processed: 0 }));
    setErrors([]);

    abortRef.current = new AbortController();

    try {
      const result = await runBatchEmbedding({
        table,
        batchLimit: 5,
        signal: abortRef.current.signal,
        onProgress: (p) => {
          setProgress(prev => ({ ...prev, processed: p.processedDocs, remaining: p.totalRemaining, running: true }));
          if (p.errors) setErrors(prev => [...new Set([...prev, ...p.errors!])]);
        },
      });

      setProgress(p => ({ ...p, running: false, alreadyDone: p.alreadyDone + result.processedDocs }));
      toast.success(`Обработано ${result.processedDocs} документов. Осталось: ${result.totalRemaining}`);
    } catch (e) {
      setProgress(p => ({ ...p, running: false }));
      toast.error(e instanceof Error ? e.message : "Ошибка генерации эмбеддингов");
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setKbProgress(p => ({ ...p, running: false }));
    setPracticeProgress(p => ({ ...p, running: false }));
  };

  const isRunning = kbProgress.running || practiceProgress.running;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Векторные эмбеддинги (семантический поиск)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Генерация эмбеддингов позволяет ИИ находить документы по смыслу, а не только по ключевым словам.
        </p>

        {/* KB Section */}
        <div className="space-y-2 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              <span className="font-medium">База знаний</span>
            </div>
            <Button
              size="sm"
              onClick={() => runEmbeddings("knowledge_base")}
              disabled={isRunning}
            >
              {kbProgress.running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              {kbProgress.running ? "Обработка..." : "Запустить"}
            </Button>
          </div>
          {kbProgress.running && (
            <div className="space-y-1">
              <Progress value={kbProgress.remaining > 0 ? (kbProgress.processed / (kbProgress.processed + kbProgress.remaining)) * 100 : 0} />
              <p className="text-xs text-muted-foreground">
                Обработано: {kbProgress.processed} | Осталось: {kbProgress.remaining}
              </p>
            </div>
          )}
          {!kbProgress.running && kbProgress.processed > 0 && (
            <Badge variant="secondary">Готово: {kbProgress.processed} документов</Badge>
          )}
        </div>

        {/* Practice Section */}
        <div className="space-y-2 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              <span className="font-medium">Судебная практика</span>
            </div>
            <Button
              size="sm"
              onClick={() => runEmbeddings("legal_practice_kb")}
              disabled={isRunning}
            >
              {practiceProgress.running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              {practiceProgress.running ? "Обработка..." : "Запустить"}
            </Button>
          </div>
          {practiceProgress.running && (
            <div className="space-y-1">
              <Progress value={practiceProgress.remaining > 0 ? (practiceProgress.processed / (practiceProgress.processed + practiceProgress.remaining)) * 100 : 0} />
              <p className="text-xs text-muted-foreground">
                Обработано: {practiceProgress.processed} | Осталось: {practiceProgress.remaining}
              </p>
            </div>
          )}
          {!practiceProgress.running && practiceProgress.processed > 0 && (
            <Badge variant="secondary">Готово: {practiceProgress.processed} документов</Badge>
          )}
        </div>

        {isRunning && (
          <Button variant="destructive" size="sm" onClick={stop}>
            Остановить
          </Button>
        )}

        {errors.length > 0 && (
          <div className="max-h-32 overflow-auto rounded border border-destructive/30 bg-destructive/5 p-2 text-xs">
            {errors.slice(-10).map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
