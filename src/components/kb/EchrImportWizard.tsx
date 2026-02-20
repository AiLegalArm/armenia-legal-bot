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
import { Separator } from "@/components/ui/separator";
import {
  FileJson, Loader2, CheckCircle, AlertTriangle, Upload, Download, Globe, X, Files, Scissors,
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

/**
 * Stream-parse a File using brace-matching to extract top-level JSON objects.
 * Reads the file in 4 MB chunks so it works for files of any size.
 * Calls onCase(obj) for each complete object found.
 */
async function streamParseCases(
  file: File,
  onCase: (obj: ParsedCase) => void,
  onProgress?: (bytesRead: number) => void
): Promise<{ total: number; skipped: number }> {
  const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB per read
  let total = 0;
  let skipped = 0;

  let depth = 0;
  let inString = false;
  let escape = false;
  let objStart = -1;
  let buffer = ""; // accumulate chars of the current object
  let bytesRead = 0;

  const decoder = new TextDecoder("utf-8");

  // Read using FileReader slice → ArrayBuffer for memory efficiency
  async function readSlice(start: number, end: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const slice = file.slice(start, end);
      const reader = new FileReader();
      reader.onload = () => resolve(decoder.decode(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(slice);
    });
  }

  let pos = 0;
  const size = file.size;

  while (pos < size) {
    const end = Math.min(pos + CHUNK_SIZE, size);
    const text = await readSlice(pos, end);
    bytesRead += text.length;
    pos = end;
    if (onProgress) onProgress(bytesRead);

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (escape) { escape = false; if (objStart !== -1) buffer += ch; continue; }
      if (ch === "\\" && inString) { escape = true; if (objStart !== -1) buffer += ch; continue; }
      if (ch === '"') { inString = !inString; if (objStart !== -1) buffer += ch; continue; }
      if (inString) { if (objStart !== -1) buffer += ch; continue; }

      if (ch === "{") {
        if (depth === 0) {
          objStart = i;
          buffer = "{";
        } else {
          buffer += ch;
        }
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0 && objStart !== -1) {
          buffer += "}";
          try {
            const obj = JSON.parse(buffer);
            if (obj && typeof obj === "object" && !Array.isArray(obj)) {
              onCase(obj);
              total++;
            } else {
              skipped++;
            }
          } catch {
            skipped++;
          }
          buffer = "";
          objStart = -1;
        } else if (objStart !== -1) {
          buffer += ch;
        }
      } else if (objStart !== -1) {
        buffer += ch;
      }
    }
  }

  return { total, skipped };
}

/**
 * Extract top-level JSON objects from a string using brace-matching.
 * Used as fallback for small files already loaded into memory.
 */
function extractObjectsByBraceMatch(text: string): { cases: ParsedCase[]; skipped: number } {
  const cases: ParsedCase[] = [];
  const skipped_arr: number[] = [0];
  const total_arr: number[] = [0];

  let depth = 0;
  let inString = false;
  let escape = false;
  let objStart = -1;
  let buffer = "";

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escape) { escape = false; if (objStart !== -1) buffer += ch; continue; }
    if (ch === "\\" && inString) { escape = true; if (objStart !== -1) buffer += ch; continue; }
    if (ch === '"') { inString = !inString; if (objStart !== -1) buffer += ch; continue; }
    if (inString) { if (objStart !== -1) buffer += ch; continue; }

    if (ch === "{") {
      if (depth === 0) { objStart = i; buffer = "{"; }
      else buffer += ch;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        buffer += "}";
        try {
          const obj = JSON.parse(buffer);
          if (obj && typeof obj === "object" && !Array.isArray(obj)) {
            cases.push(obj);
          } else { skipped_arr[0]++; }
        } catch { skipped_arr[0]++; }
        buffer = "";
        objStart = -1;
      } else if (objStart !== -1) buffer += ch;
    } else if (objStart !== -1) buffer += ch;
  }

  void total_arr;
  return { cases, skipped: skipped_arr[0] };
}

// Client-side parser: handles all HUDOC/ECHR export formats
// Supports: JSON array [...], JSONL (one object per line), {results:[...]}, plain .txt with JSON inside
function parseRaw(text: string): { cases: ParsedCase[]; skipped: number } {
  // Strip BOM and normalize line endings
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  let cases: ParsedCase[] = [];
  let skipped = 0;

  // ── Format 1: Try full JSON.parse first (works for small/medium files) ─────
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);

      // {"results": [...]} / {"items": [...]} / {"hits":{"hits":[...]}} — HUDOC API
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const arr =
          parsed.results ??
          parsed.items ??
          parsed.data ??
          parsed.cases ??
          parsed.hits?.hits ??
          null;
        if (Array.isArray(arr)) {
          const objs = arr
            .map((x: ParsedCase) =>
              x && typeof x === "object" && !Array.isArray(x)
                ? (x._source ?? x)
                : null
            )
            .filter(Boolean) as ParsedCase[];
          return { cases: objs, skipped: arr.length - objs.length };
        }
        // Single object — wrap in array
        return { cases: [parsed], skipped: 0 };
      }

      // [{...}, {...}] — plain JSON array of objects
      if (Array.isArray(parsed)) {
        // Array of objects (most common HUDOC export)
        const objects = parsed.filter(
          (x) => x && typeof x === "object" && !Array.isArray(x)
        );
        if (objects.length > 0) {
          return { cases: objects, skipped: parsed.length - objects.length };
        }

        // Array of arrays with header row: [["col1","col2",...], [val1,val2,...], ...]
        if (parsed.length > 1 && Array.isArray(parsed[0])) {
          const headers = parsed[0] as string[];
          for (let i = 1; i < parsed.length; i++) {
            const row = parsed[i];
            if (!Array.isArray(row)) { skipped++; continue; }
            const obj: ParsedCase = {};
            headers.forEach((h, idx) => { obj[h] = row[idx] ?? null; });
            cases.push(obj);
          }
          return { cases, skipped };
        }

        skipped = parsed.length;
        return { cases: [], skipped };
      }
    } catch {
      // JSON.parse failed — file may be too large or truncated (no closing bracket).
      // Use brace-matching to extract all complete {...} objects from the text.
      if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        const result = extractObjectsByBraceMatch(trimmed);
        if (result.cases.length > 0) return result;
      }
      // Fall through to JSONL line-by-line parsing below.
    }
  }

  // ── Format 2: JSONL — one JSON value per line ─────────────────
  {
    const lines = trimmed.split("\n");
    let headers: string[] | null = null;

    for (let li = 0; li < lines.length; li++) {
      const l = lines[li].trim();
      if (!l) continue;
      try {
        const parsed = JSON.parse(l);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          cases.push(parsed);
          headers = null;
        } else if (Array.isArray(parsed)) {
          if (li === 0 && parsed.every((x) => typeof x === "string")) {
            headers = parsed as string[];
          } else if (headers) {
            const obj: ParsedCase = {};
            headers.forEach((h, idx) => { obj[h] = parsed[idx] ?? null; });
            cases.push(obj);
          } else {
            skipped++;
          }
        } else {
          skipped++;
        }
      } catch { skipped++; }
    }
  }

  return { cases, skipped };
}



// ── Split parsed cases into N-sized JSON files and trigger downloads ──
function splitAndDownload(cases: ParsedCase[], chunkSize: number, baseName: string) {
  const total = cases.length;
  const parts = Math.ceil(total / chunkSize);
  for (let i = 0; i < parts; i++) {
    const slice = cases.slice(i * chunkSize, (i + 1) * chunkSize);
    const blob = new Blob([JSON.stringify(slice, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const padded = String(i + 1).padStart(3, "0");
    a.download = `${baseName}_part${padded}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return parts;
}

export function EchrImportWizard({ open, onOpenChange, onSuccess }: EchrImportWizardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);
  const [splitSize, setSplitSize] = useState(200);

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

  // Streaming parse progress (bytes)
  const [parseProgress, setParseProgress] = useState<{ file: string; pct: number } | null>(null);

  // ── File select (multiple) — streams large files without loading into RAM ──
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const invalid = files.filter(f =>
      !f.name.endsWith(".jsonl") &&
      !f.name.endsWith(".json") &&
      !f.name.endsWith(".txt")
    );
    if (invalid.length > 0) {
      toast.error(`Поддерживаются .json, .jsonl, .txt: ${invalid.map(f => f.name).join(", ")}`);
      return;
    }

    setStatus("parsing");
    setError(null);
    setParseProgress(null);

    const entries: FileEntry[] = [];
    let totalSkipped = 0;

    for (const file of files) {
      try {
        const fileCases: ParsedCase[] = [];
        toast.info(`Читаю файл ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} МБ)...`);

        const { skipped } = await streamParseCases(
          file,
          (obj) => fileCases.push(obj),
          (bytesRead) => {
            const pct = Math.min(99, Math.round((bytesRead / file.size) * 100));
            setParseProgress({ file: file.name, pct });
          }
        );

        entries.push({ name: file.name, cases: fileCases, skipped });
        totalSkipped += skipped;
        console.log(`[EchrImport] "${file.name}": ${fileCases.length} cases, ${skipped} skipped`);
      } catch (err) {
        console.error(`[EchrImport] Failed to read file "${file.name}":`, err);
        entries.push({ name: file.name, cases: [], skipped: 0 });
      }
    }

    setParseProgress(null);
    setFileEntries(entries);
    const allCases = entries.flatMap(e => e.cases);
    setParsedCases(allCases);
    setParseSkipped(totalSkipped);
    setStatus("idle");

    if (allCases.length > 0) {
      toast.success(
        `Найдено ${allCases.length.toLocaleString()} дел ЕСПЧ` +
        (totalSkipped > 0 ? ` (пропущено ${totalSkipped})` : "")
      );
    } else {
      toast.error(`Не удалось распознать дела в файле. Пропущено: ${totalSkipped} строк.`);
    }

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
            Импорт дел ЕСПЧ → Судебная практика (папка ЕСПЧ)
          </DialogTitle>
          <DialogDescription>
            Загрузите файл JSON/JSONL/TXT с делами HUDOC — каждое дело будет сохранено отдельной записью в папку «ЕСПЧ» раздела Судебная практика.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* File selector — multiple */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Files className="h-4 w-4" />
              Файл с делами ЕСПЧ (.json / .jsonl / .txt) — можно несколько файлов
            </Label>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".json,.jsonl,.txt"
              multiple
              onChange={handleFileSelect}
            disabled={isRunning}
            />

            {/* Parsing progress */}
            {status === "parsing" && parseProgress && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Читаю: {parseProgress.file} — {parseProgress.pct}%</span>
                </div>
                <Progress value={parseProgress.pct} className="h-1.5" />
              </div>
            )}

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
              <Label className="text-xs flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-primary" />
                Найдено <span className="font-bold text-primary">{parsedCases.length.toLocaleString()}</span> дел ЕСПЧ — каждое будет сохранено отдельно
              </Label>
              <ScrollArea className="h-44 rounded-lg border">
                <div className="p-2 space-y-1.5">
                  {parsedCases.slice(0, 8).map((c, i) => (
                    <div key={i} className="rounded border bg-muted/40 p-2 text-xs flex items-start gap-2">
                      <span className="text-muted-foreground font-mono shrink-0 w-5">{i+1}.</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {c.docname || c.title || c.case_name || `Case ${i + 1}`}
                        </p>
                        <p className="text-muted-foreground truncate text-[10px]">
                          № {c.appno || c.itemid || c.application_no || "—"}
                          {c.respondent ? ` · ${c.respondent}` : ""}
                          {c.judgementdate ? ` · ${c.judgementdate}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                  {parsedCases.length > 8 && (
                    <p className="text-xs text-center text-muted-foreground py-1">
                      ... и ещё {parsedCases.length - 8} дел
                    </p>
                  )}
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

          {/* Split tool — shown when cases loaded but not yet imported */}
          {status === "idle" && parsedCases.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Scissors className="h-3.5 w-3.5" />
                Разделить файл на части (скачать как отдельные JSON)
              </p>
              <div className="flex items-center gap-2">
                <Select
                  value={String(splitSize)}
                  onValueChange={(v) => setSplitSize(Number(v))}
                >
                  <SelectTrigger className="h-8 w-36 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50 дел / файл</SelectItem>
                    <SelectItem value="100">100 дел / файл</SelectItem>
                    <SelectItem value="200">200 дел / файл</SelectItem>
                    <SelectItem value="500">500 дел / файл</SelectItem>
                    <SelectItem value="1000">1000 дел / файл</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    const parts = splitAndDownload(parsedCases, splitSize, "echr_chunk");
                    toast.success(`Скачано ${parts} файлов по ~${splitSize} дел`);
                  }}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Скачать {Math.ceil(parsedCases.length / splitSize)} файлов
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Всего {parsedCases.length.toLocaleString()} дел → {Math.ceil(parsedCases.length / splitSize)} файлов × ~{splitSize}
              </p>
            </div>
          )}

          <Separator />

          {/* Actions */}
          <div className="flex gap-2">
            {status === "idle" && parsedCases.length > 0 && (
              <Button onClick={handleImport} className="flex-1 h-11 text-base font-semibold">
                <Upload className="mr-2 h-5 w-5" />
                Импортировать {totalCases.toLocaleString()} дел в папку ЕСПЧ
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
