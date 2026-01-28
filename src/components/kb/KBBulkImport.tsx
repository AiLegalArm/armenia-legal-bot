import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Upload, FileText, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { kbCategoryOptions, type KbCategory } from '@/components/kb/kbCategories';

interface KBBulkImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type ImportStatus = 'idle' | 'reading' | 'importing' | 'success' | 'error';

const categories = kbCategoryOptions;

export function KBBulkImport({ open, onOpenChange, onSuccess }: KBBulkImportProps) {
  const { t } = useTranslation(['kb', 'common']);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [textContent, setTextContent] = useState('');
  const [codeName, setCodeName] = useState('');
  const [category, setCategory] = useState<KbCategory>('other');
  const [clearExisting, setClearExisting] = useState(false);
  const [result, setResult] = useState<{ imported: number; sampleTitles: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.txt')) {
      toast.error(t('common:error'));
      return;
    }

    // Check file size (100MB limit for text files)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      toast.error(`File too large. Maximum size is ${maxSize / (1024 * 1024)}MB`);
      return;
    }

    setStatus('reading');
    try {
      const text = await file.text();
      setTextContent(text);
      
      // Auto-detect code name from filename
      const name = file.name.replace('.txt', '').replace(/_/g, ' ');
      setCodeName(name);
      
      setStatus('idle');
      toast.success(t('common:success'));
    } catch (err) {
      setStatus('error');
      setError(t('common:error'));
    }
  };

  const handleImport = async () => {
    if (!textContent || !codeName) {
      toast.error(t('common:error'));
      return;
    }

    setStatus('importing');
    setProgress(20);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('kb-import', {
        body: {
          textContent,
          codeName,
          category,
          clearExisting
        },
      });

      setProgress(90);

      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);

      setResult({
        imported: data.imported,
        sampleTitles: data.sampleTitles || []
      });
      setProgress(100);
      setStatus('success');
      toast.success(t('document_uploaded'));
      onSuccess();

    } catch (err) {
      console.error('Import error:', err);
      setStatus('error');
      setError(err instanceof Error ? err.message : t('common:error'));
      toast.error(t('common:error'));
    }
  };

  const handleClose = () => {
    setTextContent('');
    setCodeName('');
    setCategory('other');
    setClearExisting(false);
    setStatus('idle');
    setProgress(0);
    setResult(null);
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('upload_document')}
          </DialogTitle>
          <DialogDescription>
            {t('supported_formats')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Selection */}
          <div className="space-y-2">
            <Label>TXT</Label>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".txt"
              onChange={handleFileSelect}
            />
            {textContent && (
              <p className="text-sm text-muted-foreground">
                {textContent.length.toLocaleString()} characters
              </p>
            )}
          </div>

          {/* Code Name */}
          <div className="space-y-2">
            <Label>{t('document_title')}</Label>
            <Input
              value={codeName}
              onChange={(e) => setCodeName(e.target.value)}
              placeholder="RA Criminal Code"
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>{t('categories')}</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as KbCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {t(cat.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Clear Existing */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="clearExisting"
              checked={clearExisting}
              onCheckedChange={(checked) => setClearExisting(checked === true)}
            />
            <Label htmlFor="clearExisting" className="text-sm">
              Clear existing entries
            </Label>
          </div>

          {/* Preview */}
          {textContent && status === 'idle' && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <Textarea
                value={textContent.substring(0, 1000) + (textContent.length > 1000 ? '...' : '')}
                readOnly
                className="h-32 text-xs"
              />
            </div>
          )}

          {/* Import Button */}
          {textContent && codeName && status === 'idle' && (
            <Button onClick={handleImport} className="w-full">
              <Upload className="mr-2 h-4 w-4" />
              {t('upload_document')}
            </Button>
          )}

          {/* Progress */}
          {(status === 'reading' || status === 'importing') && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">
                  {t('common:loading')}
                </span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {/* Error */}
          {status === 'error' && error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive bg-destructive/10 p-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          )}

          {/* Success */}
          {status === 'success' && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">
                  {t('document_uploaded')}: {result.imported} articles
                </span>
              </div>

              {result.sampleTitles.length > 0 && (
                <div className="space-y-2">
                  <Label>Examples:</Label>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {result.sampleTitles.map((title, i) => (
                      <li key={i}>• {title}</li>
                    ))}
                  </ul>
                </div>
              )}

              <Button onClick={handleClose} className="w-full">
                {t('common:close')}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
