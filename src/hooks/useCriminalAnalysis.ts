import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

// Criminal analysis module types
export type CriminalModule = 
  | "evidence_admissibility"
  | "charge_correspondence"
  | "witness_credibility"
  | "procedural_violations"
  | "substantive_violations"
  | "defense_fair_trial"
  | "fundamental_rights"
  | "testimony_contradictions"
  | "legality_of_charges";

export interface ModuleResult {
  moduleId: CriminalModule;
  analysis: string;
  sources: Array<{ title: string; category: string; source_name: string }>;
  timestamp: Date;
}

interface UseCriminalAnalysisReturn {
  isLoading: boolean;
  currentModule: CriminalModule | null;
  results: Record<CriminalModule, ModuleResult | null>;
  creditsExhausted: boolean;
  runModule: (moduleId: CriminalModule, caseId: string, caseFacts?: string, legalQuestion?: string) => Promise<ModuleResult | null>;
  runAllModules: (caseId: string, caseFacts?: string, legalQuestion?: string) => Promise<void>;
  clearResults: () => void;
  getCompletedCount: () => number;
  getAllAnalysisText: () => string;
}

const INITIAL_RESULTS: Record<CriminalModule, ModuleResult | null> = {
  evidence_admissibility: null,
  charge_correspondence: null,
  witness_credibility: null,
  procedural_violations: null,
  substantive_violations: null,
  defense_fair_trial: null,
  fundamental_rights: null,
  testimony_contradictions: null,
  legality_of_charges: null
};

export function useCriminalAnalysis(): UseCriminalAnalysisReturn {
  const { t } = useTranslation(["ai", "cases"]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentModule, setCurrentModule] = useState<CriminalModule | null>(null);
  const [creditsExhausted, setCreditsExhausted] = useState(false);
  const [results, setResults] = useState<Record<CriminalModule, ModuleResult | null>>(INITIAL_RESULTS);

  const runModule = useCallback(async (
    moduleId: CriminalModule,
    caseId: string,
    caseFacts?: string,
    legalQuestion?: string
  ): Promise<ModuleResult | null> => {
    setIsLoading(true);
    setCurrentModule(moduleId);
    setCreditsExhausted(false);

    try {
      const { data, error } = await supabase.functions.invoke("ai-analyze", {
        body: {
          role: "criminal_module",
          moduleId,
          caseId,
          caseFacts,
          legalQuestion
        }
      });

      if (error) {
        const errorMsg = error.message || "";
        if (errorMsg.includes("402") || errorMsg.includes("credits")) {
          setCreditsExhausted(true);
          toast.error(t("cases:ai_credits_exhausted"));
          return null;
        }
        throw error;
      }

      if (data.error) {
        if (data.error.includes("402") || data.error.includes("credits")) {
          setCreditsExhausted(true);
          toast.error(t("cases:ai_credits_exhausted"));
          return null;
        }
        throw new Error(data.error);
      }

      const result: ModuleResult = {
        moduleId,
        analysis: data.analysis,
        sources: data.sources || [],
        timestamp: new Date()
      };

      setResults(prev => ({
        ...prev,
        [moduleId]: result
      }));

      toast.success(t("ai:analysis_complete"));
      return result;
    } catch (error) {
      console.error("Criminal analysis error:", error);
      toast.error(t("ai:analysis_failed"));
      return null;
    } finally {
      setIsLoading(false);
      setCurrentModule(null);
    }
  }, [t]);

  const runAllModules = useCallback(async (
    caseId: string,
    caseFacts?: string,
    legalQuestion?: string
  ): Promise<void> => {
    const modules: CriminalModule[] = [
      "evidence_admissibility",
      "charge_correspondence",
      "witness_credibility",
      "procedural_violations",
      "substantive_violations",
      "defense_fair_trial",
      "fundamental_rights",
      "testimony_contradictions",
      "legality_of_charges"
    ];

    setIsLoading(true);

    // Run modules sequentially to avoid rate limits
    for (const moduleId of modules) {
      if (creditsExhausted) break;
      await runModule(moduleId, caseId, caseFacts, legalQuestion);
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setIsLoading(false);
  }, [runModule, creditsExhausted]);

  const clearResults = useCallback(() => {
    setResults(INITIAL_RESULTS);
    setCreditsExhausted(false);
  }, []);

  const getCompletedCount = useCallback(() => {
    return Object.values(results).filter(r => r !== null).length;
  }, [results]);

  const getAllAnalysisText = useCallback(() => {
    const moduleLabels: Record<CriminalModule, string> = {
      evidence_admissibility: "\u0531\u057A\u0561\u0581\u0578\u0582\u0575\u0581\u0576\u0565\u0580\u056B \u0561\u0576\u0569\u0578\u0582\u0575\u056C\u0561\u057F\u0580\u0565\u056C\u056B\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
      charge_correspondence: "\u0544\u0565\u0572\u0561\u0564\u0580\u0561\u0576\u0584\u056B \u0570\u0561\u0574\u0561\u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576 \u0570\u0578\u0564\u057E\u0561\u056E\u056B\u0576",
      witness_credibility: "\u054E\u056F\u0561\u0575\u056B \u0581\u0578\u0582\u0581\u0574\u0578\u0582\u0576\u0584\u056B \u0561\u0580\u056A\u0561\u0576\u0561\u0570\u0561\u057E\u0561\u057F\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
      procedural_violations: "\u0534\u0561\u057F\u0561\u057E\u0561\u0580\u0561\u056F\u0561\u0576 \u0576\u0578\u0580\u0574\u0565\u0580\u056B \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580",
      substantive_violations: "\u0546\u0575\u0578\u0582\u0569\u0561\u056F\u0561\u0576 \u0576\u0578\u0580\u0574\u0565\u0580\u056B \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580",
      defense_fair_trial: "\u054A\u0561\u0577\u057F\u057A\u0561\u0576\u0578\u0582\u0569\u0575\u0561\u0576 \u0587 \u0561\u0580\u0564\u0561\u0580 \u0564\u0561\u057F\u0561\u0584\u0576\u0576\u0578\u0582\u0569\u0575\u0561\u0576 \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580",
      fundamental_rights: "\u0540\u056B\u0574\u0576\u0561\u0580\u0561\u0580 \u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u056B \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580",
      testimony_contradictions: "\u0551\u0578\u0582\u0581\u0574\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u056B \u0570\u0561\u056F\u0561\u057D\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580",
      legality_of_charges: "\u0544\u0565\u0572\u0561\u0564\u0580\u0561\u0576\u0584\u056B \u0587 \u0563\u0578\u0580\u056E\u056B \u0570\u0561\u0580\u0578\u0582\u0581\u0574\u0561\u0576 \u0585\u0580\u056B\u0576\u0561\u056F\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576"
    };

    let combinedText = "";
    
    for (const [moduleId, result] of Object.entries(results)) {
      if (result) {
        combinedText += `\n\n## ${moduleLabels[moduleId as CriminalModule]}\n\n`;
        combinedText += result.analysis;
      }
    }

    return combinedText.trim();
  }, [results]);

  return {
    isLoading,
    currentModule,
    results,
    creditsExhausted,
    runModule,
    runAllModules,
    clearResults,
    getCompletedCount,
    getAllAnalysisText
  };
}
