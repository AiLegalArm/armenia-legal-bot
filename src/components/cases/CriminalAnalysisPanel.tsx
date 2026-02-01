import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle, Scale, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

// Analysis module types - aligned with backend analysis_types
type CriminalModule = 
  | "defense_analysis"
  | "prosecution_analysis"
  | "judge_analysis"
  | "aggregator"
  | "evidence_admissibility"
  | "charge_qualification"
  | "procedural_violations"
  | "substantive_law_violations"
  | "fair_trial_and_rights";

interface ModuleResult {
  analysis: string;
  sources: Array<{ title: string; category: string; source_name: string }>;
  timestamp: Date;
  savedId?: string; // Track if already saved
}

interface CriminalAnalysisPanelProps {
  caseId: string;
  caseFacts?: string;
  legalQuestion?: string;
  onAnalysisComplete?: (moduleId: CriminalModule, result: ModuleResult) => void;
}

// Module definitions with Armenian labels - aligned with 9-module system
const MODULES: Array<{
  id: CriminalModule;
  number: number;
  label: string;
  description: string;
}> = [
  {
    id: "defense_analysis",
    number: 1,
    label: "\u054A\u0561\u0577\u057F\u057A\u0561\u0576\u0561\u056F\u0561\u0576 \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
    description: "Defense analysis"
  },
  {
    id: "prosecution_analysis",
    number: 2,
    label: "\u0544\u0565\u0572\u0561\u0564\u0580\u0561\u0576\u0584\u056B \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
    description: "Prosecution analysis"
  },
  {
    id: "judge_analysis",
    number: 3,
    label: "\u0534\u0561\u057F\u0561\u056F\u0561\u0576 \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
    description: "Judicial analysis"
  },
  {
    id: "evidence_admissibility",
    number: 4,
    label: "\u0531\u057A\u0561\u0581\u0578\u0582\u0575\u0581\u0576\u0565\u0580\u056B \u0561\u0576\u0569\u0578\u0582\u0575\u056C\u0561\u057F\u0580\u0565\u056C\u056B\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
    description: "Evidence admissibility and relevance"
  },
  {
    id: "charge_qualification",
    number: 5,
    label: "\u0544\u0565\u0572\u0561\u0564\u0580\u0561\u0576\u0584\u056B \u0570\u0561\u0574\u0561\u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576 \u0570\u0578\u0564\u057E\u0561\u056E\u056B\u0576",
    description: "Charge-article correspondence"
  },
  {
    id: "procedural_violations",
    number: 6,
    label: "\u0534\u0561\u057F\u0561\u057E\u0561\u0580\u0561\u056F\u0561\u0576 \u0576\u0578\u0580\u0574\u0565\u0580\u056B \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580",
    description: "Procedural norm violations"
  },
  {
    id: "substantive_law_violations",
    number: 7,
    label: "\u0546\u0575\u0578\u0582\u0569\u0561\u056F\u0561\u0576 \u0576\u0578\u0580\u0574\u0565\u0580\u056B \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580",
    description: "Substantive norm violations"
  },
  {
    id: "fair_trial_and_rights",
    number: 8,
    label: "\u0531\u0580\u0564\u0561\u0580 \u0564\u0561\u057F\u0561\u0584\u0576\u0576\u0578\u0582\u0569\u0575\u0561\u0576 \u0587 \u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u056B \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580",
    description: "Fair trial and rights violations"
  },
  {
    id: "aggregator",
    number: 9,
    label: "\u0540\u0561\u0574\u0561\u0564\u0580\u057E\u0561\u056E \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
    description: "Aggregated comprehensive analysis"
  }
];

export function CriminalAnalysisPanel({
  caseId,
  caseFacts,
  legalQuestion,
  onAnalysisComplete
}: CriminalAnalysisPanelProps) {
  const { t } = useTranslation(["cases", "ai"]);
  const [loadingModule, setLoadingModule] = useState<CriminalModule | null>(null);
  const [savingModule, setSavingModule] = useState<CriminalModule | null>(null);
  const [results, setResults] = useState<Record<CriminalModule, ModuleResult | null>>({
    defense_analysis: null,
    prosecution_analysis: null,
    judge_analysis: null,
    aggregator: null,
    evidence_admissibility: null,
    charge_qualification: null,
    procedural_violations: null,
    substantive_law_violations: null,
    fair_trial_and_rights: null
  });
  const [expandedModule, setExpandedModule] = useState<CriminalModule | null>(null);
  const [creditsExhausted, setCreditsExhausted] = useState(false);

  const runAnalysis = async (moduleId: CriminalModule) => {
    setLoadingModule(moduleId);
    setCreditsExhausted(false);

    try {
      // Use the new analysis type system - pass role directly instead of criminal_module
      const { data, error } = await supabase.functions.invoke("ai-analyze", {
        body: {
          role: moduleId, // Now moduleId IS the analysis_type (e.g., "defense_analysis")
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
          return;
        }
        throw error;
      }

      if (data.error) {
        if (data.error.includes("402") || data.error.includes("credits")) {
          setCreditsExhausted(true);
          toast.error(t("cases:ai_credits_exhausted"));
          return;
        }
        throw new Error(data.error);
      }

      const result: ModuleResult = {
        analysis: data.analysis,
        sources: data.sources || [],
        timestamp: new Date()
      };

      setResults(prev => ({
        ...prev,
        [moduleId]: result
      }));

      setExpandedModule(moduleId);
      onAnalysisComplete?.(moduleId, result);
      toast.success(t("ai:analysis_complete"));
    } catch (error) {
      console.error("Analysis error:", error);
      toast.error(t("ai:analysis_failed"));
    } finally {
      setLoadingModule(null);
    }
  };

  // Save analysis to database
  const saveAnalysis = async (moduleId: CriminalModule) => {
    const result = results[moduleId];
    if (!result || result.savedId) return;

    setSavingModule(moduleId);
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from("ai_analysis")
        .insert([{
          case_id: caseId,
          role: moduleId as string,
          response_text: result.analysis,
          sources_used: JSON.parse(JSON.stringify(result.sources)),
          created_by: userData?.user?.id || null
        }])
        .select("id")
        .single();

      if (error) throw error;

      // Update local state to mark as saved
      setResults(prev => ({
        ...prev,
        [moduleId]: { ...result, savedId: data.id }
      }));

      toast.success(t("ai:analysis_complete") + " - " + t("ai:save_analysis"));
    } catch (error) {
      console.error("Save analysis error:", error);
      toast.error(t("ai:analysis_failed"));
    } finally {
      setSavingModule(null);
    }
  };

  const getModuleStatus = (moduleId: CriminalModule) => {
    if (loadingModule === moduleId) return "loading";
    if (results[moduleId]) return "complete";
    return "idle";
  };

  const completedCount = Object.values(results).filter(r => r !== null).length;

  return (
    <Card className="w-full">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Scale className="h-5 w-5" />
            <span>{t("cases:criminal_analysis_title", "\u0554\u0580\u0565\u0561\u056F\u0561\u0576 \u0563\u0578\u0580\u056E\u056B \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576")}</span>
          </CardTitle>
          <div className="text-sm text-muted-foreground">
            {completedCount}/9 {t("cases:completed", "\u0561\u057E\u0561\u0580\u057F\u057E\u0561\u056E")}
          </div>
        </div>
        {creditsExhausted && (
          <div className="mt-2 p-2 bg-destructive/10 text-destructive rounded-md text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {t("cases:ai_credits_exhausted")}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Module buttons grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {MODULES.map((module) => {
            const status = getModuleStatus(module.id);
            return (
              <Button
                key={module.id}
                variant={status === "complete" ? "secondary" : "outline"}
                className={`h-auto py-3 px-4 justify-start text-left ${
                  status === "complete" ? "border-green-500/50 bg-green-50 dark:bg-green-950/20" : ""
                }`}
                disabled={loadingModule !== null || creditsExhausted}
                onClick={() => runAnalysis(module.id)}
              >
                <div className="flex items-center gap-3 w-full">
                  <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium ${
                    status === "complete" 
                      ? "bg-green-500 text-white" 
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {status === "loading" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : status === "complete" ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      module.number
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {module.label}
                    </div>
                  </div>
                </div>
              </Button>
            );
          })}
        </div>

        {/* Expanded result view */}
        {expandedModule && results[expandedModule] && (
          <Card className="mt-4 border-primary/20">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {MODULES.find(m => m.id === expandedModule)?.label}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {/* Save Analysis Button */}
                  <Button
                    variant={results[expandedModule]?.savedId ? "secondary" : "default"}
                    size="sm"
                    onClick={() => saveAnalysis(expandedModule)}
                    disabled={savingModule === expandedModule || !!results[expandedModule]?.savedId}
                  >
                    {savingModule === expandedModule ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Save className="h-4 w-4 mr-1" />
                    )}
                    {results[expandedModule]?.savedId 
                      ? t("common:saved", "\u054A\u0561\u0570\u057A\u0561\u0576\u057E\u0561\u056E \u0567") 
                      : t("ai:save_analysis")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedModule(null)}
                  >
                    {t("common:close", "\u0553\u0561\u056F\u0565\u056C")}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>
                  {results[expandedModule]!.analysis}
                </ReactMarkdown>
              </div>
              {results[expandedModule]!.sources.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <div className="text-sm font-medium mb-2">
                    {t("ai:sources_used", "\u0555\u0563\u057F\u0561\u0563\u0578\u0580\u056E\u057E\u0561\u056E \u0561\u0572\u0562\u0575\u0578\u0582\u0580\u0576\u0565\u0580")}:
                  </div>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {results[expandedModule]!.sources.map((source, i) => (
                      <li key={i}>
                        {source.title} ({source.category})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
