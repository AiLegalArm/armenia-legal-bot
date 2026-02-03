import { Loader2, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

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
  
  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent);
    toast.success(getText("\u054A\u0561\u057F\u0573\u0565\u0576\u057E\u0565\u0581", "Скопировано", "Copied"));
  };

  const handleDownload = () => {
    const blob = new Blob([generatedContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${complaintTypeId || "complaint"}_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">
          {getText(
            "AI-\u0576 \u0563\u0565\u0576\u0565\u0580\u0561\u0581\u0576\u0578\u0582\u0574 \u0567 \u0562\u0578\u0572\u0578\u0584\u0568...",
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
          {getText("\u0533\u0565\u0576\u0565\u0580\u0561\u0581\u057E\u0561\u056E \u0562\u0578\u0572\u0578\u0584", "Сгенерированная жалоба", "Generated Complaint")}
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            <Copy className="h-4 w-4 mr-1" />
            {getText("\u054A\u0561\u057F\u0573\u0565\u0576\u0565\u056C", "Копировать", "Copy")}
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-1" />
            {getText("\u0546\u0565\u0580\u0562\u0565\u057C\u0576\u0565\u056C", "Скачать", "Download")}
          </Button>
        </div>
      </div>
      <ScrollArea className="h-[400px] border rounded-lg p-4 bg-muted/30">
        <pre className="whitespace-pre-wrap font-sans text-sm">{generatedContent}</pre>
      </ScrollArea>
      <Button variant="outline" onClick={onReset} className="w-full">
        {getText("\u0546\u0578\u0580 \u0562\u0578\u0572\u0578\u0584", "Новая жалоба", "New Complaint")}
      </Button>
    </div>
  );
}
