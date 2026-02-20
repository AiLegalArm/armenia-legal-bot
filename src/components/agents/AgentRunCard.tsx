import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Play, ChevronDown, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { AgentConfig, AgentAnalysisRun, AgentFinding } from "./types";

interface AgentRunCardProps {
  agent: AgentConfig;
  run?: AgentAnalysisRun;
  isRunning: boolean;
  onRun: () => void;
  disabled: boolean;
}

export function AgentRunCard({ agent, run, isRunning, onRun, disabled }: AgentRunCardProps) {
  const { t, i18n } = useTranslation(["ai"]);
  const lang = i18n.language;

  const getStatusBadge = () => {
    if (isRunning) {
      return (
        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          {t("ai:running")}
        </Badge>
      );
    }
    
    if (!run) {
      return (
        <Badge variant="outline">
          <Clock className="mr-1 h-3 w-3" />
          {t("ai:not_run")}
        </Badge>
      );
    }
    
    switch (run.status) {
      case "completed":
        return (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            {t("ai:completed")}
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" />
            {t("ai:failed")}
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <Clock className="mr-1 h-3 w-3" />
            {run.status}
          </Badge>
        );
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-800 border-red-300";
      case "high":
        return "bg-orange-100 text-orange-800 border-orange-300";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "low":
        return "bg-blue-100 text-blue-800 border-blue-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const findings = (run?.findings || []) as AgentFinding[];

  return (
    <Card className={`${agent.color.replace("bg-", "border-l-4 border-l-")} overflow-hidden w-full min-w-0`}>
      <CardHeader className="pb-2 p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <span className="text-2xl shrink-0">{agent.icon}</span>
            <div className="min-w-0">
              <CardTitle className="text-base break-words">{agent.nameHy}</CardTitle>
              <p className="text-sm text-muted-foreground break-words">{agent.descriptionHy}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {getStatusBadge()}
            <Button
              variant="outline"
              size="sm"
              onClick={onRun}
              disabled={disabled || isRunning}
              className="h-10 w-10 p-0 rounded-lg"
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      
      {run?.status === "completed" && (
        <CardContent className="pt-0 overflow-hidden min-w-0">
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between h-auto py-2">
                <span className="text-sm">
                  {run.summary ? (
                    <span className="line-clamp-1">{run.summary}</span>
                  ) : (
                    t("ai:view_analysis")
                  )}
                </span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-4 pt-2">
                {/* Findings */}
                {findings.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">{t("ai:findings")} ({findings.length})</h4>
                    <div className="space-y-2">
                      {findings.slice(0, 5).map((finding, idx) => (
                        <div 
                          key={idx}
                          className={`p-3 rounded-lg border ${getSeverityColor(finding.severity)}`}
                        >
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <div>
                              <div className="font-medium text-sm">{finding.title}</div>
                              <p className="text-xs mt-1">{finding.description}</p>
                              {finding.legal_basis && finding.legal_basis.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {finding.legal_basis.map((basis, i) => (
                                    <Badge key={i} variant="outline" className="text-xs">
                                      {basis}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {findings.length > 5 && (
                        <p className="text-sm text-muted-foreground text-center">
                          +{findings.length - 5} {t("ai:more_findings")}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Full Analysis */}
                {run.analysis_result && (
                  <div className="min-w-0 overflow-hidden">
                    <h4 className="text-sm font-medium mb-2">{t("ai:full_analysis")}</h4>
                    <div className="h-[500px] overflow-y-auto border rounded-lg p-4">
                      <div className="prose prose-sm max-w-none dark:prose-invert break-words overflow-wrap-anywhere">
                        <ReactMarkdown>{run.analysis_result}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Metadata */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {run.tokens_used && (
                    <span>{run.tokens_used.toLocaleString()} tokens</span>
                  )}
                  {run.completed_at && (
                    <span>
                      {new Date(run.completed_at).toLocaleString(lang === "hy" ? "hy-AM" : "en-US")}
                    </span>
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      )}
      
      {run?.status === "failed" && run.error_message && (
        <CardContent className="pt-0">
          <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg text-sm text-red-800 dark:text-red-200">
            {run.error_message}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
