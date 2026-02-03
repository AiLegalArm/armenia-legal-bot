import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Gavel, Scale, Building2, Globe, FileText, Upload, 
  Loader2, X, Check, ChevronRight, ArrowLeft, Sparkles,
  Files, CheckCircle, AlertCircle, Copy, Download, ShieldAlert
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// =============================================================================
// TYPES
// =============================================================================

type ComplaintCategory = "criminal" | "civil" | "administrative" | "anticorruption" | "constitutional" | "echr";

interface ComplaintType {
  id: string;
  labelHy: string;
  labelRu: string;
  labelEn: string;
  category: ComplaintCategory;
  templateId: string;
}

interface UploadedFile {
  id: string;
  file: File;
  status: "pending" | "processing" | "success" | "error";
  extractedText: string;
  errorMessage?: string;
}

interface WizardState {
  step: number;
  category: ComplaintCategory | null;
  complaintType: ComplaintType | null;
  files: UploadedFile[];
  additionalInfo: string;
  isProcessing: boolean;
  isGenerating: boolean;
  generatedContent: string;
}

// =============================================================================
// COMPLAINT TYPES
// =============================================================================

const COMPLAINT_TYPES: ComplaintType[] = [
  // Criminal
  {
    id: "criminal_appeal",
    labelHy: "\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0562\u0578\u0572\u0578\u0584 (\u0584\u0580\u0565\u0561\u056F\u0561\u0576)",
    labelRu: "\u0410\u043F\u0435\u043B\u043B\u044F\u0446\u0438\u043E\u043D\u043D\u0430\u044F \u0436\u0430\u043B\u043E\u0431\u0430 (\u0443\u0433\u043E\u043B\u043E\u0432\u043D\u0430\u044F)",
    labelEn: "Criminal Appeal",
    category: "criminal",
    templateId: "criminal_appeal_cassation"
  },
  {
    id: "criminal_cassation",
    labelHy: "\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0562\u0578\u0572\u0578\u0584 (\u0584\u0580\u0565\u0561\u056F\u0561\u0576)",
    labelRu: "\u041A\u0430\u0441\u0441\u0430\u0446\u0438\u043E\u043D\u043D\u0430\u044F \u0436\u0430\u043B\u043E\u0431\u0430 (\u0443\u0433\u043E\u043B\u043E\u0432\u043D\u0430\u044F)",
    labelEn: "Criminal Cassation",
    category: "criminal",
    templateId: "criminal_appeal_cassation"
  },
  // Civil
  {
    id: "civil_appeal",
    labelHy: "\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0562\u0578\u0572\u0578\u0584 (\u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576)",
    labelRu: "\u0410\u043F\u0435\u043B\u043B\u044F\u0446\u0438\u043E\u043D\u043D\u0430\u044F \u0436\u0430\u043B\u043E\u0431\u0430 (\u0433\u0440\u0430\u0436\u0434\u0430\u043D\u0441\u043A\u0430\u044F)",
    labelEn: "Civil Appeal",
    category: "civil",
    templateId: "civil_appeal"
  },
  {
    id: "civil_cassation",
    labelHy: "\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0562\u0578\u0572\u0578\u0584 (\u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576)",
    labelRu: "\u041A\u0430\u0441\u0441\u0430\u0446\u0438\u043E\u043D\u043D\u0430\u044F \u0436\u0430\u043B\u043E\u0431\u0430 (\u0433\u0440\u0430\u0436\u0434\u0430\u043D\u0441\u043A\u0430\u044F)",
    labelEn: "Civil Cassation",
    category: "civil",
    templateId: "civil_cassation"
  },
  // Administrative
  {
    id: "admin_appeal",
    labelHy: "\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0562\u0578\u0572\u0578\u0584 (\u057E\u0561\u0580\u0579\u0561\u056F\u0561\u0576)",
    labelRu: "\u0410\u043F\u0435\u043B\u043B\u044F\u0446\u0438\u043E\u043D\u043D\u0430\u044F \u0436\u0430\u043B\u043E\u0431\u0430 (\u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u0438\u0432\u043D\u0430\u044F)",
    labelEn: "Administrative Appeal",
    category: "administrative",
    templateId: "administrative_appeal"
  },
  {
    id: "admin_cassation",
    labelHy: "\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0562\u0578\u0572\u0578\u0584 (\u057E\u0561\u0580\u0579\u0561\u056F\u0561\u0576)",
    labelRu: "\u041A\u0430\u0441\u0441\u0430\u0446\u0438\u043E\u043D\u043D\u0430\u044F \u0436\u0430\u043B\u043E\u0431\u0430 (\u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u0438\u0432\u043D\u0430\u044F)",
    labelEn: "Administrative Cassation",
    category: "administrative",
    templateId: "administrative_cassation"
  },
  // Anti-Corruption Court
  {
    id: "anticorruption_appeal",
    labelHy: "\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0562\u0578\u0572\u0578\u0584 (\u0570\u0561\u056F\u0561\u056F\u0578\u057C\u0578\u0582\u057A\u0581\u056B\u0578\u0576)",
    labelRu: "\u0410\u043f\u0435\u043b\u043b\u044f\u0446\u0438\u043e\u043d\u043d\u0430\u044f \u0436\u0430\u043b\u043e\u0431\u0430 (\u0430\u043d\u0442\u0438\u043a\u043e\u0440\u0440\u0443\u043f\u0446\u0438\u043e\u043d\u043d\u0430\u044f)",
    labelEn: "Anti-Corruption Appeal",
    category: "anticorruption",
    templateId: "anticorruption_appeal"
  },
  {
    id: "anticorruption_cassation",
    labelHy: "\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0562\u0578\u0572\u0578\u0584 (\u0570\u0561\u056F\u0561\u056F\u0578\u057C\u0578\u0582\u057A\u0581\u056B\u0578\u0576)",
    labelRu: "\u041a\u0430\u0441\u0441\u0430\u0446\u0438\u043e\u043d\u043d\u0430\u044f \u0436\u0430\u043b\u043e\u0431\u0430 (\u0430\u043d\u0442\u0438\u043a\u043e\u0440\u0440\u0443\u043f\u0446\u0438\u043e\u043d\u043d\u0430\u044f)",
    labelEn: "Anti-Corruption Cassation",
    category: "anticorruption",
    templateId: "anticorruption_cassation"
  },
  // Constitutional Court
  {
    id: "constitutional_complaint",
    labelHy: "\u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576 \u0562\u0578\u0572\u0578\u0584",
    labelRu: "\u041A\u043E\u043D\u0441\u0442\u0438\u0442\u0443\u0446\u0438\u043E\u043D\u043D\u0430\u044F \u0436\u0430\u043B\u043E\u0431\u0430",
    labelEn: "Constitutional Complaint",
    category: "constitutional",
    templateId: "constitutional"
  },
  // ECHR
  {
    id: "echr_application",
    labelHy: "\u0534\u056B\u0574\u0578\u0582\u0574 \u0535\u054D\u054A\u0540",
    labelRu: "\u0417\u0430\u044F\u0432\u043B\u0435\u043D\u0438\u0435 \u0432 \u0415\u0421\u041F\u0427",
    labelEn: "ECHR Application",
    category: "echr",
    templateId: "echr_application"
  },
  {
    id: "echr_rule39",
    labelHy: "\u053F\u0561\u0576\u0578\u0576 39 \u0540\u0561\u0575\u0581",
    labelRu: "\u0425\u043E\u0434\u0430\u0442\u0430\u0439\u0441\u0442\u0432\u043E \u043F\u043E \u041F\u0440\u0430\u0432\u0438\u043B\u0443 39",
    labelEn: "Rule 39 Request",
    category: "echr",
    templateId: "echr_rule_39"
  }
];

const CATEGORY_INFO: Record<ComplaintCategory, { icon: React.ReactNode; colorClass: string }> = {
  criminal: { icon: <Gavel className="h-5 w-5" />, colorClass: "text-red-500" },
  civil: { icon: <Scale className="h-5 w-5" />, colorClass: "text-blue-500" },
  administrative: { icon: <Building2 className="h-5 w-5" />, colorClass: "text-amber-500" },
  anticorruption: { icon: <ShieldAlert className="h-5 w-5" />, colorClass: "text-orange-600" },
  constitutional: { icon: <FileText className="h-5 w-5" />, colorClass: "text-purple-500" },
  echr: { icon: <Globe className="h-5 w-5" />, colorClass: "text-green-500" }
};

// =============================================================================
// COMPONENT
// =============================================================================

interface ComplaintWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComplaintWizard({ open, onOpenChange }: ComplaintWizardProps) {
  const { i18n } = useTranslation();
  const lang = i18n.language;

  const [state, setState] = useState<WizardState>({
    step: 1,
    category: null,
    complaintType: null,
    files: [],
    additionalInfo: "",
    isProcessing: false,
    isGenerating: false,
    generatedContent: ""
  });

  const getLabel = (type: ComplaintType) => {
    if (lang === "hy") return type.labelHy;
    if (lang === "ru") return type.labelRu;
    return type.labelEn;
  };

  const getCategoryLabel = (cat: ComplaintCategory) => {
    const labels: Record<ComplaintCategory, Record<string, string>> = {
      criminal: { hy: "\u0554\u0580\u0565\u0561\u056F\u0561\u0576", ru: "\u0423\u0433\u043E\u043B\u043E\u0432\u043D\u043E\u0435", en: "Criminal" },
      civil: { hy: "\u0554\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576", ru: "\u0413\u0440\u0430\u0436\u0434\u0430\u043D\u0441\u043A\u043E\u0435", en: "Civil" },
      administrative: { hy: "\u054E\u0561\u0580\u0579\u0561\u056F\u0561\u0576", ru: "\u0410\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u0438\u0432\u043D\u043E\u0435", en: "Administrative" },
      anticorruption: { hy: "\u0540\u0561\u056F\u0561\u056F\u0578\u057C\u0578\u0582\u057A\u0581\u056B\u0578\u0576", ru: "\u0410\u043d\u0442\u0438\u043a\u043e\u0440\u0440\u0443\u043f\u0446\u0438\u043e\u043d\u043d\u043e\u0435", en: "Anti-Corruption" },
      constitutional: { hy: "\u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576", ru: "\u041A\u043E\u043D\u0441\u0442\u0438\u0442\u0443\u0446\u0438\u043E\u043D\u043D\u043E\u0435", en: "Constitutional" },
      echr: { hy: "\u0535\u054D\u054A\u0540", ru: "\u0415\u0421\u041F\u0427", en: "ECHR" }
    };
    return labels[cat][lang] || labels[cat].en;
  };

  const getText = (hy: string, ru: string, en: string) => {
    if (lang === "hy") return hy;
    if (lang === "ru") return ru;
    return en;
  };

  // ============ FILE HANDLING ============

  const processFile = useCallback(async (fileState: UploadedFile): Promise<UploadedFile> => {
    const { file } = fileState;
    
    try {
      const isImage = file.type.startsWith("image/");
      const isPdf = file.type === "application/pdf";
      const isText = file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".md");
      const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                     file.name.endsWith(".docx");
      const isOldDoc = file.type === "application/msword" || file.name.endsWith(".doc");

      let text = "";

      if (isText) {
        text = await file.text();
      } else if (isOldDoc) {
        // Old DOC format is not supported - inform user immediately
        const msg =
          lang === "hy" ? "DOC format is not supported. Please save as DOCX or PDF." :
          lang === "ru" ? "Формат DOC не поддерживается. Сохраните как DOCX или PDF." :
          "DOC format is not supported. Please save as DOCX or PDF.";

        toast.error(msg);
        return { ...fileState, status: "error", extractedText: "", errorMessage: msg };
      } else if (isImage || isPdf || isDocx) {
        // All these formats are supported by Gemini Vision
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/complaints/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from("case-files")
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Wait briefly for storage to register the file, then retry signed URL
        let signedUrl: string | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) {
            await new Promise(r => setTimeout(r, 500 * attempt)); // 500ms, 1000ms delays
          }
          const { data: signedUrlData, error: signedUrlError } = await supabase.storage
            .from("case-files")
            .createSignedUrl(fileName, 300);

          if (!signedUrlError && signedUrlData?.signedUrl) {
            signedUrl = signedUrlData.signedUrl;
            break;
          }
          console.log(`Signed URL attempt ${attempt + 1} failed, retrying...`);
        }

        if (!signedUrl) {
          throw new Error("Failed to create signed URL after retries");
        }

        const { data, error } = await supabase.functions.invoke("ocr-process", {
          body: {
            fileUrl: signedUrl,
            fileName: file.name,
            language: lang === "hy" ? "hye" : lang === "ru" ? "rus" : "eng"
          }
        });

        if (error) throw error;
        text = data.text || data.extracted_text || "";

        // Cleanup
        await supabase.storage.from("case-files").remove([fileName]);
      } else {
        throw new Error("Unsupported file type");
      }

      return { ...fileState, status: "success", extractedText: text };
    } catch (error) {
      console.error("File processing error:", error);
      const errorMessage = error instanceof Error ? error.message : "Processing failed";
      // Surface the error to the user (otherwise it looks like "nothing happened")
      toast.error(errorMessage);
      return { ...fileState, status: "error", extractedText: "", errorMessage };
    }
  }, [lang]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const newFiles: UploadedFile[] = [];
    
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      if (file.size > 10 * 1024 * 1024) {
        toast.error(getText(
          "\u0556\u0561\u0575\u056C\u0568 \u0579\u0561\u0583\u0561\u0566\u0561\u0576\u0581 \u0574\u0565\u056E \u0567 (10\u0544\u0532)",
          "\u0424\u0430\u0439\u043B \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0439 (10\u041C\u0411)",
          "File too large (10MB max)"
        ));
        continue;
      }
      
      newFiles.push({
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
        file,
        status: "pending",
        extractedText: ""
      });
    }

    if (newFiles.length === 0) return;

    setState(prev => ({ ...prev, files: [...prev.files, ...newFiles], isProcessing: true }));

    // Process files
    for (const fileState of newFiles) {
      setState(prev => ({
        ...prev,
        files: prev.files.map(f => f.id === fileState.id ? { ...f, status: "processing" } : f)
      }));

      const result = await processFile(fileState);
      
      setState(prev => ({
        ...prev,
        files: prev.files.map(f => f.id === result.id ? result : f)
      }));
    }

    setState(prev => ({ ...prev, isProcessing: false }));
    e.target.value = '';
  }, [processFile, getText]);

  const removeFile = (id: string) => {
    setState(prev => ({ ...prev, files: prev.files.filter(f => f.id !== id) }));
  };

  // ============ GENERATION ============

  const handleGenerate = async () => {
    if (!state.complaintType) {
      toast.error(getText(
        "\u0538\u0576\u057F\u0580\u0565\u0584 \u0562\u0578\u0572\u0578\u0584\u056B \u057F\u0565\u057D\u0561\u056F\u0568",
        "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0442\u0438\u043F \u0436\u0430\u043B\u043E\u0431\u044B",
        "Select complaint type"
      ));
      return;
    }

    const extractedTexts = state.files
      .filter(f => f.status === "success" && f.extractedText)
      .map((f, idx) => `--- ${getText("\u0556\u0561\u0575\u056C", "\u0424\u0430\u0439\u043B", "File")} ${idx + 1}: ${f.file.name} ---\n${f.extractedText}`)
      .join("\n\n");

    if (!extractedTexts && !state.additionalInfo) {
      toast.error(getText(
        "\u054E\u0565\u0580\u0562\u0565\u057C\u0576\u0565\u0584 \u0586\u0561\u0575\u056C\u0565\u0580 \u056F\u0561\u0574 \u0576\u056F\u0561\u0580\u0561\u0563\u0580\u0565\u0584 \u056B\u0580\u0561\u057E\u056B\u0573\u0561\u056F\u0568",
        "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0444\u0430\u0439\u043B\u044B \u0438\u043B\u0438 \u043E\u043F\u0438\u0448\u0438\u0442\u0435 \u0441\u0438\u0442\u0443\u0430\u0446\u0438\u044E",
        "Upload files or describe your situation"
      ));
      return;
    }

    setState(prev => ({ ...prev, isGenerating: true, step: 4 }));

    try {
      const extractedText = [
        extractedTexts,
        state.additionalInfo ? `\n${getText("\u053C\u0580\u0561\u0581\u0578\u0582\u0581\u056B\u0579 \u057F\u0565\u0572\u0565\u056F\u0578\u0582\u0569\u0575\u0578\u0582\u0576", "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F", "Additional information")}:\n${state.additionalInfo}` : ""
      ].filter(Boolean).join("\n\n");

      // Determine court type from complaint type ID
      const complaintId = state.complaintType.id;
      let courtType: 'appellate' | 'cassation' | 'constitutional' | 'echr' | 'anticorruption' = 'appellate';
      
      if (complaintId.includes('anticorruption')) {
        courtType = 'anticorruption';
      } else if (complaintId.includes('cassation')) {
        courtType = 'cassation';
      } else if (complaintId.includes('constitutional')) {
        courtType = 'constitutional';
      } else if (complaintId.includes('echr')) {
        courtType = 'echr';
      }

      // Use the specialized generate-complaint function
      const { data, error } = await supabase.functions.invoke("generate-complaint", {
        body: {
          courtType,
          category: state.category,
          complaintType: getLabel(state.complaintType),
          extractedText,
          language: lang === "hy" ? "hy" : lang === "ru" ? "ru" : "en"
        }
      });

      if (error) throw error;

      if (data?.content) {
        setState(prev => ({ ...prev, generatedContent: data.content, isGenerating: false }));
        toast.success(getText(
          "\u0532\u0578\u0572\u0578\u0584\u0568 \u0570\u0561\u057B\u0578\u0572\u0578\u0582\u0569\u0575\u0561\u0574\u0562 \u0563\u0565\u0576\u0565\u0580\u0561\u0581\u057E\u0565\u0581",
          "\u0416\u0430\u043B\u043E\u0431\u0430 \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u0441\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u0430",
          "Complaint generated successfully"
        ));
      }
    } catch (error) {
      console.error("Generation error:", error);
      setState(prev => ({ ...prev, isGenerating: false }));
      toast.error(getText(
        "\u0533\u0565\u0576\u0565\u0580\u0561\u0581\u0574\u0561\u0576 \u057D\u056D\u0561\u056C",
        "\u041E\u0448\u0438\u0431\u043A\u0430 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438",
        "Generation failed"
      ));
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(state.generatedContent);
    toast.success(getText("\u054A\u0561\u057F\u0573\u0565\u0576\u057E\u0565\u0581", "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u043E", "Copied"));
  };

  const handleDownload = () => {
    const blob = new Blob([state.generatedContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.complaintType?.id || "complaint"}_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setState({
      step: 1,
      category: null,
      complaintType: null,
      files: [],
      additionalInfo: "",
      isProcessing: false,
      isGenerating: false,
      generatedContent: ""
    });
  };

  const goBack = () => {
    if (state.step > 1) {
      setState(prev => ({ ...prev, step: prev.step - 1, generatedContent: "" }));
    }
  };

  // ============ RENDER ============

  const renderStep1 = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">
        {getText(
          "\u0538\u0576\u057F\u0580\u0565\u0584 \u0563\u0578\u0580\u056E\u056B \u057F\u0565\u057D\u0561\u056F\u0568",
          "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0442\u0438\u043F \u0434\u0435\u043B\u0430",
          "Select case type"
        )}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {(["criminal", "civil", "administrative", "anticorruption", "constitutional", "echr"] as ComplaintCategory[]).map((cat) => (
          <button
            key={cat}
            onClick={() => setState(prev => ({ ...prev, category: cat, step: 2 }))}
            className={cn(
              "p-4 rounded-lg border-2 transition-all hover:border-primary hover:bg-accent",
              "flex flex-col items-center gap-2 text-center",
              state.category === cat ? "border-primary bg-accent" : "border-border"
            )}
          >
            <span className={CATEGORY_INFO[cat].colorClass}>{CATEGORY_INFO[cat].icon}</span>
            <span className="font-medium text-sm">{getCategoryLabel(cat)}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderStep2 = () => {
    const types = COMPLAINT_TYPES.filter(t => t.category === state.category);
    
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {getText(
              "\u0538\u0576\u057F\u0580\u0565\u0584 \u0562\u0578\u0572\u0578\u0584\u056B \u057F\u0565\u057D\u0561\u056F\u0568",
              "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0442\u0438\u043F \u0436\u0430\u043B\u043E\u0431\u044B",
              "Select complaint type"
            )}
          </h3>
          {state.category && (
            <Badge variant="outline" className={CATEGORY_INFO[state.category].colorClass}>
              {getCategoryLabel(state.category)}
            </Badge>
          )}
        </div>
        <div className="grid gap-2">
          {types.map((type) => (
            <button
              key={type.id}
              onClick={() => setState(prev => ({ ...prev, complaintType: type, step: 3 }))}
              className={cn(
                "p-3 rounded-lg border transition-all hover:border-primary hover:bg-accent",
                "flex items-center gap-3 text-left",
                state.complaintType?.id === type.id ? "border-primary bg-accent" : "border-border"
              )}
            >
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{getLabel(type)}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderStep3 = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {getText(
            "\u054E\u0565\u0580\u0562\u0565\u057C\u0576\u0565\u0584 \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580\u0568",
            "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B",
            "Upload documents"
          )}
        </h3>
        <Badge variant="secondary">{getLabel(state.complaintType!)}</Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        {getText(
          "\u054E\u0565\u0580\u0562\u0565\u057C\u0576\u0565\u0584 \u0564\u0561\u057F\u0561\u057E\u0573\u056B\u057C, \u0578\u0580\u0578\u0577\u0578\u0582\u0574\u0576\u0565\u0580, \u0561\u057A\u0561\u0581\u0578\u0582\u0575\u0581\u0576\u0565\u0580 \u0587 \u0561\u0575\u056C \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580, \u0578\u0580\u0578\u0576\u0581 AI-\u0576 \u056F\u057E\u0565\u0580\u056C\u0578\u0582\u056E\u056B \u0562\u0578\u0572\u0578\u0584 \u0563\u0565\u0576\u0565\u0580\u0561\u0581\u0576\u0565\u056C\u0578\u0582 \u0570\u0561\u0574\u0561\u0580",
          "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0440\u0435\u0448\u0435\u043D\u0438\u044F \u0441\u0443\u0434\u0430, \u043F\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F, \u0434\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430 \u0438 \u0434\u0440\u0443\u0433\u0438\u0435 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B \u0434\u043B\u044F AI-\u0430\u043D\u0430\u043B\u0438\u0437\u0430",
          "Upload court decisions, rulings, evidence and other documents for AI analysis"
        )}
      </p>

      {/* Upload zone */}
      <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
        <input
          type="file"
          id="complaint-file-upload"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.txt,.md,.docx"
          onChange={handleFileUpload}
          disabled={state.isProcessing}
          multiple
        />
        <label htmlFor="complaint-file-upload" className="cursor-pointer flex flex-col items-center gap-2">
          {state.isProcessing ? (
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          ) : (
            <Files className="h-8 w-8 text-muted-foreground" />
          )}
          <span className="text-sm text-muted-foreground">
            {state.isProcessing 
              ? getText("\u054E\u0565\u0580\u056C\u0578\u0582\u056E\u057E\u0578\u0582\u0574 \u0567...", "\u0410\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u0443\u0435\u043C...", "Analyzing...")
              : getText("PDF, \u057A\u0561\u057F\u056F\u0565\u0580\u0576\u0565\u0580, \u057F\u0565\u0584\u057D\u057F", "PDF, \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F, \u0442\u0435\u043A\u0441\u0442", "PDF, images, text")
            }
          </span>
        </label>
      </div>

      {/* Files list */}
      {state.files.length > 0 && (
        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {state.files.map((f) => (
            <div key={f.id} className="border rounded-lg p-3 bg-muted/30 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  {f.status === "processing" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  {f.status === "success" && <CheckCircle className="h-4 w-4 text-green-500" />}
                  {f.status === "error" && <AlertCircle className="h-4 w-4 text-destructive" />}
                  {f.status === "pending" && <FileText className="h-4 w-4 text-muted-foreground" />}
                  <span className="text-sm truncate">{f.file.name}</span>
                  {f.status === "success" && (
                    <Badge variant="secondary" className="text-xs">{f.extractedText.length} {getText("\u0576\u056B\u0577", "\u0441\u0438\u043C\u0432", "chars")}</Badge>
                  )}
                </div>

                {f.status === "error" && f.errorMessage && (
                  <p className="mt-1 text-xs text-destructive truncate">{f.errorMessage}</p>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeFile(f.id)} className="h-7 w-7">
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Additional info */}
      <div className="space-y-2">
        <Label>
          {getText(
            "\u053C\u0580\u0561\u0581\u0578\u0582\u0581\u056B\u0579 \u057F\u0565\u0572\u0565\u056F\u0578\u0582\u0569\u0575\u0578\u0582\u0576 (\u056F\u0561\u0574\u0568\u0576\u057F\u0580\u0561\u056F\u0561\u0576)",
            "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F (\u043E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E)",
            "Additional information (optional)"
          )}
        </Label>
        <Textarea
          value={state.additionalInfo}
          onChange={(e) => setState(prev => ({ ...prev, additionalInfo: e.target.value }))}
          placeholder={getText(
            "\u0546\u056F\u0561\u0580\u0561\u0563\u0580\u0565\u0584 \u056C\u0580\u0561\u0581\u0578\u0582\u0581\u056B\u0579 \u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584\u0576\u0565\u0580, \u0583\u0561\u057D\u057F\u0565\u0580, \u057A\u0561\u0570\u0561\u0576\u057B\u0576\u0565\u0580...",
            "\u041E\u043F\u0438\u0448\u0438\u0442\u0435 \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043E\u0431\u0441\u0442\u043E\u044F\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430, \u0444\u0430\u043A\u0442\u044B, \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F...",
            "Describe additional circumstances, facts, requirements..."
          )}
          className="min-h-[100px]"
        />
      </div>

      {/* Generate button */}
      <Button 
        onClick={handleGenerate} 
        className="w-full" 
        size="lg"
        disabled={state.isProcessing || (state.files.length === 0 && !state.additionalInfo)}
      >
        <Sparkles className="mr-2 h-4 w-4" />
        {getText(
          "\u0533\u0565\u0576\u0565\u0580\u0561\u0581\u0576\u0565\u056C \u0562\u0578\u0572\u0578\u0584\u0568",
          "\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0436\u0430\u043B\u043E\u0431\u0443",
          "Generate Complaint"
        )}
      </Button>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-4">
      {state.isGenerating ? (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">
            {getText(
              "AI-\u0576 \u0563\u0565\u0576\u0565\u0580\u0561\u0581\u0576\u0578\u0582\u0574 \u0567 \u0562\u0578\u0572\u0578\u0584\u0568...",
              "AI \u0433\u0435\u043D\u0435\u0440\u0438\u0440\u0443\u0435\u0442 \u0436\u0430\u043B\u043E\u0431\u0443...",
              "AI is generating your complaint..."
            )}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              {getText("\u0533\u0565\u0576\u0565\u0580\u0561\u0581\u057E\u0561\u056E \u0562\u0578\u0572\u0578\u0584", "\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u0561\u044F \u0436\u0430\u043B\u043E\u0431\u0430", "Generated Complaint")}
            </h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy}>
                <Copy className="h-4 w-4 mr-1" />
                {getText("\u054A\u0561\u057F\u0573\u0565\u0576\u0565\u056C", "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C", "Copy")}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-1" />
                {getText("\u0546\u0565\u0580\u0562\u0565\u057C\u0576\u0565\u056C", "\u0421\u043A\u0430\u0447\u0430\u0442\u044C", "Download")}
              </Button>
            </div>
          </div>
          <ScrollArea className="h-[400px] border rounded-lg p-4 bg-muted/30">
            <pre className="whitespace-pre-wrap font-sans text-sm">{state.generatedContent}</pre>
          </ScrollArea>
          <Button variant="outline" onClick={reset} className="w-full">
            {getText("\u0546\u0578\u0580 \u0562\u0578\u0572\u0578\u0584", "\u041D\u043E\u0432\u0430\u044F \u0436\u0430\u043B\u043E\u0431\u0430", "New Complaint")}
          </Button>
        </>
      )}
    </div>
  );

  const progress = (state.step / 4) * 100;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {getText(
              "AI \u0532\u0578\u0572\u0578\u0584\u0576\u0565\u0580\u056B \u0587 \u0570\u0561\u0575\u0581\u0565\u0580\u056B \u0563\u0565\u0576\u0565\u0580\u0561\u057F\u0578\u0580",
              "AI \u0433\u0435\u043D\u0435\u0440\u0430\u0442\u043E\u0440 \u0436\u0430\u043B\u043E\u0431 \u0438 \u0438\u0441\u043A\u043E\u0432",
              "AI Complaints & Claims Generator"
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Progress */}
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((step) => (
              <div key={step} className="flex items-center">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                  state.step >= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  {state.step > step ? <Check className="h-3 w-3" /> : step}
                </div>
                {step < 4 && <ChevronRight className={cn("h-3 w-3 mx-1", state.step > step ? "text-primary" : "text-muted-foreground")} />}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 pr-4">
          <div className="py-4">
            {state.step === 1 && renderStep1()}
            {state.step === 2 && renderStep2()}
            {state.step === 3 && renderStep3()}
            {state.step === 4 && renderStep4()}
          </div>
        </ScrollArea>

        {/* Footer */}
        {state.step > 1 && state.step < 4 && (
          <div className="flex justify-start pt-4 border-t">
            <Button variant="ghost" onClick={goBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {getText("\u0540\u0565\u057F", "\u041D\u0430\u0437\u0430\u0434", "Back")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
