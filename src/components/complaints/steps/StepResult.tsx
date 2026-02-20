import { useState } from "react";
import { Loader2, Copy, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { exportComplaintToPDF } from "@/lib/pdfExport";

// =============================================================================
// STEP 4: Result Display
// =============================================================================

interface StepResultProps {
  lang: string;
  getText: (hy: string, ru: string, en: string) => string;
  isGenerating: boolean;
  generatedContent: string;
  complaintTypeId?: string;
  onReset: () => void;
}

export function StepResult({
  lang,
  getText,
  isGenerating,
  generatedContent,
  complaintTypeId,
  onReset
}: StepResultProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent);
    toast.success(getText("Պատճենվեց", "Скопировано", "Copied"));
  };

  const handleDownloadPDF = async () => {
    setIsExporting(true);
    try {
      const title = getText("Բողոք / Հայց", "Жалоба / Иск", "Complaint / Claim");
      await exportComplaintToPDF({
        title,
        complaintTypeId,
        content: generatedContent,
        language: lang as "hy" | "ru" | "en",
      });
      toast.success(getText("PDF ֆայլը ներբեռնվեց", "PDF файл скачан", "PDF downloaded"));
    } catch (e) {
      console.error("PDF export error:", e);
      toast.error(getText("Սխալ PDF-ի ստեղծման ժամանակ", "Ошибка при создании PDF", "PDF export error"));
    } finally {
      setIsExporting(false);
    }
  };

  if (isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">
          {getText(
            "AI-ն գեներացնում է բողոքը...",
            "AI генерирует жалобу...",
            "AI is generating your complaint..."
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {getText("Գեներացված բողոք", "Сгенерированная жалоба", "Generated Complaint")}
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            <Copy className="h-4 w-4 mr-1" />
            {getText("Պատճենել", "Копировать", "Copy")}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleDownloadPDF}
            disabled={isExporting}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 mr-1" />
            )}
            {getText("Ներբեռնել PDF", "Скачать PDF", "Download PDF")}
          </Button>
        </div>
      </div>
      <ScrollArea className="h-[400px] border rounded-lg p-4 bg-muted/30">
        <pre className="whitespace-pre-wrap font-sans text-sm">{generatedContent}</pre>
      </ScrollArea>
      <Button variant="outline" onClick={onReset} className="w-full">
        {getText("Նոր բողոք", "Новая жалоба", "New Complaint")}
      </Button>
    </div>
  );
}
