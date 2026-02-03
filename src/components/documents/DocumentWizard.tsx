import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Scale, Gavel, Building2, Globe, 
  FileText, Upload, ArrowRight, ArrowLeft,
  Shield, Search, Users, Loader2, X, Check,
  Sparkles, ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// =============================================================================
// TYPES
// =============================================================================

type CaseType = "criminal" | "civil" | "administrative" | "echr";
type LegalPerspective = "defense" | "prosecution" | "court";
type LegalRole = "lawyer" | "prosecutor" | "judge";

interface WizardState {
  step: number;
  caseType: CaseType | null;
  documentType: string | null;
  perspective: LegalPerspective | null;
  inputText: string;
  files: File[];
  extractedText: string;
  requirements: string;
  isExtracting: boolean;
  isGenerating: boolean;
}

interface DocumentTypeOption {
  id: string;
  labelKey: string;
  icon: React.ReactNode;
}

// =============================================================================
// DOCUMENT TYPE MAPPINGS
// =============================================================================

// Только общие юридические документы (без жалоб и исков - они в ComplaintWizard)
const DOCUMENT_TYPES: Record<CaseType, DocumentTypeOption[]> = {
  criminal: [
    { id: "habeas_corpus", labelKey: "habeas_corpus", icon: <Shield className="h-4 w-4" /> },
    { id: "crime_report", labelKey: "crime_report", icon: <FileText className="h-4 w-4" /> },
    { id: "defense_motion", labelKey: "defense_motion", icon: <FileText className="h-4 w-4" /> },
  ],
  civil: [
    { id: "civil_response", labelKey: "civil_response", icon: <FileText className="h-4 w-4" /> },
    { id: "protective_measures", labelKey: "protective_measures", icon: <Shield className="h-4 w-4" /> },
    { id: "deadline_restoration", labelKey: "deadline_restoration", icon: <FileText className="h-4 w-4" /> },
    { id: "expert_examination", labelKey: "expert_examination", icon: <Search className="h-4 w-4" /> },
  ],
  administrative: [
    { id: "complaint_against_act", labelKey: "complaint_against_act", icon: <FileText className="h-4 w-4" /> },
    { id: "complaint_against_inaction", labelKey: "complaint_against_inaction", icon: <FileText className="h-4 w-4" /> },
  ],
  echr: [
    // ECHR документы теперь в AI генераторе жалоб и исков
  ],
};

// Map perspective to role for AI
const PERSPECTIVE_TO_ROLE: Record<LegalPerspective, LegalRole> = {
  defense: "lawyer",
  prosecution: "prosecutor", 
  court: "judge",
};

// =============================================================================
// WIZARD COMPONENT
// =============================================================================

interface DocumentWizardProps {
  onComplete?: (content: string) => void;
  onCancel?: () => void;
  caseData?: {
    id?: string;
    title?: string;
    case_number?: string;
    case_type?: string;
    facts?: string;
    legal_question?: string;
  };
}

export function DocumentWizard({ onComplete, onCancel, caseData }: DocumentWizardProps) {
  const { t, i18n } = useTranslation(["common", "cases"]);
  
  const [state, setState] = useState<WizardState>({
    step: 1,
    caseType: (caseData?.case_type as CaseType) || null,
    documentType: null,
    perspective: "defense",
    inputText: caseData?.facts || "",
    files: [],
    extractedText: "",
    requirements: caseData?.legal_question || "",
    isExtracting: false,
    isGenerating: false,
  });

  // Auto-advance if case type is pre-set
  const effectiveStep = state.step;
  const totalSteps = 4;
  const progress = (effectiveStep / totalSteps) * 100;

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const updateState = useCallback((updates: Partial<WizardState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const handleCaseTypeSelect = (type: CaseType) => {
    updateState({ caseType: type, documentType: null, step: 2 });
  };

  const handleDocumentTypeSelect = (docType: string) => {
    updateState({ documentType: docType, step: 3 });
  };

  const handlePerspectiveSelect = (perspective: LegalPerspective) => {
    updateState({ perspective, step: 4 });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    updateState({ files: [...state.files, ...files], isExtracting: true });

    try {
      // Extract text from files using OCR
      let allExtractedText = state.extractedText;
      
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);

        // Convert to base64 for OCR
        const base64 = await fileToBase64(file);
        
        const { data, error } = await supabase.functions.invoke("ocr-process", {
          body: { 
            imageBase64: base64,
            fileName: file.name,
            mimeType: file.type
          }
        });

        if (!error && data?.text) {
          allExtractedText += `\n\n--- ${file.name} ---\n${data.text}`;
        }
      }

      updateState({ 
        extractedText: allExtractedText.trim(),
        isExtracting: false 
      });
      
      toast.success(t("common:files_processed"));
    } catch (error) {
      console.error("File extraction error:", error);
      updateState({ isExtracting: false });
      toast.error(t("common:extraction_failed"));
    }
  };

  const removeFile = (index: number) => {
    const newFiles = [...state.files];
    newFiles.splice(index, 1);
    updateState({ files: newFiles });
  };

  const handleGenerate = async () => {
    if (!state.documentType) {
      toast.error(t("common:select_document_type"));
      return;
    }

    updateState({ isGenerating: true });

    try {
      const role = state.perspective ? PERSPECTIVE_TO_ROLE[state.perspective] : "lawyer";
      
      // Combine all context
      const contextText = [
        state.inputText,
        state.extractedText,
        state.requirements ? `\nAdditional requirements: ${state.requirements}` : ""
      ].filter(Boolean).join("\n\n");

      const { data, error } = await supabase.functions.invoke("generate-document", {
        body: {
          templateId: state.documentType,
          templateName: state.documentType,
          category: state.caseType || "general",
          role: role,
          language: i18n.language === "hy" ? "hy" : i18n.language === "ru" ? "ru" : "hy",
          sourceText: contextText,
          caseData: caseData ? {
            title: caseData.title,
            case_number: caseData.case_number,
            case_type: caseData.case_type,
            facts: caseData.facts,
            legal_question: caseData.legal_question,
          } : undefined
        }
      });

      if (error) throw error;
      
      if (data?.content) {
        toast.success(t("common:document_generated"));
        onComplete?.(data.content);
      }
    } catch (error) {
      console.error("Generation error:", error);
      toast.error(t("common:generation_failed"));
    } finally {
      updateState({ isGenerating: false });
    }
  };

  const goBack = () => {
    if (state.step > 1) {
      updateState({ step: state.step - 1 });
    }
  };

  const skipToInput = () => {
    updateState({ step: 4 });
  };

  // ==========================================================================
  // RENDER HELPERS
  // ==========================================================================

  const renderStepIndicator = () => (
    <div className="flex items-center gap-2 mb-6">
      {[1, 2, 3, 4].map((step) => (
        <div key={step} className="flex items-center">
          <div
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
              state.step >= step
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            {state.step > step ? <Check className="h-4 w-4" /> : step}
          </div>
          {step < 4 && (
            <ChevronRight className={cn(
              "h-4 w-4 mx-1",
              state.step > step ? "text-primary" : "text-muted-foreground"
            )} />
          )}
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={skipToInput}
        className="ml-auto text-xs text-muted-foreground"
      >
        {t("common:skip_to_input")} →
      </Button>
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">{t("common:select_case_type")}</h3>
      <div className="grid grid-cols-2 gap-3">
        {[
          { type: "criminal" as CaseType, icon: <Gavel className="h-5 w-5" />, color: "text-red-500" },
          { type: "civil" as CaseType, icon: <Scale className="h-5 w-5" />, color: "text-blue-500" },
          { type: "administrative" as CaseType, icon: <Building2 className="h-5 w-5" />, color: "text-amber-500" },
          { type: "echr" as CaseType, icon: <Globe className="h-5 w-5" />, color: "text-purple-500" },
        ].map(({ type, icon, color }) => (
          <button
            key={type}
            onClick={() => handleCaseTypeSelect(type)}
            className={cn(
              "p-4 rounded-lg border-2 transition-all hover:border-primary hover:bg-accent",
              "flex flex-col items-center gap-2 text-center",
              state.caseType === type ? "border-primary bg-accent" : "border-border"
            )}
          >
            <span className={color}>{icon}</span>
            <span className="font-medium">{t(`common:case_type_${type}`)}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderStep2 = () => {
    const docs = state.caseType ? DOCUMENT_TYPES[state.caseType] : [];
    
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{t("common:select_document_type")}</h3>
          <Badge variant="outline">{t(`common:case_type_${state.caseType}`)}</Badge>
        </div>
        <div className="grid gap-2">
          {docs.map((doc) => (
            <button
              key={doc.id}
              onClick={() => handleDocumentTypeSelect(doc.id)}
              className={cn(
                "p-3 rounded-lg border transition-all hover:border-primary hover:bg-accent",
                "flex items-center gap-3 text-left",
                state.documentType === doc.id ? "border-primary bg-accent" : "border-border"
              )}
            >
              {doc.icon}
              <span className="font-medium">{t(`cases:${doc.labelKey}`)}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderStep3 = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">{t("common:select_perspective")}</h3>
      <p className="text-sm text-muted-foreground">{t("common:perspective_hint")}</p>
      <div className="grid gap-3">
        {[
          { 
            perspective: "defense" as LegalPerspective, 
            icon: <Shield className="h-5 w-5" />,
            descKey: "defense_perspective_desc"
          },
          { 
            perspective: "prosecution" as LegalPerspective, 
            icon: <Search className="h-5 w-5" />,
            descKey: "prosecution_perspective_desc"
          },
        ].map(({ perspective, icon, descKey }) => (
          <button
            key={perspective}
            onClick={() => handlePerspectiveSelect(perspective)}
            className={cn(
              "p-4 rounded-lg border-2 transition-all hover:border-primary hover:bg-accent",
              "flex items-start gap-3 text-left",
              state.perspective === perspective ? "border-primary bg-accent" : "border-border"
            )}
          >
            <span className="text-primary mt-0.5">{icon}</span>
            <div>
              <span className="font-medium block">{t(`common:perspective_${perspective}`)}</span>
              <span className="text-sm text-muted-foreground">{t(`common:${descKey}`)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">{t("common:provide_details")}</h3>
      
      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        {state.caseType && (
          <Badge variant="secondary">{t(`common:case_type_${state.caseType}`)}</Badge>
        )}
        {state.documentType && (
          <Badge variant="secondary">{t(`cases:${state.documentType}`)}</Badge>
        )}
        {state.perspective && (
          <Badge variant="outline">{t(`common:perspective_${state.perspective}`)}</Badge>
        )}
      </div>

      {/* Text input */}
      <div className="space-y-2">
        <Label>{t("common:case_description")}</Label>
        <Textarea
          value={state.inputText}
          onChange={(e) => updateState({ inputText: e.target.value })}
          placeholder={t("common:describe_case_placeholder")}
          className="min-h-[120px]"
        />
      </div>

      {/* File upload */}
      <div className="space-y-2">
        <Label>{t("common:upload_files")}</Label>
        <div className="border-2 border-dashed rounded-lg p-4 text-center">
          <input
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.txt,.doc,.docx"
            onChange={handleFileUpload}
            className="hidden"
            id="file-upload"
            disabled={state.isExtracting}
          />
          <label
            htmlFor="file-upload"
            className="cursor-pointer flex flex-col items-center gap-2"
          >
            {state.isExtracting ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground" />
            )}
            <span className="text-sm text-muted-foreground">
              {state.isExtracting ? t("common:extracting") : t("common:drop_files_here")}
            </span>
          </label>
        </div>
        
        {/* File list */}
        {state.files.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {state.files.map((file, idx) => (
              <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {file.name}
                <button onClick={() => removeFile(idx)} className="ml-1 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Extracted text preview */}
        {state.extractedText && (
          <div className="mt-2 p-3 bg-muted rounded-lg">
            <Label className="text-xs text-muted-foreground">{t("common:extracted_text")}</Label>
            <p className="text-sm mt-1 line-clamp-3">{state.extractedText}</p>
          </div>
        )}
      </div>

      {/* Additional requirements */}
      <div className="space-y-2">
        <Label>{t("common:additional_requirements")}</Label>
        <Textarea
          value={state.requirements}
          onChange={(e) => updateState({ requirements: e.target.value })}
          placeholder={t("common:requirements_placeholder")}
          className="min-h-[60px]"
        />
      </div>
    </div>
  );

  // ==========================================================================
  // MAIN RENDER
  // ==========================================================================

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardContent className="p-6">
        {/* Progress */}
        <Progress value={progress} className="h-1 mb-4" />
        
        {/* Step indicator */}
        {renderStepIndicator()}

        {/* Step content */}
        <div className="min-h-[300px]">
          {state.step === 1 && renderStep1()}
          {state.step === 2 && renderStep2()}
          {state.step === 3 && renderStep3()}
          {state.step === 4 && renderStep4()}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-6 pt-4 border-t">
          <div>
            {state.step > 1 && (
              <Button variant="ghost" onClick={goBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t("common:back")}
              </Button>
            )}
            {onCancel && state.step === 1 && (
              <Button variant="ghost" onClick={onCancel}>
                {t("common:cancel")}
              </Button>
            )}
          </div>
          
          <div className="flex gap-2">
            {state.step === 4 && (
              <Button
                onClick={handleGenerate}
                disabled={state.isGenerating || (!state.inputText && !state.extractedText)}
              >
                {state.isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t("common:generating")}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {t("common:generate_document")}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// HELPERS
// =============================================================================

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
  });
}
