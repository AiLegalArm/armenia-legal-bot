import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Check, ChevronRight, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// Internal modules
import type { WizardState, ComplaintCategory, ComplaintType, UploadedFile } from "./types";
import { getComplaintTypeLabel } from "./constants";
import { useComplaintFiles } from "./useComplaintFiles";
import { useComplaintGenerator } from "./useComplaintGenerator";
import { 
  StepCategorySelect, 
  StepComplaintTypeSelect, 
  StepUploadDocuments, 
  StepResult 
} from "./steps";

// =============================================================================
// INITIAL STATE
// =============================================================================

const INITIAL_STATE: WizardState = {
  step: 1,
  category: null,
  complaintType: null,
  files: [],
  additionalInfo: "",
  isProcessing: false,
  isGenerating: false,
  generatedContent: ""
};

// =============================================================================
// COMPLAINT WIZARD COMPONENT
// =============================================================================

interface ComplaintWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComplaintWizard({ open, onOpenChange }: ComplaintWizardProps) {
  const { i18n } = useTranslation();
  const lang = i18n.language;

  const [state, setState] = useState<WizardState>(INITIAL_STATE);

  // Utility function for trilingual text
  const getText = useCallback((hy: string, ru: string, en: string) => {
    if (lang === "hy") return hy;
    if (lang === "ru") return ru;
    return en;
  }, [lang]);

  // File handling hook
  const { handleFileUpload, removeFile } = useComplaintFiles({
    lang,
    getText,
    onFilesChange: (updater) => setState(prev => ({ 
      ...prev, 
      files: typeof updater === "function" ? updater(prev.files) : updater 
    })),
    onProcessingChange: (isProcessing) => setState(prev => ({ ...prev, isProcessing }))
  });

  // Generation hook
  const { handleGenerate } = useComplaintGenerator({
    lang,
    getText,
    onGeneratingChange: (isGenerating) => setState(prev => ({ ...prev, isGenerating })),
    onContentGenerated: (content) => setState(prev => ({ ...prev, generatedContent: content })),
    onStepChange: (step) => setState(prev => ({ ...prev, step }))
  });

  // Navigation handlers
  const handleCategorySelect = (category: ComplaintCategory) => {
    setState(prev => ({ ...prev, category, step: 2 }));
  };

  const handleComplaintTypeSelect = (complaintType: ComplaintType) => {
    setState(prev => ({ ...prev, complaintType, step: 3 }));
  };

  const goBack = () => {
    if (state.step > 1) {
      setState(prev => ({ ...prev, step: prev.step - 1, generatedContent: "" }));
    }
  };

  const reset = () => {
    setState(INITIAL_STATE);
  };

  const onGenerate = () => {
    if (state.complaintType && state.category) {
      handleGenerate({
        complaintType: state.complaintType,
        category: state.category,
        files: state.files,
        additionalInfo: state.additionalInfo
      });
    }
  };

  // Progress calculation
  const progress = (state.step / 4) * 100;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {getText(
              "AI \u0532\u0578\u0572\u0578\u0584\u0576\u0565\u0580\u056B \u0587 \u0570\u0561\u0575\u0581\u0565\u0580\u056B \u0563\u0565\u0576\u0565\u0580\u0561\u057F\u0578\u0580",
              "AI генератор жалоб и исков",
              "AI Complaints & Claims Generator"
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Progress indicator */}
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
                {step < 4 && (
                  <ChevronRight className={cn(
                    "h-3 w-3 mx-1", 
                    state.step > step ? "text-primary" : "text-muted-foreground"
                  )} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <ScrollArea className="flex-1 pr-4">
          <div className="py-4">
            {state.step === 1 && (
              <StepCategorySelect
                lang={lang}
                getText={getText}
                selectedCategory={state.category}
                onSelect={handleCategorySelect}
              />
            )}
            
            {state.step === 2 && state.category && (
              <StepComplaintTypeSelect
                lang={lang}
                getText={getText}
                category={state.category}
                selectedType={state.complaintType}
                onSelect={handleComplaintTypeSelect}
              />
            )}
            
            {state.step === 3 && state.complaintType && (
              <StepUploadDocuments
                lang={lang}
                getText={getText}
                complaintType={state.complaintType}
                files={state.files}
                additionalInfo={state.additionalInfo}
                isProcessing={state.isProcessing}
                onFileUpload={handleFileUpload}
                onRemoveFile={removeFile}
                onAdditionalInfoChange={(val) => setState(prev => ({ ...prev, additionalInfo: val }))}
              />
            )}
            
            {state.step === 4 && (
              <StepResult
                lang={lang}
                getText={getText}
                isGenerating={state.isGenerating}
                generatedContent={state.generatedContent}
                complaintTypeId={state.complaintType?.id}
                onReset={reset}
              />
            )}
          </div>
        </ScrollArea>

        {/* Footer with navigation */}
        {state.step > 1 && state.step < 4 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center pt-4 border-t">
            <Button variant="ghost" onClick={goBack} className="w-full sm:w-auto">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {getText("\u0540\u0565\u057F", "Назад", "Back")}
            </Button>

            {state.step === 3 && (
              <Button
                onClick={onGenerate}
                className="w-full sm:w-auto sm:ml-auto"
                disabled={state.isProcessing || (state.files.length === 0 && !state.additionalInfo)}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {getText(
                  "\u0533\u0565\u0576\u0565\u0580\u0561\u0581\u0576\u0565\u056C \u0562\u0578\u0572\u0578\u0584\u0568",
                  "Сгенерировать жалобу",
                  "Generate Complaint"
                )}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
