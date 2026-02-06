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
    <div className="space-y-3 sm:space-y-4 w-full">
      {/* Header - Compact card */}
      <Card className="card-premium">
        <CardHeader className="pb-3 px-3 sm:px-4 pt-3 sm:pt-4">
          <div className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <span className="text-base sm:text-lg shrink-0">🤖</span>
              <span className="break-words">{t("ai:multi_agent_analysis")}</span>
            </CardTitle>
            <CardDescription className="text-[11px] sm:text-xs leading-relaxed">
              {t("ai:multi_agent_description")}
            </CardDescription>
            
            {/* Action Buttons - Compact */}
            <div className="flex gap-2 w-full pt-1">
              <Button
                onClick={() => runAllAgents(caseId)}
                disabled={isLoading || volumes.length === 0}
                size="sm"
                className="flex-1 h-8 sm:h-9 rounded-lg text-[11px] sm:text-xs font-medium"
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 mr-1" />
                    <span className="truncate">{t("ai:run_all_agents")}</span>
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
          
          {/* Progress bar - More compact */}
          {completedAgents > 0 && (
            <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
              <div className="flex justify-between text-[10px] sm:text-xs text-muted-foreground">
                <span>{t("ai:agents_completed")}</span>
                <span className="font-medium">{completedAgents}/{totalAgents}</span>
              </div>
              <Progress value={progress} className="h-1.5 sm:h-2 rounded-full" />
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Agent Status Grid - Compact horizontal scroll */}
      <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 pb-1">
        <div className="flex gap-1.5 sm:grid sm:grid-cols-5 lg:grid-cols-9 sm:gap-2 min-w-max sm:min-w-0">
          {AGENT_CONFIGS.map((agent) => {
            const status = getAgentRunStatus(agent.type);
            const isCurrentAgent = currentAgent === agent.type;
            
            return (
              <Card 
                key={agent.type}
                className={`cursor-pointer transition-all duration-200 active:scale-[0.96] w-14 sm:w-auto shrink-0 ${
                  isCurrentAgent ? "ring-1.5 ring-primary shadow-sm" : ""
                } ${status === "completed" ? "bg-accent/50" : ""}`}
                onClick={() => !isLoading && runAgent(caseId, agent.type)}
              >
                <CardContent className="p-1.5 sm:p-2 text-center flex flex-col items-center justify-center h-full min-h-[52px] sm:min-h-[60px]">
                  <div className="text-sm sm:text-lg mb-0.5">{agent.icon}</div>
                  <div className="text-[8px] sm:text-[10px] font-medium truncate w-full leading-tight" title={agent.nameHy}>
                    {agent.nameHy.split(" ")[0]}
                  </div>
                  <div className="mt-0.5 flex justify-center">
                    {status ? getStatusIcon(status) : (
                      <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-muted" />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Main Content Tabs - Compact */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="-mx-3 px-3 sm:mx-0 sm:px-0 overflow-x-auto">
          <TabsList className="inline-flex w-max sm:w-full sm:grid sm:grid-cols-4 h-auto p-0.5 gap-0.5 rounded-lg bg-muted/50">
            <TabsTrigger value="volumes" className="min-h-[32px] sm:min-h-[36px] flex items-center gap-1 px-2 sm:px-3 rounded-md text-[10px] sm:text-xs whitespace-nowrap data-[state=active]:shadow-soft">
              <FileStack className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
              <Badge variant="secondary" className="text-[9px] px-1 h-4">{volumes.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="agents" className="min-h-[32px] sm:min-h-[36px] flex items-center gap-1 px-2 sm:px-3 rounded-md text-[10px] sm:text-xs whitespace-nowrap data-[state=active]:shadow-soft">
              <Play className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
              <Badge variant="secondary" className="text-[9px] px-1 h-4">{runs.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="evidence" className="min-h-[32px] sm:min-h-[36px] flex items-center gap-1 px-2 sm:px-3 rounded-md text-[10px] sm:text-xs whitespace-nowrap data-[state=active]:shadow-soft">
              <ClipboardList className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
              <Badge variant="secondary" className="text-[9px] px-1 h-4">{evidenceRegistry.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="report" className="min-h-[32px] sm:min-h-[36px] flex items-center gap-1 px-2 sm:px-3 rounded-md text-[10px] sm:text-xs whitespace-nowrap data-[state=active]:shadow-soft">
              <FileText className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
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
