/**
 * EchrImportWizard — Bulk import ECHR cases (JSON/JSONL) with automatic
 * Armenian translation of text, summary, facts, judgment fields.
 * Supports multiple files selection.
 */
import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  FileJson, Loader2, CheckCircle, AlertTriangle, Upload, Download, Globe, X, Files,
} from "lucide-react";

interface EchrImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type Status = "idle" | "parsing" | "translating" | "success" | "error";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ParsedCase = Record<string, any>;

interface ImportStats {
  total: number;
  processed: number;
  translated: number;
  partial: number;
  errors: number;
  parseSkipped: number;
}

interface FileEntry {
  name: string;
  cases: ParsedCase[];
  skipped: number;
}

const PRACTICE_CATEGORIES = [
  { value: "echr", label: "ՄԻԵԴ" },
  { value: "criminal", label: "Քրեական" },
  { value: "civil", label: "Քաղաքացիական" },
  { value: "administrative", label: "Վարչական" },
  { value: "constitutional", label: "Սահمانадporitakan" },
];

// Client-side parser: JSON array or JSONL
function parseRaw(text: string): { cases: ParsedCase[]; skipped: number } {
  const trimmed = text.trim();
  let cases: ParsedCase[] = [];
  let skipped = 0;

  // Try JSON array first
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        // Filter only objects (proper case records), skip primitives
        const objects = arr.filter((x) => x && typeof x === "object" && !Array.isArray(x));
        if (objects.length > 0) {
          cases = objects;
          // Count skipped primitives
          skipped = arr.length - objects.length;
          return { cases, skipped };
        }
        // If array of arrays — each sub-array might be a row; skip
        // If array of primitives — fall through to JSONL
      }
    } catch { /* fall through to JSONL */ }
  }

  // Try as JSONL (one JSON object per line)
  if (cases.length === 0) {
    for (const line of trimmed.split("\n")) {
      const l = line.trim();
      if (!l) continue;
      try {
        const parsed = JSON.parse(l);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          cases.push(parsed);
        } else {
          skipped++;
        }
      } catch { skipped++; }
    }
  }

  return { cases, skipped };
}

export function EchrImportWizard({ open, onOpenChange, onSuccess }: EchrImportWizardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);

  const [status, setStatus] = useState<Status>("idle");
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);
  const [parsedCases, setParsedCases] = useState<ParsedCase[]>([]);
  const [parseSkipped, setParseSkipped] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Import options
  const [storeInHyFields, setStoreInHyFields] = useState(true);
  const [generateJsonl, setGenerateJsonl] = useState(true);
  const [practiceCategory, setPracticeCategory] = useState("echr");
  const BATCH_SIZE = 1;

  // Progress
  const [stats, setStats] = useState<ImportStats>({
    total: 0, processed: 0, translated: 0, partial: 0, errors: 0, parseSkipped: 0,
  });

  // Collected JSONL content for download
  const jsonlLinesRef = useRef<string[]>([]);

  // ── File select (multiple) ────────────────────────────────────
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const invalid = files.filter(f => !f.name.endsWith(".jsonl") && !f.name.endsWith(".json"));
    if (invalid.length > 0) {
      toast.error(`Поддерживаются только .json и .jsonl: ${invalid.map(f => f.name).join(", ")}`);
      return;
    }

    setStatus("parsing");
    setError(null);

    const entries: FileEntry[] = [];
    let totalSkipped = 0;

    for (const file of files) {
      try {
        const text = await file.text();
        const { cases, skipped } = parseRaw(text);
        entries.push({ name: file.name, cases, skipped });
        totalSkipped += skipped;
      } catch {
        entries.push({ name: file.name, cases: [], skipped: 0 });
      }
    }

    setFileEntries(entries);
    const allCases = entries.flatMap(e => e.cases);
    setParsedCases(allCases);
    setParseSkipped(totalSkipped);
    setStatus("idle");

    toast.success(
      `${files.length} ֆայлер — ${allCases.length.toLocaleString()} գործ` +
      (totalSkipped > 0 ? ` (${totalSkipped} բаcк թողац)` : "")
    );

    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // ── Helper: extract error message ─────────────────────────────
  const extractErrMsg = (err: unknown): string => {
    if (!err || typeof err !== "object") return String(err);
    const e = err as Record<string, unknown>;
    const ctx = e.context as Record<string, unknown> | undefined;
    if (ctx?.body) {
      const b = ctx.body;
      if (typeof b === "object" && b !== null) {
        const bo = b as Record<string, unknown>;
        if (typeof bo.error === "string") return bo.error;
        if (typeof bo.message === "string") return bo.message;
      }
      if (typeof b === "string") {
        try { const p = JSON.parse(b); return p?.error || p?.message || b; } catch { return b; }
      }
    }
    return typeof e.message === "string" ? e.message : "Unknown error";
  };

  // ── Start import ──────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    if (parsedCases.length === 0) return;

    setStatus("translating");
    abortRef.current = false;
    jsonlLinesRef.current = [];

    const total = parsedCases.length;
    let processed = 0;
    let translated = 0;
    let partial = 0;
    let importErrors = 0;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;

    setStats({ total, processed: 0, translated: 0, partial: 0, errors: 0, parseSkipped });

    for (let batchIdx = 0; batchIdx < total; batchIdx += BATCH_SIZE) {
      if (abortRef.current) break;
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        toast.error(`Կанг — ${consecutiveErrors} ченд. сх. Проверьте консоль.`);
        break;
      }

      let batchOk = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (abortRef.current) break;
        try {
          const batchCases = parsedCases.slice(batchIdx, batchIdx + BATCH_SIZE);
          const { data, error: fnErr } = await supabase.functions.invoke("echr-import", {
            body: {
              rawContent: batchCases, // send as array directly, not stringified
              storeInHyFields,
              generateJsonl,
              practiceCategory,
            },
          });

          if (fnErr) {
            const msg = extractErrMsg(fnErr);
            console.error(`Batch ${batchIdx} attempt ${attempt + 1} error:`, msg);
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
              continue;
            }
            throw new Error(msg);
          }
          if (data?.error) throw new Error(data.error);

          processed += data.batchProcessed ?? BATCH_SIZE;
          translated += data.translated ?? 0;
          partial += data.partial ?? 0;
          importErrors += data.errors ?? 0;

          if (data.jsonlContent) {
            jsonlLinesRef.current.push(data.jsonlContent);
          }

          consecutiveErrors = 0;
          batchOk = true;
          setStats({ total, processed, translated, partial, errors: importErrors, parseSkipped });
          break;
        } catch (err) {
          console.error(`Batch ${batchIdx} final error:`, err);
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
          }
        }
      }

      if (!batchOk) {
        consecutiveErrors++;
        importErrors += BATCH_SIZE;
        processed += BATCH_SIZE;
        setStats({ total, processed, translated, partial, errors: importErrors, parseSkipped });
      }

      await new Promise((r) => setTimeout(r, 300));
    }

    setStatus("success");
    toast.success(`Ներмуծum avar — ${translated} Targ.`);
    onSuccess();
  }, [parsedCases, storeInHyFields, generateJsonl, practiceCategory, parseSkipped, onSuccess]);

  // ── Download JSONL ────────────────────────────────────────────
  const downloadJsonl = useCallback(() => {
    const content = jsonlLinesRef.current.join("\n");
    if (!content) return;
    const blob = new Blob([content], { type: "application/jsonl" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "echr_cases_hy.jsonl";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleAbort = useCallback(() => {
    abortRef.current = true;
    setStatus("idle");
    toast.info("Ընдhатvel е");
  }, []);

  const handleClose = useCallback(() => {
    abortRef.current = true;
    setStatus("idle");
    setFileEntries([]);
    setParsedCases([]);
    setParseSkipped(0);
    setError(null);
    setStats({ total: 0, processed: 0, translated: 0, partial: 0, errors: 0, parseSkipped: 0 });
    jsonlLinesRef.current = [];
    onOpenChange(false);
  }, [onOpenChange]);

  const progressPct = stats.total > 0
    ? Math.round((stats.processed / stats.total) * 100)
    : 0;

  const isRunning = status === "translating" || status === "parsing";
  const totalCases = parsedCases.length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            ECHR Массовый импорт — Հայ Թарг.
          </DialogTitle>
          <DialogDescription>
            Выберите один или несколько .json / .jsonl файлов. Импорт с переводом на армянский язык.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* File selector — multiple */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Files className="h-4 w-4" />
              ECHR ֆayleri (.json / .jsonl) — կareli e yntel mi qani
            </Label>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".json,.jsonl"
              multiple
              onChange={handleFileSelect}
              disabled={isRunning}
            />

            {/* File list */}
            {fileEntries.length > 0 && (
              <div className="rounded-lg border bg-muted/30 p-2 space-y-1">
                {fileEntries.map((fe, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <FileJson className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate flex-1 text-muted-foreground max-w-[260px]">{fe.name}</span>
                    <Badge variant="secondary" className="text-xs">{fe.cases.length.toLocaleString()} գործ</Badge>
                    {fe.skipped > 0 && (
                      <Badge variant="destructive" className="text-[10px]">{fe.skipped} skip</Badge>
                    )}
                  </div>
                ))}
                <p className="text-xs font-semibold text-primary pt-1 border-t mt-1">
                  Ընдамenы: {totalCases.toLocaleString()} գործ · {fileEntries.length} ֆayleri
                </p>
              </div>
            )}
          </div>

          {/* Preview */}
          {parsedCases.length > 0 && status === "idle" && (
            <div className="space-y-2">
              <Label className="text-xs">Нахат. (ara jna 3)</Label>
              <ScrollArea className="h-36 rounded-lg border">
                <div className="p-2 space-y-2">
                  {parsedCases.slice(0, 3).map((c, i) => (
                    <div key={i} className="rounded border bg-muted/40 p-2 text-xs">
                      <p className="font-medium truncate">
                        {c.docname || c.title || `Case ${i + 1}`}
                      </p>
                      <p className="text-muted-foreground truncate">
                        {c.itemid || c.application_no || c.appno || "—"}
                        {c.respondent ? ` · ${c.respondent}` : ""}
                      </p>
                      {c.summary && (
                        <p className="line-clamp-2 text-[10px] mt-0.5 text-muted-foreground">
                          {String(c.summary).slice(0, 120)}
                          {String(c.summary).length > 120 ? "…" : ""}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Options */}
          {parsedCases.length > 0 && (
            <div className="space-y-3">
              {/* Category */}
              <div className="space-y-1.5">
                <Label className="text-xs">Категория</Label>
                <Select value={practiceCategory} onValueChange={setPracticeCategory} disabled={isRunning}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRACTICE_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Store HY toggle */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Сохр. перев. в *_hy полях (text_hy, summary_hy...)</p>
                  <p className="text-xs text-muted-foreground">Оригинал останется без изменений</p>
                </div>
                <Switch
                  checked={storeInHyFields}
                  onCheckedChange={setStoreInHyFields}
                  disabled={isRunning}
                />
              </div>

              {!storeInHyFields && (
                <div className="rounded-lg border border-warning bg-warning/10 p-3">
                  <p className="text-xs text-foreground flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Внимание: оригинальные поля будут перезаписаны: text, summary, facts, judgment
                  </p>
                </div>
              )}

              {/* Generate JSONL toggle */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">JSONL экспорт (echr_cases_hy.jsonl)</p>
                  <p className="text-xs text-muted-foreground">1 строка = 1 дело</p>
                </div>
                <Switch
                  checked={generateJsonl}
                  onCheckedChange={setGenerateJsonl}
                  disabled={isRunning}
                />
              </div>
            </div>
          )}

          {/* Progress */}
          {(status === "translating" || (status === "success" && stats.total > 0)) && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {status === "translating" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-primary" />
                )}
                <span className="text-sm font-medium">
                  {status === "translating"
                    ? `Переводит... ${stats.processed}/${stats.total}`
                    : `Завершено — ${stats.processed}/${stats.total}`}
                </span>
                <Badge variant="outline" className="ml-auto">{progressPct}%</Badge>
              </div>
              <Progress value={progressPct} className="h-2" />

              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded border bg-primary/10 p-2">
                  <p className="font-mono font-bold text-primary">{stats.translated}</p>
                  <p className="text-muted-foreground">Переведено</p>
                </div>
                <div className="rounded border bg-secondary p-2">
                  <p className="font-mono font-bold">{stats.partial}</p>
                  <p className="text-muted-foreground">Частично</p>
                </div>
                <div className="rounded border bg-destructive/10 p-2">
                  <p className="font-mono font-bold text-destructive">{stats.errors}</p>
                  <p className="text-muted-foreground">Ошибки</p>
                </div>
                <div className="rounded border bg-muted p-2">
                  <p className="font-mono font-bold">{stats.parseSkipped}</p>
                  <p className="text-muted-foreground">Пропущено</p>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {status === "error" && error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive bg-destructive/10 p-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {status === "idle" && parsedCases.length > 0 && (
              <Button onClick={handleImport} className="flex-1">
                <Upload className="mr-2 h-4 w-4" />
                Импортировать + Перевести {totalCases.toLocaleString()} дел
              </Button>
            )}

            {status === "translating" && (
              <Button variant="outline" onClick={handleAbort} className="flex-1">
                <X className="mr-2 h-4 w-4" />
                Остановить
              </Button>
            )}

            {status === "success" && generateJsonl && jsonlLinesRef.current.length > 0 && (
              <Button onClick={downloadJsonl} variant="outline" className="flex-1">
                <Download className="mr-2 h-4 w-4" />
                Скачать echr_cases_hy.jsonl
              </Button>
            )}

            {status === "success" && (
              <Button onClick={handleClose}>
                <CheckCircle className="mr-2 h-4 w-4" />
                Закрыть
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
