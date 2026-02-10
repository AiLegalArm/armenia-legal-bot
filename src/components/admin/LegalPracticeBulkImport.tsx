import { useState, useCallback, useRef } from 'react';
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

const categoryLabels: Record<PracticeCategory, string> = {
  criminal: '\u0554\u0580\u0565\u0561\u056F\u0561\u0576',
  civil: '\u0554\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576',
  administrative: '\u054E\u0561\u0580\u0579\u0561\u056F\u0561\u0576',
  echr: '\u0535\u054D\u054A\u053F',
};

const courtTypeLabels: Record<CourtType, string> = {
  first_instance: '\u0531\u057C\u0561\u057B\u056B\u0576 \u0561\u057F\u0575\u0561\u0576',
  appeal: '\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579',
  cassation: '\u054E\u0573\u057C\u0561\u0562\u0565\u056F',
  constitutional: '\u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576',
  echr: '\u0535\u054D\u054A\u053F',
};

const outcomeLabels: Record<CaseOutcome, string> = {
  granted: '\u0532\u0561\u057E\u0561\u0580\u0561\u0580\u057E\u0565\u056C',
  rejected: '\u0544\u0565\u0580\u056A\u057E\u0565\u056C',
  partial: '\u0544\u0561\u057D\u0576\u0561\u056F\u056B',
  remanded: '\u054E\u0565\u0580\u0561\u0564\u0561\u0580\u0571\u057E\u0565\u056C',
  discontinued: '\u053F\u0561\u0580\u0573\u057E\u0565\u056C',
};

interface LegalPracticeBulkImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function LegalPracticeBulkImport({ open, onOpenChange }: LegalPracticeBulkImportProps) {
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
        toast.error(`${file.name}: \u0544\u056B\u0561\u0575\u0576 TXT \u056F\u0561\u0574 JSON \u0586\u0561\u0575\u056C\u0565\u0580`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name}: \u0546\u056B\u0577\u0568 \u0579\u0561\u0583\u0561\u0566\u0561\u0576\u0581 \u0574\u0565\u056E \u0567 (max 50MB)`);
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
  }, []);

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

  const detectOutcome = (text: string): CaseOutcome => {
    const lower = text.toLowerCase();
    // Armenian keywords for outcomes
    if (/\u0562\u0561\u057E\u0561\u0580\u0561\u0580\u0565\u056C|\u0570\u0561\u0575\u0581\u0568\u0576? \u0562\u0561\u057E\u0561\u0580\u0561\u0580\u0565\u056C|\u0570\u0561\u0575\u0581\u0568 \u0562\u0561\u057E\u0561\u0580\u0561\u0580\u0565\u056C/i.test(text)) return 'granted';
    if (/\u0574\u0565\u0580\u056A\u057E\u0565\u056C|\u0570\u0561\u0575\u0581\u0568\u0576? \u0574\u0565\u0580\u056A\u0565\u056C|\u0570\u0561\u0575\u0581\u0568 \u0574\u0565\u0580\u056A\u0565\u056C|\u0574\u0565\u0580\u056A\u057E\u0565\u056C \u0567/i.test(text)) return 'rejected';
    if (/\u0574\u0561\u057D\u0576\u0561\u056F\u056B\u0578\u0580\u0565\u0576|\u0574\u0561\u057D\u0576\u0561\u056F\u056B/i.test(text)) return 'partial';
    if (/\u057E\u0565\u0580\u0561\u0564\u0561\u0580\u0571\u057E\u0565\u056C|\u0576\u0578\u0580 \u0584\u0576\u0576\u0578\u0582\u0569\u0575\u0561\u0576/i.test(text)) return 'remanded';
    if (/\u056F\u0561\u0580\u0573\u057E\u0565\u056C|\u057E\u0561\u0580\u0578\u0582\u0575\u0569\u0568 \u056F\u0561\u0580\u0573\u057E\u0565\u056C/i.test(text)) return 'discontinued';
    // Russian keywords
    if (/\u0443\u0434\u043e\u0432\u043b\u0435\u0442\u0432\u043e\u0440\u0438\u0442\u044c|\u0443\u0434\u043e\u0432\u043b\u0435\u0442\u0432\u043e\u0440\u0435\u043d/i.test(lower)) return 'granted';
    if (/\u043e\u0442\u043a\u0430\u0437\u0430\u0442\u044c|\u043e\u0442\u043a\u043b\u043e\u043d\u0438\u0442\u044c|\u043e\u0442\u043a\u0430\u0437\u0430\u043d\u043e/i.test(lower)) return 'rejected';
    if (/\u0447\u0430\u0441\u0442\u0438\u0447\u043d\u043e/i.test(lower)) return 'partial';
    if (/\u043d\u0430\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u043d\u0430 \u043d\u043e\u0432\u043e\u0435|\u0432\u043e\u0437\u0432\u0440\u0430\u0442\u0438\u0442\u044c/i.test(lower)) return 'remanded';
    if (/\u043f\u0440\u0435\u043a\u0440\u0430\u0442\u0438\u0442\u044c|\u043f\u0440\u0435\u043a\u0440\u0430\u0449\u0435\u043d\u043e/i.test(lower)) return 'discontinued';
    return 'granted'; // fallback
  };

  const processFile = async (fileItem: TxtFileItem): Promise<boolean> => {
    const { id, file } = fileItem;
    try {
      updateFile(id, { status: 'reading', progress: 30 });
      const textContent = await file.text();

      updateFile(id, { status: 'importing', progress: 60 });

      if (file.name.endsWith('.json')) {
        // JSON mode: array of entries
        let jsonData: unknown;
        try {
          jsonData = JSON.parse(textContent);
        } catch {
          throw new Error('Invalid JSON format');
        }
        const items = Array.isArray(jsonData) ? jsonData : [jsonData];
        const rows = items
          .filter((item: any) => item.title && item.content_text)
          .map((item: any) => ({
            title: String(item.title),
            content_text: String(item.content_text),
            practice_category: item.practice_category || category,
            court_type: item.court_type || courtType,
            outcome: item.outcome || (autoDetectOutcome ? detectOutcome(String(item.content_text)) : manualOutcome),
            is_active: true,
            is_anonymized: item.is_anonymized ?? true,
            visibility: item.visibility || 'ai_only',
            source_name: item.source_name || file.name,
            court_name: item.court_name || null,
            case_number_anonymized: item.case_number_anonymized || null,
            decision_date: item.decision_date || null,
            applied_articles: item.applied_articles || null,
            legal_reasoning_summary: item.legal_reasoning_summary || null,
            key_violations: item.key_violations || null,
            description: item.description || null,
          }));

        if (rows.length === 0) throw new Error('No valid entries in JSON');

        // Insert in batches
        const batchSize = 50;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const { error } = await supabase.from('legal_practice_kb').insert(batch);
          if (error) throw error;
        }

        updateFile(id, { status: 'success', progress: 100 });
      } else {
        // TXT mode: single entry
        const title = file.name.replace(/\.txt$/i, '').replace(/_/g, ' ');
        const resolvedOutcome = autoDetectOutcome ? detectOutcome(textContent) : manualOutcome;

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

  const handleStartImport = async () => {
    const pendingFiles = files.filter((f) => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setIsProcessing(true);
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
      toast.success(`\u053B\u0574\u057A\u0578\u0580\u057F\u057E\u0565\u0581\u055D ${successCount} \u0586\u0561\u0575\u056C`);
      queryClient.invalidateQueries({ queryKey: ['legal-practice-kb'] });
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
        return '\u054D\u057A\u0561\u057D\u0578\u0582\u0574 \u0567';
      case 'reading':
        return '\u053F\u0561\u0580\u0564\u0561\u0581\u0578\u0582\u0574...';
      case 'importing':
        return '\u054A\u0561\u0570\u057A\u0561\u0576\u0574\u0561\u0576...';
      case 'success':
        return '\u0540\u0561\u057B\u0578\u0572\u057E\u0565\u0581';
      case 'error':
        return fi.error || '\u054D\u056D\u0561\u056C';
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderUp className="h-5 w-5" />
            {'\u0544\u0561\u057D\u057D\u0561\u0575\u0561\u056F\u0561\u0576 \u056B\u0574\u057A\u0578\u0580\u057F (TXT / JSON)'}
          </DialogTitle>
          <DialogDescription>
            {'\u054E\u0565\u0580\u0562\u0565\u057C\u0576\u0565\u0584 TXT \u056F\u0561\u0574 JSON \u0586\u0561\u0575\u056C\u0565\u0580: JSON\u055D [{title, content_text, ...}]'}
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
              {'\u0554\u0561\u0577\u0565\u0584 \u056F\u0561\u0574 \u0562\u0565\u0580\u0565\u0584 TXT / JSON \u0586\u0561\u0575\u056C\u0565\u0580'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {'TXT: 1 \u0586\u0561\u0575\u056C = 1 \u0578\u0580\u0578\u0577\u0578\u0582\u0574 | JSON: [{title, content_text, ...}] (max 50MB)'}
            </p>
          </div>

          {/* Settings */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{'\u053F\u0561\u057F\u0565\u0563\u0578\u0580\u056B\u0561'}</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as PracticeCategory)}
                disabled={isProcessing}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{'\u0531\u057F\u0575\u0561\u0576'}</Label>
              <Select
                value={courtType}
                onValueChange={(v) => setCourtType(v as CourtType)}
                disabled={isProcessing}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(courtTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>{'\u0531\u0580\u0564\u0575\u0578\u0582\u0576\u0584'}</Label>
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="autoDetectOutcome"
                    checked={autoDetectOutcome}
                    onCheckedChange={(v) => setAutoDetectOutcome(v === true)}
                    disabled={isProcessing}
                  />
                  <Label htmlFor="autoDetectOutcome" className="text-xs cursor-pointer text-muted-foreground">
                    {'\u0531\u057E\u057F\u0578'}
                  </Label>
                </div>
              </div>
              {autoDetectOutcome ? (
                <p className="text-xs text-muted-foreground border rounded-md px-3 py-2">
                  {'\u054F\u0565\u0584\u057D\u057F\u056B\u0581 \u0561\u057E\u057F\u0578\u0574\u0561\u057F \u056F\u0578\u0580\u0578\u0577\u0565\u056C\u0578\u0582 \u0567 (\u0562\u0561\u057E\u0561\u0580\u0561\u0580\u057E\u0565\u056C/\u0574\u0565\u0580\u056A\u057E\u0565\u056C/\u0574\u0561\u057D\u0576\u0561\u056F\u056B...)'}
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
                    {Object.entries(outcomeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
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
              {'\u054D\u056D\u0561\u056C\u056B \u0564\u0565\u057A\u0584\u0578\u0582\u0574 \u0577\u0561\u0580\u0578\u0582\u0576\u0561\u056F\u0565\u056C'}
            </Label>
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{files.length} {'\u0586\u0561\u0575\u056C'}</Label>
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
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            {'\u0549\u0565\u0572\u0561\u0580\u056F\u0565\u056C'}
          </Button>
          <Button onClick={handleStartImport} disabled={pendingCount === 0 || isProcessing}>
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {'\u053B\u0574\u057A\u0578\u0580\u057F\u057E\u0578\u0582\u0574 \u0567...'}
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                {'\u053B\u0574\u057A\u0578\u0580\u057F'} ({pendingCount})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
