import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  FileText,
  Globe,
  ClipboardPaste,
  FileJson,
  ArrowRight,
  ArrowLeft,
  Upload,
  Loader2,
  CheckCircle,
  AlertTriangle,
  X,
  Database,
  Settings,
  Eye,
  Play,
} from 'lucide-react';
import { kbCategoryOptions, type KbCategory } from '@/components/kb/kbCategories';

// Practice categories for legal_practice_kb target
const practiceCategoryOptions = [
  { value: 'criminal', label: 'Уголовное' },
  { value: 'civil', label: 'Гражданское' },
  { value: 'administrative', label: 'Административное' },
  { value: 'echr', label: 'ЕСПЧ' },
  { value: 'constitutional', label: 'Конституционное' },
] as const;
import { useBulkImport } from '@/hooks/useBulkImport';
import { BulkImportQueue } from '@/components/kb/BulkImportQueue';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

// ── Types ────────────────────────────────────────────────────────────

export type ImportSource = 'files' | 'url' | 'paste_text' | 'paste_jsonl';
export type ImportTarget = 'knowledge_base' | 'legal_practice_kb';

interface ImportOptions {
  normalize: boolean;
  chunk: boolean;
  category: KbCategory;
  sourceName: string;
}

interface PreviewRecord {
  title: string;
  content_preview: string;
  category: string;
  source_name?: string;
}

interface ImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when wizard completes — passes structured data for the parent to handle */
  onImport: (payload: ImportPayload) => void;
}

export interface ImportPayload {
  source: ImportSource;
  target: ImportTarget;
  options: ImportOptions;
  /** Raw files for 'files' source */
  files?: File[];
  /** URL for 'url' source */
  url?: string;
  /** Pasted text for 'paste_text' source */
  text?: string;
  /** Parsed JSONL records for 'paste_jsonl' source */
  jsonlRecords?: Record<string, unknown>[];
  /** Preview records generated from input */
  previewRecords: PreviewRecord[];
}

type WizardStep = 0 | 1 | 2 | 3 | 4 | 5;

const STEP_LABELS = [
  'Источник',
  'Цель',
  'Настройки',
  'Метаданные',
  'Предпросмотр',
  'Импорт',
];

const STEP_ICONS = [FileText, Database, Settings, FileJson, Eye, Play];

// ── Component ────────────────────────────────────────────────────────

export function ImportWizard({ open, onOpenChange, onImport }: ImportWizardProps) {
  const { t } = useTranslation(['kb', 'common']);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Wizard state
  const [step, setStep] = useState<WizardStep>(0);

  // Step 0: Source
  const [source, setSource] = useState<ImportSource | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [url, setUrl] = useState('');
  const [urlList, setUrlList] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [pastedJsonl, setPastedJsonl] = useState('');
  const [jsonlRecords, setJsonlRecords] = useState<Record<string, unknown>[]>([]);
  const [jsonlError, setJsonlError] = useState<string | null>(null);

  // Bulk import hook — destructure to get stable references for callbacks
  const bulk = useBulkImport();
  const bulkClearAll = bulk.clearAll;

  // Step 1: Target
  const [target, setTarget] = useState<ImportTarget>('knowledge_base');

  // Step 2: Options
  const [options, setOptions] = useState<ImportOptions>({
    normalize: true,
    chunk: true,
    category: 'other' as KbCategory,
    sourceName: '',
  });
  const [dedupMode, setDedupMode] = useState<'skip' | 'upsert'>('skip');

  // Step 3: Metadata (sourceName is in options)
  // Step 4: Preview
  const [previewRecords, setPreviewRecords] = useState<PreviewRecord[]>([]);

  // Step 5: Import
  const [importing, setImporting] = useState(false);

  // ── Helpers ──────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setStep(0);
    setSource(null);
    setFiles([]);
    setUrl('');
    setUrlList('');
    setPastedText('');
    setPastedJsonl('');
    setJsonlRecords([]);
    setJsonlError(null);
    setTarget('knowledge_base');
    setOptions({ normalize: true, chunk: true, category: 'other' as KbCategory, sourceName: '' });
    setPreviewRecords([]);
    setImporting(false);
    bulkClearAll();
  }, [bulkClearAll]);

  const handleDialogChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      reset();
      onOpenChange(false);
    }
  }, [reset, onOpenChange]);

  const handleCloseClick = useCallback(() => {
    reset();
    onOpenChange(false);
  }, [reset, onOpenChange]);

  const parseJsonl = useCallback((text: string) => {
    setJsonlError(null);
    const lines = text.trim().split('\n').filter(l => l.trim());
    const records: Record<string, unknown>[] = [];
    for (let i = 0; i < lines.length; i++) {
      try {
        records.push(JSON.parse(lines[i]));
      } catch {
        setJsonlError(`Строка ${i + 1}: невалидный JSON`);
        return [];
      }
    }
    return records;
  }, []);

  /** Parse URL list (single URL field + multi-URL textarea) */
  const parseUrls = useCallback((): string[] => {
    const combined = [url.trim(), ...urlList.split('\n').map(l => l.trim())]
      .filter(u => u.length > 0 && (u.startsWith('http://') || u.startsWith('https://')));
    // Deduplicate
    return [...new Set(combined)];
  }, [url, urlList]);

  const buildPreview = useCallback((): PreviewRecord[] => {
    if (source === 'files') {
      return files.map(f => ({
        title: f.name.replace(/\.[^/.]+$/, ''),
        content_preview: `[Файл: ${f.name}, ${(f.size / 1024).toFixed(1)} KB]`,
        category: options.category,
        source_name: options.sourceName || f.name,
      }));
    }
    if (source === 'url') {
      const urls = parseUrls();
      return urls.map(u => ({
        title: u,
        content_preview: '[URL \u0431\u0443\u0434\u0435\u0442 \u043e\u0431\u0440\u0430\u0431\u043e\u0442\u0430\u043d \u043f\u0440\u0438 \u0438\u043c\u043f\u043e\u0440\u0442\u0435]',
        category: options.category,
        source_name: options.sourceName || u,
      }));
    }
    if (source === 'paste_text') {
      const preview = pastedText.substring(0, 200);
      return [{
        title: options.sourceName || '\u0412\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u043d\u044b\u0439 \u0442\u0435\u043a\u0441\u0442',
        content_preview: preview + (pastedText.length > 200 ? '...' : ''),
        category: options.category,
        source_name: options.sourceName,
      }];
    }
    if (source === 'paste_jsonl') {
      return jsonlRecords.slice(0, 20).map((r, i) => ({
        title: String(r.title || r.name || `Record ${i + 1}`),
        content_preview: String(r.content_text || r.content || r.text || r.body || '').substring(0, 150),
        category: options.category,
        source_name: String(r.source_name || r.Source || options.sourceName || ''),
      }));
    }
    return [];
  }, [source, files, url, urlList, pastedText, jsonlRecords, options]);

  const canAdvance = useCallback((): boolean => {
    switch (step) {
      case 0:
        if (!source) return false;
        if (source === 'files') return files.length > 0;
        if (source === 'url') return url.trim().length > 0 || urlList.trim().length > 0;
        if (source === 'paste_text') return pastedText.trim().length > 0;
        if (source === 'paste_jsonl') return jsonlRecords.length > 0;
        return false;
      case 1: return !!target;
      case 2: return true;
      case 3: return true;
      case 4: return previewRecords.length > 0;
      case 5: return false;
      default: return false;
    }
  }, [step, source, files, url, urlList, pastedText, jsonlRecords, target, previewRecords]);

  const goNext = useCallback(() => {
    if (step === 3) {
      // Build preview before showing step 4
      setPreviewRecords(buildPreview());
    }
    setStep((s) => Math.min(s + 1, 5) as WizardStep);
  }, [step, buildPreview]);

  const goBack = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0) as WizardStep);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    setFiles(prev => [...prev, ...selected]);
  }, []);

  const removeFile = useCallback((idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleJsonlChange = useCallback((text: string) => {
    setPastedJsonl(text);
    if (text.trim()) {
      const records = parseJsonl(text);
      setJsonlRecords(records);
    } else {
      setJsonlRecords([]);
      setJsonlError(null);
    }
  }, [parseJsonl]);

  const handleImport = useCallback(() => {
    setImporting(true);

    // Build queue items from all sources
    const queueSources: Array<{
      source: 'file' | 'url' | 'text' | 'jsonl_record';
      label: string;
      payload: { file?: File; url?: string; text?: string; record?: Record<string, unknown> };
    }> = [];

    if (source === 'files') {
      for (const f of files) {
        queueSources.push({ source: 'file', label: f.name, payload: { file: f } });
      }
    } else if (source === 'url') {
      const urls = parseUrls();
      for (const u of urls) {
        queueSources.push({ source: 'url', label: u, payload: { url: u } });
      }
    } else if (source === 'paste_text') {
      queueSources.push({ source: 'text', label: options.sourceName || 'Pasted text', payload: { text: pastedText } });
    } else if (source === 'paste_jsonl') {
      for (let i = 0; i < jsonlRecords.length; i++) {
        const rec = jsonlRecords[i];
        const label = String(rec.title || rec.name || `Record ${i + 1}`);
        queueSources.push({ source: 'jsonl_record', label, payload: { record: rec } });
      }
    }

    bulk.enqueue(queueSources);

    // Also notify parent with the legacy payload
    const payload: ImportPayload = {
      source: source!,
      target,
      options,
      previewRecords,
      ...(source === 'files' && { files }),
      ...(source === 'url' && { url }),
      ...(source === 'paste_text' && { text: pastedText }),
      ...(source === 'paste_jsonl' && { jsonlRecords }),
    };
    onImport(payload);

    // Start processing
    bulk.run({
      target,
      category: options.category,
      sourceName: options.sourceName,
      normalize: options.normalize,
      chunk: options.chunk,
      dedupMode,
    });
  }, [source, target, options, previewRecords, files, url, pastedText, jsonlRecords, onImport, bulk, parseUrls]);

  // ── Source selection cards ──────────────────────────────────────

  const sourceCards: { id: ImportSource; icon: typeof FileText; label: string; desc: string }[] = [
    { id: 'files', icon: FileText, label: 'Файлы', desc: 'PDF, TXT, JSON, изображения' },
    { id: 'url', icon: Globe, label: 'URL', desc: 'Скрейпинг веб-страниц' },
    { id: 'paste_text', icon: ClipboardPaste, label: 'Текст', desc: 'Вставить текст документа' },
    { id: 'paste_jsonl', icon: FileJson, label: 'JSONL', desc: 'Массовый импорт записей' },
  ];

  // ── Render ─────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col [&>button]:z-50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Импорт
          </DialogTitle>
          <DialogDescription>
            Шаг {step + 1} из 6: {STEP_LABELS[step]}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-1 px-1">
          {STEP_LABELS.map((label, i) => {
            const Icon = STEP_ICONS[i];
            return (
              <div
                key={label}
                className={`flex-1 flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  i === step
                    ? 'bg-primary text-primary-foreground'
                    : i < step
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <Icon className="h-3 w-3 shrink-0" />
                <span className="hidden sm:inline truncate">{label}</span>
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <ScrollArea className="flex-1 min-h-0 px-1">
          <div className="py-4 space-y-4">

            {/* ── Step 0: Source ─────────────────────── */}
            {step === 0 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {sourceCards.map(({ id, icon: SrcIcon, label, desc }) => (
                    <button
                      key={id}
                      onClick={() => setSource(id)}
                      className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors hover:bg-accent ${
                        source === id ? 'border-primary bg-primary/5' : 'border-border'
                      }`}
                    >
                      <SrcIcon className="h-8 w-8" />
                      <span className="font-medium text-sm">{label}</span>
                      <span className="text-xs text-muted-foreground">{desc}</span>
                    </button>
                  ))}
                </div>

                {/* Source-specific input */}
                {source === 'files' && (
                  <div className="space-y-2">
                    <Label>Выберите файлы</Label>
                    <Input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.txt,.json,.jsonl,.jpg,.jpeg,.png,.tiff"
                      onChange={handleFileSelect}
                    />
                    {files.length > 0 && (
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {files.map((f, i) => (
                          <div key={i} className="flex items-center justify-between rounded bg-muted px-2 py-1 text-sm">
                            <span className="truncate">{f.name} ({(f.size / 1024).toFixed(1)} KB)</span>
                            <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {source === 'url' && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>URL</Label>
                      <Input
                        placeholder="https://example.com/document.pdf"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>
                        {'\u0414\u043e\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c\u043d\u044b\u0435 URL'}{' '}
                        <span className="text-muted-foreground font-normal">({'\u043f\u043e \u043e\u0434\u043d\u043e\u043c\u0443 \u043d\u0430 \u0441\u0442\u0440\u043e\u043a\u0443'})</span>
                      </Label>
                      <Textarea
                        placeholder={'https://example.com/doc1.pdf\nhttps://example.com/doc2.pdf'}
                        value={urlList}
                        onChange={(e) => setUrlList(e.target.value)}
                        className="min-h-[80px] font-mono text-xs"
                      />
                      {(url || urlList) && (
                        <p className="text-xs text-muted-foreground">
                          {parseUrls().length} URL {'\u0440\u0430\u0441\u043f\u043e\u0437\u043d\u0430\u043d\u043e'}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {source === 'paste_text' && (
                  <div className="space-y-2">
                    <Label>Текст документа</Label>
                    <Textarea
                      placeholder="Вставьте текст..."
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      className="min-h-[120px]"
                    />
                    {pastedText && (
                      <p className="text-xs text-muted-foreground">{pastedText.length} символов</p>
                    )}
                  </div>
                )}

                {source === 'paste_jsonl' && (
                  <div className="space-y-2">
                    <Label>JSONL (по одной JSON-записи на строку)</Label>
                    <Textarea
                      placeholder='{"title":"...","content_text":"..."}\n{"title":"...","content_text":"..."}'
                      value={pastedJsonl}
                      onChange={(e) => handleJsonlChange(e.target.value)}
                      className="min-h-[120px] font-mono text-xs"
                    />
                    {jsonlError && (
                      <div className="flex items-center gap-1 text-destructive text-xs">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {jsonlError}
                      </div>
                    )}
                    {jsonlRecords.length > 0 && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                        {jsonlRecords.length} записей распознано
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── Step 1: Target ─────────────────────── */}
            {step === 1 && (
              <div className="space-y-4">
                <Label>Целевая таблица</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      setTarget('knowledge_base');
                      setOptions(prev => ({ ...prev, category: 'other' as KbCategory }));
                    }}
                    className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors hover:bg-accent ${
                      target === 'knowledge_base' ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                  >
                    <Database className="h-8 w-8" />
                    <span className="font-medium text-sm">Законодательство</span>
                    <span className="text-xs text-muted-foreground">knowledge_base</span>
                  </button>
                  <button
                    onClick={() => {
                      setTarget('legal_practice_kb');
                      setOptions(prev => ({ ...prev, category: 'criminal' as KbCategory }));
                    }}
                    className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors hover:bg-accent ${
                      target === 'legal_practice_kb' ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                  >
                    <Database className="h-8 w-8" />
                    <span className="font-medium text-sm">Судебная практика</span>
                    <span className="text-xs text-muted-foreground">legal_practice_kb</span>
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 2: Options ─────────────────────── */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Нормализация</p>
                    <p className="text-xs text-muted-foreground">Очистка текста, удаление мусора</p>
                  </div>
                  <Switch
                    checked={options.normalize}
                    onCheckedChange={(v) => setOptions(prev => ({ ...prev, normalize: v }))}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Чанкирование</p>
                    <p className="text-xs text-muted-foreground">Разбивка на семантические блоки для RAG</p>
                  </div>
                  <Switch
                    checked={options.chunk}
                    onCheckedChange={(v) => setOptions(prev => ({ ...prev, chunk: v }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Дедупликация</Label>
                  <RadioGroup value={dedupMode} onValueChange={(v) => setDedupMode(v as 'skip' | 'upsert')} className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="skip" id="dedup-skip" />
                      <Label htmlFor="dedup-skip" className="text-sm font-normal cursor-pointer">
                        Пропустить дубли
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="upsert" id="dedup-upsert" />
                      <Label htmlFor="dedup-upsert" className="text-sm font-normal cursor-pointer">
                        Обновить дубли
                      </Label>
                    </div>
                  </RadioGroup>
                  <p className="text-xs text-muted-foreground">
                    {dedupMode === 'skip' ? 'Существующие документы с таким же хешем будут пропущены' : 'Существующие документы будут заменены новой версией'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Категория</Label>
                  <Select
                    value={options.category}
                    onValueChange={(v) => setOptions(prev => ({ ...prev, category: v as KbCategory }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {target === 'legal_practice_kb'
                        ? practiceCategoryOptions.map(cat => (
                            <SelectItem key={cat.value} value={cat.value}>
                              {cat.label}
                            </SelectItem>
                          ))
                        : kbCategoryOptions.map(cat => (
                            <SelectItem key={cat.value} value={cat.value}>
                              {t(cat.labelKey)}
                            </SelectItem>
                          ))
                      }
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* ── Step 3: Metadata ────────────────────── */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Название источника</Label>
                  <Input
                    placeholder="Напр.: ARLIS.am, Datalex, ..."
                    value={options.sourceName}
                    onChange={(e) => setOptions(prev => ({ ...prev, sourceName: e.target.value }))}
                  />
                </div>
                <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
                  <p className="text-sm font-medium">Сводка</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-muted-foreground">Источник:</span>
                    <span>{source === 'files' ? `${files.length} файл(ов)` : source === 'url' ? 'URL' : source === 'paste_text' ? 'Текст' : `JSONL (${jsonlRecords.length})`}</span>
                    <span className="text-muted-foreground">Цель:</span>
                    <span>{target === 'knowledge_base' ? 'Законодательство' : 'Суд. практика'}</span>
                    <span className="text-muted-foreground">Категория:</span>
                    <span>{options.category}</span>
                    <span className="text-muted-foreground">Нормализация:</span>
                    <span>{options.normalize ? 'Да' : 'Нет'}</span>
                    <span className="text-muted-foreground">Чанкирование:</span>
                    <span>{options.chunk ? 'Да' : 'Нет'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 4: Preview ─────────────────────── */}
            {step === 4 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    Предпросмотр ({previewRecords.length} записей)
                  </p>
                  {previewRecords.length > 20 && (
                    <Badge variant="outline" className="text-xs">Показаны первые 20</Badge>
                  )}
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {previewRecords.slice(0, 20).map((rec, i) => (
                    <div key={i} className="rounded-lg border p-3 space-y-1">
                      <p className="text-sm font-medium truncate">{rec.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{rec.content_preview}</p>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-[10px]">{rec.category}</Badge>
                        {rec.source_name && (
                          <Badge variant="secondary" className="text-[10px]">{rec.source_name}</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4 py-2">
                {importing || bulk.items.length > 0 ? (
                  <BulkImportQueue
                    items={bulk.items}
                    isRunning={bulk.isRunning}
                    completed={bulk.completed}
                    failed={bulk.failed}
                    total={bulk.total}
                    onRetryFailed={() => bulk.retryFailed({
                      target,
                      category: options.category,
                      sourceName: options.sourceName,
                      normalize: options.normalize,
                      chunk: options.chunk,
                      dedupMode,
                    })}
                    onAbort={bulk.abort}
                    onClearCompleted={bulk.clearCompleted}
                    onDownloadErrors={bulk.downloadErrorReport}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-4 py-8">
                    <div className="rounded-full bg-primary/10 p-4">
                      <Play className="h-10 w-10 text-primary" />
                    </div>
                    <p className="text-sm font-medium">{'\u0413\u043e\u0442\u043e\u0432\u043e \u043a \u0438\u043c\u043f\u043e\u0440\u0442\u0443'}</p>
                    <p className="text-xs text-muted-foreground text-center max-w-sm">
                      {previewRecords.length} {'\u0437\u0430\u043f\u0438\u0441\u0435\u0439 \u0431\u0443\u0434\u0443\u0442 \u0438\u043c\u043f\u043e\u0440\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u044b \u0432'}{' '}
                      {target === 'knowledge_base' ? '\u0431\u0430\u0437\u0443 \u0437\u0430\u043a\u043e\u043d\u043e\u0434\u0430\u0442\u0435\u043b\u044c\u0441\u0442\u0432\u0430' : '\u0431\u0430\u0437\u0443 \u0441\u0443\u0434\u0435\u0431\u043d\u043e\u0439 \u043f\u0440\u0430\u043a\u0442\u0438\u043a\u0438'}
                    </p>
                    <Button onClick={handleImport} size="lg" className="mt-2">
                      <Upload className="mr-2 h-4 w-4" />
                      {'\u041d\u0430\u0447\u0430\u0442\u044c \u0438\u043c\u043f\u043e\u0440\u0442'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Navigation buttons */}
        {step < 5 && (
          <div className="flex items-center justify-between border-t pt-3">
            <Button
              variant="outline"
              onClick={step === 0 ? handleCloseClick : goBack}
              size="sm"
            >
              {step === 0 ? (
                'Отмена'
              ) : (
                <>
                  <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                  Назад
                </>
              )}
            </Button>
            <Button
              onClick={goNext}
              disabled={!canAdvance()}
              size="sm"
            >
              Далее
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {step === 5 && (
          <div className="flex items-center justify-between border-t pt-3">
            {!bulk.isRunning && (
              <Button variant="outline" onClick={goBack} size="sm">
                <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                {'\u041d\u0430\u0437\u0430\u0434'}
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="ghost" onClick={handleCloseClick} size="sm">
              {'\u0417\u0430\u043a\u0440\u044b\u0442\u044c'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
