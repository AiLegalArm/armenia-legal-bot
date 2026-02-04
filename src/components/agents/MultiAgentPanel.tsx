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
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3 px-3 sm:px-6">
          <div className="space-y-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <span className="text-xl sm:text-2xl">{"\ud83e\udd16"}</span>
                <span className="truncate">{t("ai:multi_agent_analysis")}</span>
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm mt-1">
                {t("ai:multi_agent_description")}
              </CardDescription>
            </div>
            
            {/* Action Buttons - Stack on mobile */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={() => runAllAgents(caseId)}
                disabled={isLoading || volumes.length === 0}
                size="default"
                className="w-full sm:w-auto order-1 sm:order-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <span className="truncate">
                      {currentAgent && AGENT_CONFIGS.find(a => a.type === currentAgent)?.nameHy}
                    </span>
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4 flex-shrink-0" />
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
          
          {/* Progress bar */}
          {completedAgents > 0 && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs sm:text-sm text-muted-foreground">
                <span>{t("ai:agents_completed")}</span>
                <span>{completedAgents}/{totalAgents}</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Agent Status Grid - Scrollable on mobile */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2 min-w-[320px]">
          {AGENT_CONFIGS.map((agent) => {
            const status = getAgentRunStatus(agent.type);
            const isCurrentAgent = currentAgent === agent.type;
            
            return (
              <Card 
                key={agent.type}
                className={`cursor-pointer transition-all active:scale-95 ${
                  isCurrentAgent ? "ring-2 ring-primary" : ""
                } ${status === "completed" ? "bg-green-50 dark:bg-green-950/20" : ""}`}
                onClick={() => !isLoading && runAgent(caseId, agent.type)}
              >
                <CardContent className="p-2 sm:p-3 text-center">
                  <div className="text-lg sm:text-2xl mb-1">{agent.icon}</div>
                  <div className="text-[10px] sm:text-xs font-medium truncate" title={agent.nameHy}>
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

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 h-auto p-1">
          <TabsTrigger value="volumes" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-2 px-1 sm:px-3 text-xs sm:text-sm">
            <FileStack className="h-4 w-4 flex-shrink-0" />
            <span className="hidden xs:inline truncate">{t("ai:volumes")}</span>
            <Badge variant="secondary" className="text-[10px] sm:text-xs px-1 sm:px-2">{volumes.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="agents" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-2 px-1 sm:px-3 text-xs sm:text-sm">
            <Play className="h-4 w-4 flex-shrink-0" />
            <span className="hidden xs:inline truncate">{t("ai:agents")}</span>
            <Badge variant="secondary" className="text-[10px] sm:text-xs px-1 sm:px-2">{runs.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="evidence" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-2 px-1 sm:px-3 text-xs sm:text-sm">
            <ClipboardList className="h-4 w-4 flex-shrink-0" />
            <span className="hidden xs:inline truncate">{t("ai:evidence_registry")}</span>
            <Badge variant="secondary" className="text-[10px] sm:text-xs px-1 sm:px-2">{evidenceRegistry.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="report" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-2 px-1 sm:px-3 text-xs sm:text-sm">
            <FileText className="h-4 w-4 flex-shrink-0" />
            <span className="hidden xs:inline truncate">{t("ai:report")}</span>
          </TabsTrigger>
        </TabsList>

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
