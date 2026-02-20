/**
 * EchrImportWizard — Import ECHR cases (JSON/JSONL) with automatic
 * Armenian translation of text, summary, facts, judgment fields.
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
  FileJson, Loader2, CheckCircle, AlertTriangle, Upload, Download, Globe, X,
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

const PRACTICE_CATEGORIES = [
  { value: "echr", label: "ԵԽԴМ" },
  { value: "criminal", label: "Քրեական" },
  { value: "civil", label: "Քաղաքացիական" },
  { value: "administrative", label: "Վարչական" },
  { value: "constitutional", label: "Սահմանադրական" },
];

// Client-side parser: JSON array or JSONL
function parseRaw(text: string): { cases: ParsedCase[]; skipped: number } {
  const trimmed = text.trim();
  let cases: ParsedCase[] = [];
  let skipped = 0;

  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) cases = arr.filter((x) => x && typeof x === "object");
    } catch { /* fall through to JSONL */ }
  }

  if (cases.length === 0) {
    for (const line of trimmed.split("\n")) {
      const l = line.trim();
      if (!l) continue;
      try { cases.push(JSON.parse(l)); } catch { skipped++; }
    }
  }

  return { cases, skipped };
}

export function EchrImportWizard({ open, onOpenChange, onSuccess }: EchrImportWizardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);

  const [status, setStatus] = useState<Status>("idle");
  const [fileName, setFileName] = useState("");
  const [rawContent, setRawContent] = useState("");
  const [parsedCases, setParsedCases] = useState<ParsedCase[]>([]);
  const [parseSkipped, setParseSkipped] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Import options
  const [storeInHyFields, setStoreInHyFields] = useState(true);
  const [generateJsonl, setGenerateJsonl] = useState(true);
  const [practiceCategory, setPracticeCategory] = useState("echr");
  const BATCH_SIZE = 5;

  // Progress
  const [stats, setStats] = useState<ImportStats>({
    total: 0, processed: 0, translated: 0, partial: 0, errors: 0, parseSkipped: 0,
  });

  // Collected JSONL content for download
  const jsonlLinesRef = useRef<string[]>([]);

  // ── File select ───────────────────────────────────────────────
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".jsonl") && !file.name.endsWith(".json")) {
      toast.error("Supported: .jsonl, .json");
      return;
    }

    setStatus("parsing");
    setFileName(file.name);
    setError(null);

    try {
      const text = await file.text();
      setRawContent(text);

      const { cases, skipped } = parseRaw(text);
      setParsedCases(cases);
      setParseSkipped(skipped);
      setStatus("idle");

      toast.success(
        `Հայտնաբերվել է ${cases.length.toLocaleString()} գործ` +
        (skipped > 0 ? ` (${skipped} բաց թողած)` : "")
      );
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Parse error");
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // ── Start import ──────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    if (!rawContent || parsedCases.length === 0) return;

    setStatus("translating");
    abortRef.current = false;
    jsonlLinesRef.current = [];

    const total = parsedCases.length;
    let processed = 0;
    let translated = 0;
    let partial = 0;
    let importErrors = 0;

    setStats({ total, processed: 0, translated: 0, partial: 0, errors: 0, parseSkipped });

    for (let batchIdx = 0; batchIdx < total; batchIdx += BATCH_SIZE) {
      if (abortRef.current) break;

      try {
        const { data, error: fnErr } = await supabase.functions.invoke("echr-import", {
          body: {
            rawContent,
            storeInHyFields,
            generateJsonl,
            practiceCategory,
            batchIndex: batchIdx,
            batchSize: BATCH_SIZE,
          },
        });

        if (fnErr) throw new Error(fnErr.message);
        if (data?.error) throw new Error(data.error);

        processed += data.batchProcessed ?? 0;
        translated += data.translated ?? 0;
        partial += data.partial ?? 0;
        importErrors += data.errors ?? 0;

        if (data.jsonlContent) {
          jsonlLinesRef.current.push(data.jsonlContent);
        }

        setStats({ total, processed, translated, partial, errors: importErrors, parseSkipped });
      } catch (err) {
        importErrors += BATCH_SIZE;
        setStats((s) => ({ ...s, errors: s.errors + BATCH_SIZE }));
        console.error("Batch error:", err);
      }

      await new Promise((r) => setTimeout(r, 100));
    }

    setStatus("success");
    toast.success(`Ներմուծումն ավարտված է — ${translated} թարգմանված`);
    onSuccess();
  }, [rawContent, parsedCases, storeInHyFields, generateJsonl, practiceCategory, parseSkipped, onSuccess]);

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
    toast.info("Ընդհատվել է");
  }, []);

  const handleClose = useCallback(() => {
    abortRef.current = true;
    setStatus("idle");
    setFileName("");
    setRawContent("");
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            ECHR Ներմուծում — Հայ Թարգմանությամբ
          </DialogTitle>
          <DialogDescription>
            JSON / JSONL ֆայլ հայերեն թարգմանությամբ (text, summary, facts, judgment)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* File selector */}
          <div className="space-y-2">
            <Label>ECHR ֆայլ (.json կամ .jsonl)</Label>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".json,.jsonl"
              onChange={handleFileSelect}
              disabled={isRunning}
            />
            {fileName && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <FileJson className="h-4 w-4" />
                {fileName} &mdash;{" "}
                <strong>{parsedCases.length.toLocaleString()}</strong> գործ
                {parseSkipped > 0 && (
                  <Badge variant="destructive" className="text-[10px]">
                    {parseSkipped} բաց թողած
                  </Badge>
                )}
              </p>
            )}
          </div>

          {/* Preview */}
          {parsedCases.length > 0 && status === "idle" && (
            <div className="space-y-2">
              <Label className="text-xs">Նախատեսություն (առաջին 3)</Label>
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
                <Label className="text-xs">Կատեգորիա</Label>
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
                  <p className="text-sm font-medium">Պահ. թարգ. *_hy դաշտերում (text_hy, summary_hy...)</p>
                  <p className="text-xs text-muted-foreground">Բնագիրն անփոփոխ կمنا</p>
                </div>
                <Switch
                  checked={storeInHyFields}
                  onCheckedChange={setStoreInHyFields}
                  disabled={isRunning}
                />
              </div>

              {!storeInHyFields && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                  <p className="text-xs text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Ուշադրություն. բնագրի դաշտերը կվերագրվեն: text, summary, facts, judgment
                  </p>
                </div>
              )}

              {/* Generate JSONL toggle */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">JSONL արտահանում (echr_cases_hy.jsonl)</p>
                  <p className="text-xs text-muted-foreground">1 տող = 1 գործ</p>
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
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
                <span className="text-sm font-medium">
                  {status === "translating"
                    ? `Թարգմանում է... ${stats.processed}/${stats.total}`
                    : `Ավարտված — ${stats.processed}/${stats.total}`}
                </span>
                <Badge variant="outline" className="ml-auto">{progressPct}%</Badge>
              </div>
              <Progress value={progressPct} className="h-2" />

              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded border bg-green-500/10 p-2">
                  <p className="font-mono font-bold text-green-700 dark:text-green-400">{stats.translated}</p>
                  <p className="text-muted-foreground">Թարգ.</p>
                </div>
                <div className="rounded border bg-amber-500/10 p-2">
                  <p className="font-mono font-bold text-amber-700 dark:text-amber-400">{stats.partial}</p>
                  <p className="text-muted-foreground">Մաս.</p>
                </div>
                <div className="rounded border bg-destructive/10 p-2">
                  <p className="font-mono font-bold text-destructive">{stats.errors}</p>
                  <p className="text-muted-foreground">Սխ.</p>
                </div>
                <div className="rounded border bg-muted p-2">
                  <p className="font-mono font-bold">{stats.parseSkipped}</p>
                  <p className="text-muted-foreground">Բաց</p>
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
                Ներմուծել + Թարգ. {parsedCases.length.toLocaleString()} գործ
              </Button>
            )}

            {status === "translating" && (
              <Button variant="outline" onClick={handleAbort} className="flex-1">
                <X className="mr-2 h-4 w-4" />
                Կանգնել
              </Button>
            )}

            {status === "success" && generateJsonl && jsonlLinesRef.current.length > 0 && (
              <Button onClick={downloadJsonl} variant="outline" className="flex-1">
                <Download className="mr-2 h-4 w-4" />
                Ներբեռ. echr_cases_hy.jsonl
              </Button>
            )}

            {status === "success" && (
              <Button onClick={handleClose}>
                <CheckCircle className="mr-2 h-4 w-4" />
                Փակել
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
