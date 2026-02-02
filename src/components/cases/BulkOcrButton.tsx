import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, ScanText, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { getFunctionsInvokeErrorMessage, isNoDataForExtractionMessage } from '@/lib/functionsInvokeError';

interface BulkOcrButtonProps {
  caseId: string;
  files: Array<{
    id: string;
    original_filename: string;
    storage_path: string;
    file_type: string | null;
  }>;
  existingOcrFileIds: Set<string>;
  forceProcess?: boolean; // When true, process all files even if already OCR'd
}

export function BulkOcrButton({ caseId, files, existingOcrFileIds, forceProcess = false }: BulkOcrButtonProps) {
  const { t, i18n } = useTranslation(['cases', 'ocr', 'common']);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [results, setResults] = useState<{ success: number; failed: number }>({ success: 0, failed: 0 });
  const queryClient = useQueryClient();

  // Filter files that need OCR (PDF, images, DOCX - NOT legacy .doc) and don't have OCR yet (unless forceProcess)
  const filesToProcess = files.filter(f => {
    // Skip OCR check if forceProcess is true (user selected files manually)
    if (!forceProcess && existingOcrFileIds.has(f.id)) return false;
    const type = f.file_type?.toLowerCase() || '';
    const name = f.original_filename.toLowerCase();
    
    // Exclude legacy .doc format (not supported)
    if (name.endsWith('.doc') && !name.endsWith('.docx')) return false;
    
    return (
      type.includes('pdf') ||
      type.includes('image') ||
      type.includes('wordprocessingml') || // .docx
      type.includes('text/plain') || // .txt
      name.endsWith('.pdf') ||
      name.endsWith('.jpg') ||
      name.endsWith('.jpeg') ||
      name.endsWith('.png') ||
      name.endsWith('.docx') ||
      name.endsWith('.txt')
    );
  });
  
  // Check for unsupported .doc files
  const unsupportedDocFiles = files.filter(f => {
    const name = f.original_filename.toLowerCase();
    return name.endsWith('.doc') && !name.endsWith('.docx');
  });

  const handleProcessAll = async () => {
    if (filesToProcess.length === 0) {
      toast.info(t('cases:no_files_to_process', 'No files to process'));
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setResults({ success: 0, failed: 0 });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      setCurrentFile(file.original_filename);
      setProgress(Math.round((i / filesToProcess.length) * 100));

      try {
        // Get signed URL for the file
        let signedUrl: string | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) {
            await new Promise(r => setTimeout(r, 500 * attempt));
          }
          const { data: signedUrlData, error: signedUrlError } = await supabase.storage
            .from('case-files')
            .createSignedUrl(file.storage_path, 300);

          if (!signedUrlError && signedUrlData?.signedUrl) {
            signedUrl = signedUrlData.signedUrl;
            break;
          }
        }

        if (!signedUrl) {
          throw new Error('Failed to get signed URL');
        }

        // Determine language
        const lang = i18n.language === 'hy' ? 'hye' : i18n.language === 'ru' ? 'rus' : 'eng';

        // Call OCR function
        const { data, error } = await supabase.functions.invoke('ocr-process', {
          body: {
            fileUrl: signedUrl,
            fileName: file.original_filename,
            language: lang,
            fileId: file.id, // Pass file ID to link OCR result
          }
        });

        if (error) throw error;

        // Check for success - ocr-process returns extracted_text and saves to DB automatically
        if (data.success && data.extracted_text) {
          successCount++;
        } else {
          throw new Error(data.error || 'OCR failed');
        }
      } catch (error) {
        console.error(`OCR failed for ${file.original_filename}:`, error);
        failCount++;
      }
    }

    setProgress(100);
    setResults({ success: successCount, failed: failCount });
    setCurrentFile(null);
    setIsProcessing(false);

    // Invalidate queries to refresh data
    queryClient.invalidateQueries({ queryKey: ['case-files', caseId] });
    queryClient.invalidateQueries({ queryKey: ['ocr-results', caseId] });

    if (successCount > 0) {
      toast.success(
        t('cases:ocr_complete', 'OCR completed: {{success}} successful, {{failed}} failed', {
          success: successCount,
          failed: failCount
        })
      );
      
      // Auto-extract facts and legal question after successful OCR
      await extractCaseFields();
    } else if (failCount > 0) {
      toast.error(t('ocr:processing_failed', 'Processing failed'));
    }
  };

  const extractCaseFields = async () => {
    try {
      toast.info(t('cases:extracting_fields', 'Extracting facts and legal question...'));
      
      const { data, error } = await supabase.functions.invoke('extract-case-fields', {
        body: { caseId }
      });

      if (error) {
        const msg = getFunctionsInvokeErrorMessage(error);
        throw new Error(msg);
      }

      if (data.success) {
        // Invalidate case query to refresh the form
        queryClient.invalidateQueries({ queryKey: ['cases'] });
        queryClient.invalidateQueries({ queryKey: ['case', caseId] });
        
        toast.success(t('cases:fields_extracted', 'Facts and legal question extracted successfully'));
      } else {
        console.error('Extract fields failed:', data.error);
        const msg = typeof data.error === 'string' ? data.error : '';
        const pretty = isNoDataForExtractionMessage(msg)
          ? t('cases:extraction_no_data')
          : msg;
        toast.warning(t('cases:extraction_partial', 'Could not extract all fields: {{error}}', { error: pretty || t('cases:extraction_failed') }));
      }
    } catch (error) {
      console.error('Extract case fields error:', error);
      const msg = error instanceof Error ? error.message : getFunctionsInvokeErrorMessage(error);
      const pretty = isNoDataForExtractionMessage(msg)
        ? t('cases:extraction_no_data')
        : msg;
      toast.error(pretty || t('cases:extraction_failed', 'Failed to extract case fields'));
    }
  };

  const pendingCount = filesToProcess.length;

  if (files.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleProcessAll}
          disabled={isProcessing || pendingCount === 0}
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('ocr:processing', 'Processing')}...
            </>
          ) : (
            <>
              <ScanText className="mr-2 h-4 w-4" />
              <Sparkles className="mr-1 h-3 w-3" />
              {t('cases:process_ocr_extract', 'OCR + Auto-extract')}
            </>
          )}
        </Button>
        {pendingCount > 0 && !isProcessing && (
          <span className="text-xs text-muted-foreground">
            {t('cases:files_pending_ocr', '{{count}} files pending', { count: pendingCount })}
          </span>
        )}
        {pendingCount === 0 && files.length > 0 && unsupportedDocFiles.length === 0 && (
          <span className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            {t('cases:all_files_processed', 'All files processed')}
          </span>
        )}
        {unsupportedDocFiles.length > 0 && (
          <span className="text-xs text-amber-600 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {t('cases:doc_not_supported', '.doc files not supported - convert to DOCX')}
          </span>
        )}
      </div>

      {isProcessing && (
        <div className="space-y-1">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground truncate">
            {currentFile && `${t('ocr:processing', 'Processing')}: ${currentFile}`}
          </p>
        </div>
      )}

      {!isProcessing && results.success + results.failed > 0 && (
        <div className="flex items-center gap-2 text-xs">
          {results.success > 0 && (
            <span className="text-green-600 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              {results.success} {t('common:success', 'success')}
            </span>
          )}
          {results.failed > 0 && (
            <span className="text-red-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {results.failed} {t('common:failed', 'failed')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
