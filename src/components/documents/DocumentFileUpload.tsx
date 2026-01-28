import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, FileText, X, CheckCircle, AlertCircle, Files, Image } from "lucide-react";

interface UploadedFileState {
  id: string;
  file: File;
  status: "pending" | "processing" | "success" | "error";
  extractedText: string;
  errorMessage?: string;
}

interface DocumentFileUploadProps {
  onFileAnalyzed: (extractedText: string) => void;
  isDisabled?: boolean;
}

// Helper to convert File to base64
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result); // Return full data URL
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Helper to get MIME type
function getMimeType(file: File): string {
  if (file.type) return file.type;
  
  const ext = file.name.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    'pdf': 'application/pdf',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'tiff': 'image/tiff',
    'tif': 'image/tiff',
    'txt': 'text/plain',
    'md': 'text/markdown',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'doc': 'application/msword'
  };
  
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

export function DocumentFileUpload({ onFileAnalyzed, isDisabled }: DocumentFileUploadProps) {
  const { i18n, t } = useTranslation();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileState[]>([]);

  // Combine all extracted texts and send to parent
  const updateParentWithAllTexts = useCallback((files: UploadedFileState[]) => {
    const combinedText = files
      .filter(f => f.status === "success" && f.extractedText)
      .map((f, idx) => `--- FILE ${idx + 1}: ${f.file.name} ---\n${f.extractedText}`)
      .join("\n\n");
    onFileAnalyzed(combinedText);
  }, [onFileAnalyzed]);

  const processFile = useCallback(async (fileState: UploadedFileState): Promise<UploadedFileState> => {
    const { file } = fileState;
    
    try {
      const fileName = file.name;
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      
      const isImage = ['jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif'].includes(ext);
      const isPdf = ext === 'pdf';
      const isDocx = ext === 'docx';
      const isDoc = ext === 'doc';
      const isText = ['txt', 'md'].includes(ext) || file.type.startsWith("text/");

      let text = "";

      // Handle legacy .doc files
      if (isDoc) {
        return { 
          ...fileState, 
          status: "error", 
          extractedText: "",
          errorMessage: i18n.language === 'hy' 
            ? ".doc delays delays DOCX delays PDF" 
            : i18n.language === 'en' 
            ? "Legacy .doc format not supported. Convert to DOCX or PDF." 
            : "Формат .doc не поддерживается. Конвертируйте в DOCX или PDF."
        };
      }

      // Handle plain text files - read directly
      if (isText) {
        text = await file.text();
      } 
      // Handle images, PDFs, DOCX - send to OCR function with base64
      else if (isImage || isPdf || isDocx) {
        const dataUrl = await fileToBase64(file);
        
        console.log(`Processing ${fileName}: size=${Math.round(dataUrl.length / 1024)}KB`);

        const { data, error } = await supabase.functions.invoke("ocr-process", {
          body: {
            fileUrl: dataUrl,
            fileName: fileName,
            language: i18n.language === "hy" ? "hye" : i18n.language === "ru" ? "rus" : "eng"
          }
        });

        if (error) {
          console.error("OCR error:", error);
          throw new Error(error.message || "OCR processing failed");
        }
        
        if (data?.error) {
          throw new Error(data.error);
        }
        
        // Handle both response formats
        text = data?.extracted_text || data?.text || "";
        
        if (!text) {
          throw new Error("No text extracted from file");
        }
      } else {
        throw new Error("Unsupported file type");
      }

      if (!text.trim()) {
        throw new Error("No text extracted");
      }

      return { ...fileState, status: "success", extractedText: text };
    } catch (error: any) {
      console.error("File processing error:", error);
      return { 
        ...fileState, 
        status: "error", 
        extractedText: "",
        errorMessage: error.message || "Failed to process file"
      };
    }
  }, [i18n.language]);

  const processAllFiles = useCallback(async (newFiles: UploadedFileState[]) => {
    setIsProcessing(true);
    
    const results: UploadedFileState[] = [];
    
    for (let i = 0; i < newFiles.length; i++) {
      // Update status to processing
      setUploadedFiles(prev => prev.map(f => 
        f.id === newFiles[i].id ? { ...f, status: "processing" } : f
      ));
      
      const result = await processFile(newFiles[i]);
      results.push(result);
      
      // Update with result
      setUploadedFiles(prev => {
        const updated = prev.map(f => f.id === result.id ? result : f);
        updateParentWithAllTexts(updated);
        return updated;
      });
    }

    const successCount = results.filter(r => r.status === "success").length;
    const errorCount = results.filter(r => r.status === "error").length;

    if (successCount > 0) {
      toast({
        title: i18n.language === 'hy' ? " Delays delays" : 
               i18n.language === 'en' ? "Files analyzed" : "Файлы проанализированы",
        description: i18n.language === 'hy' ? `${successCount} delays delays` : 
                     i18n.language === 'en' ? `${successCount} file(s) processed` : 
                     `${successCount} файл(ов) обработано`,
      });
    }

    if (errorCount > 0) {
      toast({
        title: i18n.language === 'hy' ? "Որոdelays delays" : 
               i18n.language === 'en' ? "Some files failed" : "Ошибка обработки",
        description: i18n.language === 'hy' ? `${errorCount} delays delays` : 
                     i18n.language === 'en' ? `${errorCount} file(s) failed` : 
                     `${errorCount} файл(ов) не обработано`,
        variant: "destructive",
      });
    }

    setIsProcessing(false);
  }, [processFile, updateParentWithAllTexts, toast, i18n.language]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const newFileStates: UploadedFileState[] = [];
    
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      
      // Check file size (15MB limit for base64)
      if (file.size > 15 * 1024 * 1024) {
        toast({
          title: i18n.language === 'hy' ? "Ֆdelays delay" : 
                 i18n.language === 'en' ? "File too large" : "Файл слишком большой",
          description: `${file.name}: max 15MB`,
          variant: "destructive",
        });
        continue;
      }
      
      newFileStates.push({
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
        file,
        status: "pending",
        extractedText: ""
      });
    }

    if (newFileStates.length > 0) {
      setUploadedFiles(prev => [...prev, ...newFileStates]);
      processAllFiles(newFileStates);
    }

    // Reset input
    e.target.value = '';
  }, [processAllFiles, toast, i18n.language]);

  const handleRemoveFile = useCallback((id: string) => {
    setUploadedFiles(prev => {
      const updated = prev.filter(f => f.id !== id);
      updateParentWithAllTexts(updated);
      return updated;
    });
  }, [updateParentWithAllTexts]);

  const handleClearAll = useCallback(() => {
    setUploadedFiles([]);
    onFileAnalyzed("");
  }, [onFileAnalyzed]);

  const successCount = uploadedFiles.filter(f => f.status === "success").length;
  const totalChars = uploadedFiles
    .filter(f => f.status === "success")
    .reduce((sum, f) => sum + f.extractedText.length, 0);

  // Labels based on language
  const labels = {
    uploadLabel: i18n.language === 'hy' 
      ? "Կdelays delays delays AI-delays" 
      : i18n.language === 'en' 
      ? "Or upload documents for AI analysis" 
      : "Или загрузите документы для AI-анализа",
    dropzone: i18n.language === 'hy' 
      ? "PDF, delays, delays" 
      : i18n.language === 'en' 
      ? "PDF, images, text" 
      : "PDF, изображения, текст",
    supports: i18n.language === 'hy' 
      ? "Աdelays PDF, JPG, PNG, DOCX" 
      : i18n.language === 'en' 
      ? "Supports PDF, JPG, PNG, DOCX" 
      : "Поддержка PDF, JPG, PNG, DOCX",
    files: i18n.language === 'hy' ? " delays" : i18n.language === 'en' ? "file(s)" : "файл(ов)",
    chars: i18n.language === 'hy' ? "delays" : i18n.language === 'en' ? "chars" : "симв",
    clearAll: i18n.language === 'hy' ? "delays" : i18n.language === 'en' ? "Clear all" : "Очистить",
    waiting: i18n.language === 'hy' ? "delays..." : i18n.language === 'en' ? "Waiting..." : "Ожидание...",
    analyzing: i18n.language === 'hy' ? "delays..." : i18n.language === 'en' ? "Analyzing..." : "Анализ...",
    failed: i18n.language === 'hy' ? "delays" : i18n.language === 'en' ? "Failed" : "Ошибка"
  };

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2">
        <Upload className="h-4 w-4" />
        {labels.uploadLabel}
      </Label>

      {/* Upload Zone */}
      <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
        <input
          type="file"
          id="document-upload-multi"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff,.tif,.txt,.md,.docx"
          onChange={handleFileSelect}
          disabled={isDisabled || isProcessing}
          multiple
        />
        <label
          htmlFor="document-upload-multi"
          className="cursor-pointer flex flex-col items-center gap-2"
        >
          <Files className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {labels.dropzone}
          </span>
          <span className="text-xs text-muted-foreground/70 flex items-center gap-1">
            <Image className="h-3 w-3" />
            {labels.supports}
          </span>
        </label>
      </div>

      {/* Files List */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Files className="h-3 w-3" />
              {uploadedFiles.length} {labels.files}
              {successCount > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {totalChars} {labels.chars}
                </Badge>
              )}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              disabled={isProcessing}
              className="text-xs h-7"
            >
              <X className="h-3 w-3 mr-1" />
              {labels.clearAll}
            </Button>
          </div>

          <div className="max-h-[200px] overflow-y-auto space-y-2">
            {uploadedFiles.map((fileState) => (
              <div
                key={fileState.id}
                className="border rounded-lg p-3 bg-muted/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {fileState.status === "processing" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                    ) : fileState.status === "success" ? (
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                    ) : fileState.status === "error" ? (
                      <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{fileState.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {fileState.status === "pending" && labels.waiting}
                        {fileState.status === "processing" && labels.analyzing}
                        {fileState.status === "success" && (
                          <>{fileState.extractedText.length} {labels.chars}</>
                        )}
                        {fileState.status === "error" && (
                          <span className="text-destructive">
                            {fileState.errorMessage || labels.failed}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveFile(fileState.id)}
                    disabled={fileState.status === "processing"}
                    className="flex-shrink-0 h-7 w-7"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>

                {/* Preview extracted text */}
                {fileState.status === "success" && fileState.extractedText && (
                  <div className="mt-2 pt-2 border-t">
                    <p className="text-xs text-muted-foreground bg-background/50 rounded p-2 max-h-16 overflow-auto whitespace-pre-wrap">
                      {fileState.extractedText.slice(0, 200)}
                      {fileState.extractedText.length > 200 && "..."}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
