import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  X,
  FolderUp,
  Wand2,
  Zap,
} from 'lucide-react';

type PracticeCategory = 'criminal' | 'civil' | 'administrative' | 'echr';
type CourtType = 'first_instance' | 'appeal' | 'cassation' | 'constitutional' | 'echr';
type CaseOutcome = 'granted' | 'rejected' | 'partial' | 'remanded' | 'discontinued';

type FileStatus = 'pending' | 'reading' | 'importing' | 'success' | 'error';

interface TxtFileItem {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  error?: string;
}

const categoryKeys: Record<PracticeCategory, string> = {
  criminal: 'lp_cat_criminal',
  civil: 'lp_cat_civil',
  administrative: 'lp_cat_administrative',
  echr: 'lp_cat_echr',
};

const courtTypeKeys: Record<CourtType, string> = {
  first_instance: 'lp_court_first_instance',
  appeal: 'lp_court_appeal',
  cassation: 'lp_court_cassation',
  constitutional: 'lp_court_constitutional',
  echr: 'lp_court_echr',
};

const outcomeKeys: Record<CaseOutcome, string> = {
  granted: 'lp_outcome_granted',
  rejected: 'lp_outcome_rejected',
  partial: 'lp_outcome_partial',
  remanded: 'lp_outcome_remanded',
  discontinued: 'lp_outcome_discontinued',
};

interface LegalPracticeBulkImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function LegalPracticeBulkImport({ open, onOpenChange }: LegalPracticeBulkImportProps) {
  const { t } = useTranslation('kb');
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<TxtFileItem[]>([]);
  const [category, setCategory] = useState<PracticeCategory>('criminal');
  const [courtType, setCourtType] = useState<CourtType>('cassation');
  const [autoDetectOutcome, setAutoDetectOutcome] = useState(true);
  const [manualOutcome, setManualOutcome] = useState<CaseOutcome>('granted');
  const [skipOnError, setSkipOnError] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const validFiles: TxtFileItem[] = [];

    for (const file of fileArray) {
      const isTxt = file.name.endsWith('.txt');
      const isJson = file.name.endsWith('.json');
      if (!isTxt && !isJson) {
        toast.error(`${file.name}: ${t('lp_bi_only_txt_json')}`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name}: ${t('lp_bi_file_too_large')}`);
        continue;
      }
      validFiles.push({
        id: crypto.randomUUID(),
        file,
        status: 'pending',
        progress: 0,
      });
    }

    setFiles((prev) => [...prev, ...validFiles]);
  }, [t]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const updateFile = (id: string, updates: Partial<TxtFileItem>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const extractMetadata = (text: string) => {
    const header = text.substring(0, 5000);

    let court_name: string | null = null;
    const courtPatterns = [
      /(\u0540\u0540\s+\u057E\u0573\u057C\u0561\u0562\u0565\u056F\s+\u0564\u0561\u057F\u0561\u0580\u0561\u0576)/i,
      /(\u0540\u0540\s+[\u0531-\u058F\s]+\u0564\u0561\u057F\u0561\u0580\u0561\u0576)/i,
      /(\u057E\u0573\u057C\u0561\u0562\u0565\u056F\s+\u0564\u0561\u057F\u0561\u0580\u0561\u0576)/i,
      /(\u057E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579\s+\u0564\u0561\u057F\u0561\u0580\u0561\u0576)/i,
    ];
    for (const p of courtPatterns) {
      const m = header.match(p);
      if (m) { court_name = m[1].trim(); break; }
    }

    let case_number: string | null = null;
    const casePatterns = [
      /\u0563\u0578\u0580\u056E\s*[\u2116N#]?\s*([\w\/\-\.]+\d[\w\/\-\.]*)/i,
      /\u0533\u0578\u0580\u056E\s*[\u2116N#]?\s*([\w\/\-\.]+\d[\w\/\-\.]*)/i,
      /([A-Z\u0531-\u054F]+\d{2,}[\d\/\-]*)/,
    ];
    for (const p of casePatterns) {
      const m = header.match(p);
      if (m) { case_number = m[1].trim(); break; }
    }

    let decision_date: string | null = null;
    const ddmmyyyy = header.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    const isoDate = header.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (ddmmyyyy) {
      decision_date = `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
    } else if (isoDate) {
      decision_date = isoDate[0];
    }

    const articles: string[] = [];
    const hyArt = text.matchAll(/\u0570\u0578\u0564\u057E\u0561\u056E\u056B?\s*(\d+(?:\.\d+)?)/gi);
    for (const m of hyArt) articles.push(m[1]);
    const ruArt = text.matchAll(/\u0441\u0442\.?\s*(\d+(?:\.\d+)?)/gi);
    for (const m of ruArt) articles.push(m[1]);
    const uniqueArticles = [...new Set(articles)];

    return {
      court_name,
      case_number,
      decision_date,
      applied_articles: uniqueArticles.length > 0 ? uniqueArticles : null,
    };
  };

  const detectOutcome = (text: string): CaseOutcome => {
    const lower = text.toLowerCase();
    if (/\u0562\u0561\u057E\u0561\u0580\u0561\u0580\u0565\u056C|\u0570\u0561\u0575\u0581\u0568\u0576? \u0562\u0561\u057E\u0561\u0580\u0561\u0580\u0565\u056C|\u0570\u0561\u0575\u0581\u0568 \u0562\u0561\u057E\u0561\u0580\u0561\u0580\u0565\u056C/i.test(text)) return 'granted';
    if (/\u0574\u0565\u0580\u056A\u057E\u0565\u056C|\u0570\u0561\u0575\u0581\u0568\u0576? \u0574\u0565\u0580\u056A\u0565\u056C|\u0570\u0561\u0575\u0581\u0568 \u0574\u0565\u0580\u056A\u0565\u056C|\u0574\u0565\u0580\u056A\u057E\u0565\u056C \u0567/i.test(text)) return 'rejected';
    if (/\u0574\u0561\u057D\u0576\u0561\u056F\u056B\u0578\u0580\u0565\u0576|\u0574\u0561\u057D\u0576\u0561\u056F\u056B/i.test(text)) return 'partial';
    if (/\u057E\u0565\u0580\u0561\u0564\u0561\u0580\u0571\u057E\u0565\u056C|\u0576\u0578\u0580 \u0584\u0576\u0576\u0578\u0582\u0569\u0575\u0561\u0576/i.test(text)) return 'remanded';
    if (/\u056F\u0561\u0580\u0573\u057E\u0565\u056C|\u057E\u0561\u0580\u0578\u0582\u0575\u0569\u0568 \u056F\u0561\u0580\u0573\u057E\u0565\u056C/i.test(text)) return 'discontinued';
    if (/\u0443\u0434\u043e\u0432\u043b\u0435\u0442\u0432\u043e\u0440\u0438\u0442\u044c|\u0443\u0434\u043e\u0432\u043b\u0435\u0442\u0432\u043e\u0440\u0435\u043d/i.test(lower)) return 'granted';
    if (/\u043e\u0442\u043a\u0430\u0437\u0430\u0442\u044c|\u043e\u0442\u043a\u043b\u043e\u043d\u0438\u0442\u044c|\u043e\u0442\u043a\u0430\u0437\u0430\u043d\u043e/i.test(lower)) return 'rejected';
    if (/\u0447\u0430\u0441\u0442\u0438\u0447\u043d\u043e/i.test(lower)) return 'partial';
    if (/\u043d\u0430\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u043d\u0430 \u043d\u043e\u0432\u043e\u0435|\u0432\u043e\u0437\u0432\u0440\u0430\u0442\u0438\u0442\u044c/i.test(lower)) return 'remanded';
    if (/\u043f\u0440\u0435\u043a\u0440\u0430\u0442\u0438\u0442\u044c|\u043f\u0440\u0435\u043a\u0440\u0430\u0449\u0435\u043d\u043e/i.test(lower)) return 'discontinued';
    return 'granted';
  };

  const processFile = async (fileItem: TxtFileItem): Promise<boolean> => {
    const { id, file } = fileItem;
    try {
      updateFile(id, { status: 'reading', progress: 30 });
      const textContent = await file.text();

      updateFile(id, { status: 'importing', progress: 60 });

      if (file.name.endsWith('.json')) {
        let jsonData: unknown;
        try {
          jsonData = JSON.parse(textContent);
        } catch {
          throw new Error('Invalid JSON format');
        }
        const items = Array.isArray(jsonData) ? jsonData : [jsonData];
        const fallbackTitle = file.name.replace(/\.json$/i, '').replace(/_/g, ' ');
        const rows = items
          .map((item: any) => {
            const contentText = item.content_text || item.content || item.text || item.body || '';
            const title = item.title || item.name || fallbackTitle;
            if (!contentText) return null;
            const extracted = extractMetadata(String(contentText));
            return {
              title: String(title),
              content_text: String(contentText),
              practice_category: item.practice_category || category,
              court_type: item.court_type || courtType,
              outcome: item.outcome || (autoDetectOutcome ? detectOutcome(String(contentText)) : manualOutcome),
              is_active: true,
              is_anonymized: item.is_anonymized ?? true,
              visibility: item.visibility || 'ai_only',
              source_name: item.source_name || file.name,
              court_name: item.court_name || extracted.court_name,
              case_number_anonymized: item.case_number_anonymized || extracted.case_number,
              decision_date: item.decision_date || extracted.decision_date,
              // applied_articles left null — filled by AI enrichment
              legal_reasoning_summary: item.legal_reasoning_summary || null,
              key_violations: item.key_violations || null,
              description: item.description || null,
            };
          })
          .filter(Boolean);

        if (rows.length === 0) {
          const fullContent = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData, null, 2);
          const extracted = extractMetadata(fullContent);
          const { error } = await supabase.from('legal_practice_kb').insert({
            title: fallbackTitle,
            content_text: fullContent,
            practice_category: category,
            court_type: courtType,
            outcome: autoDetectOutcome ? detectOutcome(fullContent) : manualOutcome,
            is_active: true,
            is_anonymized: true,
            visibility: 'ai_only',
            source_name: file.name,
            court_name: extracted.court_name,
            case_number_anonymized: extracted.case_number,
            decision_date: extracted.decision_date,
            // applied_articles left null — filled by AI enrichment
          });
          if (error) throw error;
          updateFile(id, { status: 'success', progress: 100 });
        } else {
          const batchSize = 50;
          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            const { error } = await supabase.from('legal_practice_kb').insert(batch);
            if (error) throw error;
          }
          updateFile(id, { status: 'success', progress: 100 });
        }
      } else {
        const title = file.name.replace(/\.txt$/i, '').replace(/_/g, ' ');
        const resolvedOutcome = autoDetectOutcome ? detectOutcome(textContent) : manualOutcome;
        const extracted = extractMetadata(textContent);

        const { error } = await supabase.from('legal_practice_kb').insert({
          title,
          content_text: textContent,
          practice_category: category,
          court_type: courtType,
          outcome: resolvedOutcome,
          is_active: true,
          is_anonymized: true,
          visibility: 'ai_only',
          source_name: file.name,
          court_name: extracted.court_name,
          case_number_anonymized: extracted.case_number,
          decision_date: extracted.decision_date,
          // applied_articles left null — filled by AI enrichment
        });
        if (error) throw error;
        updateFile(id, { status: 'success', progress: 100 });
      }

      return true;
    } catch (error) {
      updateFile(id, {
        status: 'error',
        progress: 100,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  };

  const [chunkingStatus, setChunkingStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [enrichmentStatus, setEnrichmentStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');

  const runChunking = async () => {
    setChunkingStatus('running');
    try {
      const { data, error } = await supabase.functions.invoke('kb-backfill-chunks', {
        body: { chunkSize: 8000 },
      });
      if (error) throw error;
      setChunkingStatus('done');
      toast.success(t('lp_bi_chunk_success', { count: data?.totalChunksInserted || 0 }));
    } catch (e) {
      setChunkingStatus('error');
      toast.error(t('lp_bi_chunk_fail'));
    }
  };

  const runEnrichment = async () => {
    setEnrichmentStatus('running');
    try {
      const { data, error } = await supabase.functions.invoke('legal-practice-enrich', {
        body: { limit: 50 },
      });
      if (error) throw error;
      setEnrichmentStatus('done');
      toast.success(t('lp_bi_enrich_success', { count: data?.enriched || 0 }));
      queryClient.invalidateQueries({ queryKey: ['legal-practice-kb'] });
    } catch (e) {
      setEnrichmentStatus('error');
      toast.error(t('lp_bi_enrich_fail'));
    }
  };

  const handleStartImport = async () => {
    const pendingFiles = files.filter((f) => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setIsProcessing(true);
    setChunkingStatus('idle');
    setEnrichmentStatus('idle');
    let successCount = 0;
    let errorCount = 0;

    for (const fileItem of pendingFiles) {
      const success = await processFile(fileItem);
      if (success) {
        successCount++;
      } else {
        errorCount++;
        if (!skipOnError) break;
      }
    }

    setIsProcessing(false);
    if (successCount > 0) {
      toast.success(t('lp_bi_imported', { count: successCount }));
      queryClient.invalidateQueries({ queryKey: ['legal-practice-kb'] });
      runChunking();
    }
  };

  const handleClose = () => {
    if (isProcessing) return;
    setFiles([]);
    setSkipOnError(true);
    onOpenChange(false);
  };

  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const successCount = files.filter((f) => f.status === 'success').length;
  const errorCount = files.filter((f) => f.status === 'error').length;
  const totalProgress =
    files.length > 0 ? files.reduce((acc, f) => acc + f.progress, 0) / files.length : 0;

  const getStatusIcon = (status: FileStatus) => {
    switch (status) {
      case 'pending':
        return <FileText className="h-4 w-4 text-muted-foreground" />;
      case 'reading':
      case 'importing':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const getStatusText = (fi: TxtFileItem) => {
    switch (fi.status) {
      case 'pending':
        return t('lp_bi_status_pending');
      case 'reading':
        return t('lp_bi_status_reading');
      case 'importing':
        return t('lp_bi_status_importing');
      case 'success':
        return t('lp_bi_status_success');
      case 'error':
        return fi.error || t('lp_bi_status_error');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderUp className="h-5 w-5" />
            {t('lp_bi_title')}
          </DialogTitle>
          <DialogDescription>
            {t('lp_bi_description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-hidden">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative cursor-pointer rounded-lg border-2 border-dashed p-8
              transition-colors text-center
              ${isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.json"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <Upload className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">
              {t('lp_bi_drop_hint')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('lp_bi_drop_format')}
            </p>
          </div>

          {/* Settings */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t('lp_category')}</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as PracticeCategory)}
                disabled={isProcessing}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(categoryKeys) as PracticeCategory[]).map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(categoryKeys[value])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t('lp_court_type')}</Label>
              <Select
                value={courtType}
                onValueChange={(v) => setCourtType(v as CourtType)}
                disabled={isProcessing}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(courtTypeKeys) as CourtType[]).map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(courtTypeKeys[value])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>{t('lp_outcome')}</Label>
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="autoDetectOutcome"
                    checked={autoDetectOutcome}
                    onCheckedChange={(v) => setAutoDetectOutcome(v === true)}
                    disabled={isProcessing}
                  />
                  <Label htmlFor="autoDetectOutcome" className="text-xs cursor-pointer text-muted-foreground">
                    {t('lp_bi_auto')}
                  </Label>
                </div>
              </div>
              {autoDetectOutcome ? (
                <p className="text-xs text-muted-foreground border rounded-md px-3 py-2">
                  {t('lp_bi_auto_detect_hint')}
                </p>
              ) : (
                <Select
                  value={manualOutcome}
                  onValueChange={(v) => setManualOutcome(v as CaseOutcome)}
                  disabled={isProcessing}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(outcomeKeys) as CaseOutcome[]).map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(outcomeKeys[value])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="skipOnErrorBulk"
              checked={skipOnError}
              onCheckedChange={(v) => setSkipOnError(v === true)}
              disabled={isProcessing}
            />
            <Label htmlFor="skipOnErrorBulk" className="text-sm cursor-pointer">
              {t('lp_bi_skip_errors')}
            </Label>
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('lp_bi_files_count', { count: files.length })}</Label>
                {isProcessing && (
                  <span className="text-xs text-muted-foreground">{Math.round(totalProgress)}%</span>
                )}
              </div>

              {isProcessing && <Progress value={totalProgress} className="h-2" />}

              <ScrollArea className="h-48 rounded border">
                <div className="space-y-1 p-2">
                  {files.map((fi) => (
                    <div
                      key={fi.id}
                      className="flex items-center gap-2 rounded p-2 text-sm hover:bg-muted/50"
                    >
                      {getStatusIcon(fi.status)}
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium">{fi.file.name}</p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 max-w-[200px] truncate">
                        {getStatusText(fi)}
                      </span>
                      {fi.status === 'pending' && !isProcessing && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={() => removeFile(fi.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {(successCount > 0 || errorCount > 0) && (
                <div className="flex gap-4 text-xs">
                  {successCount > 0 && (
                    <span className="text-green-600">{'\u2713'} {successCount}</span>
                  )}
                  {errorCount > 0 && (
                    <span className="text-destructive">{'\u2717'} {errorCount}</span>
                  )}
                </div>
              )}

              {/* Post-import actions */}
              {successCount > 0 && !isProcessing && (
                <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <p className="text-xs font-medium">{t('lp_bi_post_actions')}</p>
                  
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-xs flex-1">
                      {chunkingStatus === 'running' ? t('lp_bi_chunking') :
                       chunkingStatus === 'done' ? `\u2713 ${t('lp_bi_chunked')}` :
                       chunkingStatus === 'error' ? t('lp_bi_chunk_error') :
                       t('lp_bi_chunk_waiting')}
                    </span>
                    {chunkingStatus === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
                  </div>

                  <div className="flex items-center gap-2">
                    <Wand2 className="h-4 w-4 text-purple-500 shrink-0" />
                    <span className="text-xs flex-1">{t('lp_bi_ai_enrich')}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-xs px-2"
                      disabled={enrichmentStatus === 'running' || chunkingStatus === 'running'}
                      onClick={runEnrichment}
                    >
                      {enrichmentStatus === 'running' ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : enrichmentStatus === 'done' ? (
                        '\u2713'
                      ) : (
                        t('lp_bi_run')
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            {t('lp_cancel')}
          </Button>
          <Button onClick={handleStartImport} disabled={pendingCount === 0 || isProcessing}>
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('lp_bi_importing')}
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                {t('lp_bi_import')} ({pendingCount})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
