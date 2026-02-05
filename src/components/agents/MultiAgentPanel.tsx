import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Loader2, Play, FileStack, ClipboardList, FileText, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { useMultiAgentAnalysis } from "@/hooks/useMultiAgentAnalysis";
import { AGENT_CONFIGS, type AgentType, type AgentRunStatus } from "./types";
import { VolumeManager } from "./VolumeManager";
import { EvidenceRegistry } from "./EvidenceRegistry";
import { AgentRunCard } from "./AgentRunCard";
import { AggregatedReportView } from "./AggregatedReportView";
import { GenerateComplaintButton } from "./GenerateComplaintButton";

interface MultiAgentPanelProps {
  caseId: string;
  caseFacts?: string;
}

export function MultiAgentPanel({ caseId, caseFacts }: MultiAgentPanelProps) {
  const { t } = useTranslation(["ai", "cases"]);
  const [activeTab, setActiveTab] = useState("volumes");
  
  const {
    isLoading,
    currentAgent,
    runs,
    evidenceRegistry,
    volumes,
    aggregatedReport,
    loadVolumes,
    createVolume,
    updateVolume,
    deleteVolume,
    runAgent,
    runAllAgents,
    loadRuns,
    loadEvidenceRegistry,
    updateEvidenceItem,
    generateAggregatedReport,
    loadAggregatedReport
  } = useMultiAgentAnalysis();

  // Load data on mount
  useEffect(() => {
    loadVolumes(caseId);
    loadRuns(caseId);
    loadEvidenceRegistry(caseId);
    loadAggregatedReport(caseId);
  }, [caseId, loadVolumes, loadRuns, loadEvidenceRegistry, loadAggregatedReport]);

  // Calculate progress
  const completedAgents = runs.filter(r => r.status === "completed").length;
  const totalAgents = AGENT_CONFIGS.length;
  const progress = (completedAgents / totalAgents) * 100;

  const getStatusIcon = (status: AgentRunStatus) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "running":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getAgentRunStatus = (agentType: AgentType): AgentRunStatus | null => {
    const run = runs.find(r => r.agent_type === agentType);
    return run?.status || null;
  };

  return (
    <div className="space-y-4 sm:space-y-6 w-full">
      {/* Header - Premium card */}
      <Card className="card-premium">
        <CardHeader className="pb-4 px-3 sm:px-6">
          <div className="space-y-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base sm:text-xl">
                <span className="text-xl sm:text-2xl shrink-0">🤖</span>
                <span className="break-words">{t("ai:multi_agent_analysis")}</span>
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm mt-2 leading-relaxed">
                {t("ai:multi_agent_description")}
              </CardDescription>
            </div>
            
            {/* Action Buttons - Full width stack */}
            <div className="flex flex-col gap-2 w-full">
              <Button
                onClick={() => runAllAgents(caseId)}
                disabled={isLoading || volumes.length === 0}
                className="h-11 w-full rounded-xl text-xs sm:text-sm font-medium justify-center whitespace-normal text-center"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin shrink-0" />
                    <span className="truncate">
                      {currentAgent && AGENT_CONFIGS.find(a => a.type === currentAgent)?.nameHy}
                    </span>
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4 shrink-0" />
                    <span className="leading-tight">{t("ai:run_all_agents")}</span>
                  </>
                )}
              </Button>
              <GenerateComplaintButton
                caseId={caseId}
                runs={runs}
                evidenceRegistry={evidenceRegistry}
                aggregatedReport={aggregatedReport}
              />
            </div>
          </div>
          
          {/* Progress bar */}
          {completedAgents > 0 && (
            <div className="mt-4 pt-4 border-t border-border/50 space-y-2">
              <div className="flex justify-between text-xs sm:text-sm text-muted-foreground">
                <span>{t("ai:agents_completed")}</span>
                <span className="font-medium">{completedAgents}/{totalAgents}</span>
              </div>
              <Progress value={progress} className="h-2 sm:h-2.5 rounded-full" />
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Agent Status Grid - Horizontal scroll on mobile */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-2">
        <div className="flex gap-2 sm:grid sm:grid-cols-5 lg:grid-cols-9 sm:gap-3 min-w-max sm:min-w-0">
          {AGENT_CONFIGS.map((agent) => {
            const status = getAgentRunStatus(agent.type);
            const isCurrentAgent = currentAgent === agent.type;
            
            return (
              <Card 
                key={agent.type}
                className={`cursor-pointer transition-all duration-200 active:scale-[0.96] w-20 sm:w-auto shrink-0 ${
                  isCurrentAgent ? "ring-2 ring-primary shadow-medium" : ""
                } ${status === "completed" ? "bg-accent/50" : ""}`}
                onClick={() => !isLoading && runAgent(caseId, agent.type)}
              >
                <CardContent className="p-2 sm:p-4 text-center flex flex-col items-center justify-center h-full min-h-[72px]">
                  <div className="text-lg sm:text-2xl mb-1">{agent.icon}</div>
                  <div className="text-[10px] sm:text-xs font-medium truncate w-full" title={agent.nameHy}>
                    {agent.nameHy.split(" ")[0]}
                  </div>
                  <div className="mt-1 flex justify-center">
                    {status ? getStatusIcon(status) : (
                      <div className="h-3 w-3 sm:h-4 sm:w-4 rounded-full bg-muted" />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Main Content Tabs - Touch-friendly */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
          <TabsList className="inline-flex w-max sm:w-full sm:grid sm:grid-cols-4 h-auto p-1 gap-1 rounded-xl bg-muted/50">
            <TabsTrigger value="volumes" className="min-h-[40px] flex items-center gap-1.5 px-3 rounded-lg text-xs sm:text-sm whitespace-nowrap data-[state=active]:shadow-soft">
              <FileStack className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{t("ai:volumes")}</span>
              <Badge variant="secondary" className="text-[10px] px-1.5">{volumes.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="agents" className="min-h-[40px] flex items-center gap-1.5 px-3 rounded-lg text-xs sm:text-sm whitespace-nowrap data-[state=active]:shadow-soft">
              <Play className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{t("ai:agents")}</span>
              <Badge variant="secondary" className="text-[10px] px-1.5">{runs.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="evidence" className="min-h-[40px] flex items-center gap-1.5 px-3 rounded-lg text-xs sm:text-sm whitespace-nowrap data-[state=active]:shadow-soft">
              <ClipboardList className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{t("ai:evidence_registry")}</span>
              <Badge variant="secondary" className="text-[10px] px-1.5">{evidenceRegistry.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="report" className="min-h-[40px] flex items-center gap-1.5 px-3 rounded-lg text-xs sm:text-sm whitespace-nowrap data-[state=active]:shadow-soft">
              <FileText className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{t("ai:report")}</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="volumes" className="mt-4">
          <VolumeManager
            caseId={caseId}
            volumes={volumes}
            onCreateVolume={(data) => createVolume(caseId, data)}
            onUpdateVolume={updateVolume}
            onDeleteVolume={deleteVolume}
          />
        </TabsContent>

        <TabsContent value="agents" className="mt-4">
          <ScrollArea className="h-[600px]">
            <div className="space-y-4">
              {AGENT_CONFIGS.map((agent) => {
                const agentRuns = runs.filter(r => r.agent_type === agent.type);
                const latestRun = agentRuns[0];
                
                return (
                  <AgentRunCard
                    key={agent.type}
                    agent={agent}
                    run={latestRun}
                    isRunning={currentAgent === agent.type}
                    onRun={() => runAgent(caseId, agent.type)}
                    disabled={isLoading}
                  />
                );
              })}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="evidence" className="mt-4">
          <EvidenceRegistry
            caseId={caseId}
            items={evidenceRegistry}
            volumes={volumes}
            onUpdateItem={updateEvidenceItem}
          />
        </TabsContent>

        <TabsContent value="report" className="mt-4">
          <AggregatedReportView
            caseId={caseId}
            report={aggregatedReport}
            runs={runs}
            evidenceCount={evidenceRegistry.length}
            onGenerateReport={() => generateAggregatedReport(caseId)}
            isGenerating={isLoading && currentAgent === "aggregator"}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
