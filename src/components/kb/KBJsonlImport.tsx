import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { FileJson, Loader2, CheckCircle, AlertTriangle, Upload, FileText } from 'lucide-react';
import { kbCategoryOptions, type KbCategory } from '@/components/kb/kbCategories';
import { ScrollArea } from '@/components/ui/scroll-area';

interface KBJsonlImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type ImportStatus = 'idle' | 'parsing' | 'importing' | 'fetching_pdfs' | 'success' | 'error';

// ARLIS.am format
interface ArlisDocument {
  uniqid?: string;
  pdf_link?: string;
  ActNumber?: string;
  DocType?: string;
  ActType?: string;
  ActStatus?: string;
  Source?: string;
  EnactmentLocation?: string;
  EnactmentOrgan?: string;
  EnactmentDate?: string;
  SigningOrgan?: string;
  SigningDate?: string;
  RatificationOrgan?: string;
  RatificationDate?: string;
  EffectiveDate?: string;
  InterruptDate?: string | null;
  title?: string;
  language?: string;
  // Generic format
  content_text?: string;
  content?: string;
  text?: string;
  category?: string;
  source_name?: string;
  source_url?: string;
  article_number?: string;
  version_date?: string;
}

interface ImportResult {
  total: number;
  imported: number;
  errors: number;
  samples: string[];
}

export function KBJsonlImport({ open, onOpenChange, onSuccess }: KBJsonlImportProps) {
  const { t } = useTranslation(['kb', 'common']);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const [totalLines, setTotalLines] = useState(0);
  const [defaultCategory, setDefaultCategory] = useState<KbCategory>('other');
  const [batchSize, setBatchSize] = useState(100);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<ArlisDocument[]>([]);
  const [isArlisFormat, setIsArlisFormat] = useState(false);
  const [fetchPdfContent, setFetchPdfContent] = useState(false);
  const [pdfFetchProgress, setPdfFetchProgress] = useState(0);
  const [importedIds, setImportedIds] = useState<string[]>([]);

  const parseDate = (dateStr: string | undefined | null): string | null => {
    if (!dateStr) return null;
    // Parse DD.MM.YYYY format
    const match = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (match) {
      return `${match[3]}-${match[2]}-${match[1]}`;
    }
    return null;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.jsonl') && !file.name.endsWith('.json')) {
      toast.error('Supported: .jsonl, .json');
      return;
    }

    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`Max size: ${maxSize / (1024 * 1024)}MB`);
      return;
    }

    setStatus('parsing');
    setFileName(file.name);
    setProgress(10);

    try {
      const text = await file.text();
      setProgress(30);
      
      let docs: ArlisDocument[] = [];
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length > 1 && !text.trim().startsWith('[')) {
        // JSONL format
        for (const line of lines) {
          try {
            const doc = JSON.parse(line);
            if (doc.title || doc.pdf_link || doc.content_text) {
              docs.push(doc);
            }
          } catch {
            // Skip invalid lines
          }
        }
      } else {
        // JSON array
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            docs = parsed.filter(d => d.title || d.pdf_link || d.content_text);
          }
        } catch {
          throw new Error('Cannot parse file format');
        }
      }

      if (docs.length === 0) {
        throw new Error('No documents found');
      }

      // Detect ARLIS format
      const hasArlisFields = docs.some(d => d.pdf_link || d.ActNumber || d.EnactmentOrgan);
      setIsArlisFormat(hasArlisFields);

      setDocuments(docs);
      setTotalLines(docs.length);
      setProgress(100);
      setStatus('idle');
      
      toast.success(`Found ${docs.length.toLocaleString()} documents${hasArlisFields ? ' (ARLIS format)' : ''}`);
      
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Parse error');
      toast.error('File read error');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImport = async () => {
    if (documents.length === 0) return;

    setStatus('importing');
    setProgress(0);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setStatus('error');
      setError('Not authenticated');
      return;
    }

    let imported = 0;
    let errors = 0;
    const samples: string[] = [];

    try {
      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);
        
        const records = batch.map(doc => {
          // Build content from ARLIS metadata if no content_text
          let contentText = doc.content_text || doc.content || doc.text || '';
          
          if (!contentText && isArlisFormat) {
            // Create structured content from ARLIS metadata
            // Armenian labels provided by user
            const parts: string[] = [];
            if (doc.title) parts.push(`# ${doc.title}\n`);
            // Փաստաթղթի համար - Document number
            if (doc.ActNumber) parts.push(`**\u0553\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u056B \u0570\u0561\u0574\u0561\u0580:** ${doc.ActNumber}`);
            // Փաստաթղթի տեսակ - Document type
            if (doc.ActType) parts.push(`**\u0553\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u056B \u057F\u0565\u057D\u0561\u056F:** ${doc.ActType}`);
            // Ընդունող մարմին - Adopting body
            if (doc.EnactmentOrgan) parts.push(`**\u0538\u0576\u0564\u0578\u0582\u0576\u0578\u0572 \u0574\u0561\u0580\u0574\u056B\u0576:** ${doc.EnactmentOrgan}`);
            // Ընդունման ամսաթիվ - Adoption date
            if (doc.EnactmentDate) parts.push(`**\u0538\u0576\u0564\u0578\u0582\u0576\u0574\u0561\u0576 \u0561\u0574\u057D\u0561\u0569\u056B\u057E:** ${doc.EnactmentDate}`);
            // Ուժի մեջ մտնելու ամսաթիվ - Effective date
            if (doc.EffectiveDate) parts.push(`**\u0548\u0582\u056A\u056B \u0574\u0565\u057B \u0574\u057F\u0576\u0565\u056C\u0578\u0582 \u0561\u0574\u057D\u0561\u0569\u056B\u057E:** ${doc.EffectiveDate}`);
            // Կարգավիճակ - Status
            if (doc.ActStatus) parts.push(`**\u053F\u0561\u0580\u0563\u0561\u057E\u056B\u0573\u0561\u056F:** ${doc.ActStatus}`);
            // Աղբյուր - Source
            if (doc.Source) parts.push(`**\u0531\u0572\u0562\u0575\u0578\u0582\u0580:** ${doc.Source}`);
            if (doc.pdf_link) parts.push(`\n**PDF:** ${doc.pdf_link}`);
            contentText = parts.join('\n');
          }
          
          // Sanitize null bytes
          const sanitizedContent = contentText.replace(/\u0000/g, '');
          const sanitizedTitle = (doc.title || 'Untitled').replace(/\u0000/g, '');
          
          // Validate category
          const validCategories = kbCategoryOptions.map(c => c.value);
          const category = validCategories.includes(doc.category as KbCategory) 
            ? doc.category as KbCategory 
            : defaultCategory;

          // Parse version date from ARLIS EffectiveDate or generic version_date
          const versionDate = parseDate(doc.EffectiveDate) || doc.version_date || null;

          return {
            title: sanitizedTitle.substring(0, 500),
            content_text: sanitizedContent.substring(0, 200000),
            category,
            source_name: doc.Source || doc.EnactmentOrgan || doc.source_name || 'ARLIS.am',
            source_url: doc.pdf_link || doc.source_url || null,
            article_number: doc.ActNumber || doc.article_number || null,
            version_date: versionDate,
            uploaded_by: user.id,
            is_active: true,
          };
        });

        const { error: insertError, data } = await supabase
          .from('knowledge_base')
          .insert(records)
          .select('id, title');

        if (insertError) {
          console.error('Batch insert error:', insertError);
          errors += batch.length;
        } else {
          imported += data?.length || batch.length;
          // Collect IDs for PDF fetching
          if (data) {
            setImportedIds(prev => [...prev, ...data.map(d => d.id)]);
          }
          if (samples.length < 5 && data) {
            samples.push(...data.slice(0, 5 - samples.length).map(d => d.title));
          }
        }

        setProgress(Math.round(((i + batch.length) / documents.length) * 100));
      }

      setResult({ total: documents.length, imported, errors, samples });
      setStatus('success');
      toast.success(`Imported ${imported.toLocaleString()} documents`);
      onSuccess();

    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Import error');
      toast.error('Import failed');
    }
  };

  // Fetch PDF content for imported records
  const handleFetchPdfContent = async () => {
    if (importedIds.length === 0) {
      toast.error('No records to process');
      return;
    }

    setStatus('fetching_pdfs');
    setPdfFetchProgress(0);

    try {
      // Process in chunks of 20
      const chunkSize = 20;
      let totalProcessed = 0;
      let totalErrors = 0;

      for (let i = 0; i < importedIds.length; i += chunkSize) {
        const chunk = importedIds.slice(i, i + chunkSize);
        
        const { data, error } = await supabase.functions.invoke('kb-fetch-pdf-content', {
          body: { kbIds: chunk, batchSize: 3, delayMs: 3000 }
        });

        if (error) {
          console.error('PDF fetch error:', error);
          totalErrors += chunk.length;
        } else if (data) {
          totalProcessed += data.processed || 0;
          totalErrors += data.errors || 0;
        }

        setPdfFetchProgress(Math.round(((i + chunk.length) / importedIds.length) * 100));
      }

      toast.success(`PDF контент извлечён: ${totalProcessed} успешно, ${totalErrors} ошибок`);
      setStatus('success');
      onSuccess();

    } catch (err) {
      console.error('PDF fetch failed:', err);
      toast.error('Ошибка извлечения PDF');
      setStatus('error');
      setError(err instanceof Error ? err.message : 'PDF fetch error');
    }
  };

  const handleClose = () => {
    setDocuments([]);
    setFileName('');
    setTotalLines(0);
    setDefaultCategory('other');
    setStatus('idle');
    setProgress(0);
    setResult(null);
    setError(null);
    setIsArlisFormat(false);
    setFetchPdfContent(false);
    setImportedIds([]);
    setPdfFetchProgress(0);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            JSONL/JSON Import
          </DialogTitle>
          <DialogDescription>
            Import from ARLIS.am JSONL or generic format (up to 500MB)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Selection */}
          <div className="space-y-2">
            <Label>File (.jsonl or .json)</Label>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".jsonl,.json"
              onChange={handleFileSelect}
              disabled={status === 'importing'}
            />
            {fileName && (
              <p className="text-sm text-muted-foreground">
                {fileName} — {totalLines.toLocaleString()} documents
                {isArlisFormat && <span className="ml-2 text-primary">(ARLIS format detected)</span>}
              </p>
            )}
          </div>

          {/* ARLIS format example */}
          <div className="rounded-lg border bg-muted/50 p-3 text-xs space-y-2">
            <p className="font-medium">ARLIS.am format:</p>
            <pre className="overflow-x-auto bg-background p-2 rounded text-[10px]">
{`{"uniqid": "6611", "pdf_link": "https://pdf.arlis.am/6611", "ActNumber": "N 218", "ActType": "Որոշում", "ActStatus": "Գործում է", "EnactmentOrgan": "ՀՀ Կառավարություն", "EnactmentDate": "02.04.1998", "title": "ՀՀ կառավարության որոշում"}`}
            </pre>
            <p className="text-muted-foreground">
              Fields: title, pdf_link, ActNumber, ActType, EnactmentOrgan, EnactmentDate, EffectiveDate, Source
            </p>
          </div>

          {/* Settings */}
          {documents.length > 0 && status !== 'importing' && status !== 'success' && (
            <>
              <div className="space-y-2">
                <Label>Default Category</Label>
                <Select value={defaultCategory} onValueChange={(v) => setDefaultCategory(v as KbCategory)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {kbCategoryOptions.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {t(cat.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Batch size</Label>
                <Select value={String(batchSize)} onValueChange={(v) => setBatchSize(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100 (recommended)</SelectItem>
                    <SelectItem value="200">200</SelectItem>
                    <SelectItem value="500">500 (fast)</SelectItem>
                    <SelectItem value="1000">1000 (fastest)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Preview */}
              <div className="space-y-2">
                <Label>Preview (first 3):</Label>
                <ScrollArea className="h-40 rounded border p-2">
                  {documents.slice(0, 3).map((doc, i) => (
                    <div key={i} className="mb-2 pb-2 border-b last:border-0 text-xs">
                      <p className="font-medium truncate">{doc.title || 'No title'}</p>
                      <div className="text-muted-foreground space-y-0.5">
                        {doc.ActNumber && <p>Act: {doc.ActNumber}</p>}
                        {doc.EnactmentOrgan && <p>Organ: {doc.EnactmentOrgan}</p>}
                        {doc.pdf_link && <p className="truncate">PDF: {doc.pdf_link}</p>}
                        {doc.content_text && <p className="truncate">Content: {doc.content_text.substring(0, 80)}...</p>}
                      </div>
                    </div>
                  ))}
                </ScrollArea>
              </div>

              <Button onClick={handleImport} className="w-full">
                <Upload className="mr-2 h-4 w-4" />
                Import {documents.length.toLocaleString()} documents
              </Button>
            </>
          )}

          {/* Progress */}
          {status === 'importing' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Importing... {progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {/* PDF Fetching Progress */}
          {status === 'fetching_pdfs' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Извлечение PDF контента... {pdfFetchProgress}%</span>
              </div>
              <Progress value={pdfFetchProgress} />
              <p className="text-xs text-muted-foreground">
                Обработка {importedIds.length} документов (3-5 сек на документ)
              </p>
            </div>
          )}

          {/* Error */}
          {status === 'error' && error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive bg-destructive/10 p-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          )}

          {/* Success */}
          {status === 'success' && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">
                  Imported: {result.imported.toLocaleString()} / {result.total.toLocaleString()}
                </span>
              </div>

              {result.errors > 0 && (
                <p className="text-sm text-destructive">
                  Errors: {result.errors.toLocaleString()}
                </p>
              )}

              {result.samples.length > 0 && (
                <div className="space-y-1">
                  <Label>Samples:</Label>
                  <ul className="text-sm text-muted-foreground">
                    {result.samples.map((s, i) => (
                      <li key={i} className="truncate">• {s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* PDF Content Fetch Button */}
              {importedIds.length > 0 && isArlisFormat && (
                <div className="border-t pt-4 space-y-2">
                  <Label className="text-sm font-medium">Шаг 2: Извлечь контент из PDF</Label>
                  <p className="text-xs text-muted-foreground">
                    Импортированы только метаданные. Нажмите чтобы скачать полный текст из {importedIds.length} PDF файлов.
                  </p>
                  <Button onClick={handleFetchPdfContent} variant="secondary" className="w-full">
                    <FileText className="mr-2 h-4 w-4" />
                    Извлечь PDF контент ({importedIds.length} файлов)
                  </Button>
                </div>
              )}

              <Button onClick={handleClose} className="w-full">
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
