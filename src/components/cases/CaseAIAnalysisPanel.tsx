import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAIAnalysis, type AIRole } from '@/hooks/useAIAnalysis';
import { useToast } from '@/hooks/use-toast';
import { FeedbackStars } from '@/components/FeedbackStars';
import { PdfExportButton } from '@/components/PdfExportButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { exportAnalysisToPDF, exportMultipleAnalysesToPDF } from '@/lib/pdfExport';
import { Loader2, Brain, Download, FileSignature, Save, AlertTriangle, Check } from 'lucide-react';

interface CaseAIAnalysisPanelProps {
  caseId: string;
  facts?: string | null;
  legalQuestion?: string | null;
  caseNumber: string;
  caseTitle: string;
  aiCreditsExhausted: boolean;
  onOpenComplaintGenerator: () => void;
}

export function CaseAIAnalysisPanel({
  caseId,
  facts,
  legalQuestion,
  caseNumber,
  caseTitle,
  aiCreditsExhausted,
  onOpenComplaintGenerator
}: CaseAIAnalysisPanelProps) {
  const { t, i18n } = useTranslation(['ai', 'cases', 'common', 'disclaimer', 'errors']);
  const { user } = useAuth();
  const { toast } = useToast();
  
  const {
    isLoading: isAnalyzing,
    currentRole,
    results,
    analyzeCase,
    clearResults,
    loadResults
  } = useAIAnalysis();
  
  const [enabledRoles, setEnabledRoles] = useState({
    advocate: true,
    prosecutor: true,
    judge: true,
  });
  
  const [savingAnalysisRole, setSavingAnalysisRole] = useState<AIRole | null>(null);
  const [savedAnalysisRoles, setSavedAnalysisRoles] = useState<Set<AIRole>>(new Set());
  const [loadingSavedAnalyses, setLoadingSavedAnalyses] = useState(false);

  // Load previously saved analyses
  useEffect(() => {
    const loadSavedAnalyses = async () => {
      setLoadingSavedAnalyses(true);
      try {
        const { data, error } = await supabase
          .from('ai_analysis')
          .select('id, role, response_text, sources_used, created_at')
          .eq('case_id', caseId)
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (data && data.length > 0) {
          const latestByRole = new Map<string, typeof data[0]>();
          for (const item of data) {
            if (!latestByRole.has(item.role)) {
              latestByRole.set(item.role, item);
            }
          }

          const savedRolesSet = new Set<AIRole>();
          const loadedResults: Partial<Record<AIRole, { role: AIRole; analysis: string; sources: Array<{ title: string; category: string; source_name: string }>; model: string } | null>> = {};
          
          latestByRole.forEach((item, role) => {
            const validRoles: AIRole[] = ['advocate', 'prosecutor', 'judge', 'aggregator'];
            if (validRoles.includes(role as AIRole)) {
              savedRolesSet.add(role as AIRole);
              const sources = Array.isArray(item.sources_used)
                ? (item.sources_used as Array<{ title: string; category: string; source_name: string }>)
                : [];
              loadedResults[role as AIRole] = {
                role: role as AIRole,
                analysis: item.response_text,
                sources,
                model: 'loaded'
              };
            }
          });

          loadResults(loadedResults);
          setSavedAnalysisRoles(savedRolesSet);
        }
      } catch (error) {
        console.error('Failed to load saved analyses:', error);
      } finally {
        setLoadingSavedAnalyses(false);
      }
    };

    loadSavedAnalyses();
  }, [caseId, loadResults]);

  const handleSaveAnalysis = useCallback(async (role: AIRole) => {
    if (!results[role]) return;
    
    setSavingAnalysisRole(role);
    try {
      const { error } = await supabase.from('ai_analysis').insert({
        case_id: caseId,
        role,
        response_text: results[role]!.analysis,
        sources_used: results[role]!.sources as unknown as Database['public']['Tables']['ai_analysis']['Insert']['sources_used'],
        created_by: user?.id,
      });
      
      if (error) throw error;
      
      setSavedAnalysisRoles(prev => new Set(prev).add(role));
      toast({ title: t('ai:feedback_submit_success') });
    } catch (error) {
      console.error('Save analysis error:', error);
      toast({ title: t('errors:operation_failed'), variant: 'destructive' });
    } finally {
      setSavingAnalysisRole(null);
    }
  }, [caseId, results, user?.id, toast, t]);

  const handleStartAnalysis = async () => {
    const canRunAggregator = enabledRoles.advocate && enabledRoles.prosecutor && enabledRoles.judge;
    
    const rolesToRun: AIRole[] = [];
    if (enabledRoles.advocate) rolesToRun.push('advocate');
    if (enabledRoles.prosecutor) rolesToRun.push('prosecutor');
    if (enabledRoles.judge) rolesToRun.push('judge');
    
    if (rolesToRun.length === 0) {
      toast({
        title: i18n.language === 'hy' ? '\u0538\u0576\u057F\u0580\u0565\u0584 \u0563\u0578\u0576\u0565 \u0574\u0565\u056F \u0564\u0565\u0580' 
             : i18n.language === 'en' ? 'Select at least one role' 
             : '\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u043D\u0443 \u0440\u043E\u043B\u044C',
        variant: 'destructive'
      });
      return;
    }
    
    for (const role of rolesToRun) {
      await analyzeCase(role, caseId, facts, legalQuestion || '');
    }
    
    if (canRunAggregator) {
      await analyzeCase('aggregator', caseId, facts, legalQuestion || '');
    }
  };

  const handleExportSingleAnalysis = async (role: AIRole) => {
    if (!results[role]) return;
    
    await exportAnalysisToPDF({
      caseNumber,
      caseTitle,
      role,
      analysisText: results[role]!.analysis,
      sources: results[role]!.sources,
      createdAt: new Date(),
      language: 'hy'
    });
  };

  const handleExportAllAnalyses = async () => {
    const analyses = Object.entries(results)
      .filter((entry): entry is [string, NonNullable<typeof results[keyof typeof results]>] => entry[1] !== null)
      .map(([role, result]) => ({
        role,
        text: result.analysis,
        sources: result.sources
      }));
    
    if (analyses.length === 0) return;
    
    await exportMultipleAnalysesToPDF(caseNumber, caseTitle, analyses, 'hy');
  };
  
  const canEnableAggregator = enabledRoles.advocate && enabledRoles.prosecutor && enabledRoles.judge;

  return (
    <div className="space-y-4">
      {aiCreditsExhausted && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{t('cases:ai_credits_exhausted_analysis')}</AlertDescription>
        </Alert>
      )}
      
      {/* AI Warning */}
      <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
        <p className="text-sm text-amber-700 dark:text-amber-400">
          \u26A0\uFE0F {t('disclaimer:ai_warning')}
        </p>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between flex-wrap gap-2">
            <span>{t('ai:analyze')}</span>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={onOpenComplaintGenerator}>
                <FileSignature className="mr-2 h-4 w-4" />
                {i18n.language === 'hy' ? '\u0532\u0578\u0572\u0578\u0584' : i18n.language === 'en' ? 'Complaint' : '\u0416\u0430\u043B\u043E\u0431\u0430'}
              </Button>
              {Object.values(results).some(r => r !== null) && (
                <>
                  <Button variant="outline" size="sm" onClick={clearResults}>
                    {t('common:clear', 'Clear')}
                  </Button>
                  <PdfExportButton onClick={handleExportAllAnalyses} />
                </>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!Object.values(results).some(r => r !== null) ? (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                {t('ai:analysis_placeholder', 'AI analysis will appear here')}
              </p>
              
              {/* Role Toggle Switches */}
              <div className="mb-6 p-4 rounded-lg border bg-muted/30">
                <p className="text-sm font-medium mb-3">
                  {i18n.language === 'hy' ? '\u054E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0561\u0576 \u0564\u0565\u0580\u0565\u0580' 
                   : i18n.language === 'en' ? 'Analysis Roles' 
                   : '\u0420\u043E\u043B\u0438 \u0430\u043D\u0430\u043B\u0438\u0437\u0430'}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="role-prosecutor"
                      checked={enabledRoles.prosecutor}
                      onCheckedChange={(checked) => setEnabledRoles(prev => ({ ...prev, prosecutor: checked }))}
                    />
                    <Label htmlFor="role-prosecutor" className="text-sm cursor-pointer">
                      {i18n.language === 'hy' ? '\u0544\u0565\u0572\u0561\u0564\u0580\u0578\u0572' : i18n.language === 'en' ? 'Prosecutor' : '\u041F\u0440\u043E\u043A\u0443\u0440\u043E\u0440'}
                    </Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="role-judge"
                      checked={enabledRoles.judge}
                      onCheckedChange={(checked) => setEnabledRoles(prev => ({ ...prev, judge: checked }))}
                    />
                    <Label htmlFor="role-judge" className="text-sm cursor-pointer">
                      {i18n.language === 'hy' ? '\u0534\u0561\u057F\u0561\u057E\u0578\u0580' : i18n.language === 'en' ? 'Judge' : '\u0421\u0443\u0434\u044C\u044F'}
                    </Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="role-aggregator"
                      checked={canEnableAggregator}
                      disabled={true}
                      className={!canEnableAggregator ? 'opacity-50' : ''}
                    />
                    <Label 
                      htmlFor="role-aggregator" 
                      className={`text-sm ${!canEnableAggregator ? 'text-muted-foreground' : 'cursor-pointer'}`}
                    >
                      {i18n.language === 'hy' ? '\u0531\u0563\u0580\u0565\u0563\u0561\u057F\u0578\u0580' : i18n.language === 'en' ? 'Aggregator' : '\u0410\u0433\u0440\u0435\u0433\u0430\u0442\u043E\u0440'}
                    </Label>
                  </div>
                </div>
                
                {!canEnableAggregator && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                    {i18n.language === 'hy' 
                      ? '\u0531\u0563\u0580\u0565\u0563\u0561\u057F\u0578\u0580\u0568 \u0570\u0561\u057D\u0561\u0576\u0565\u056C\u056B \u0567 \u0574\u056B\u0561\u0575\u0576 \u0561\u0575\u0576 \u0564\u0565\u057A\u0584\u0578\u0582\u0574, \u0565\u0580\u0562 \u0562\u0578\u056C\u0578\u0580 \u0564\u0565\u0580\u0565\u0580\u0568 \u0574\u056B\u0561\u0581\u057E\u0561\u056E \u0565\u0576' 
                      : i18n.language === 'en' 
                        ? 'Aggregator is only available when all roles are enabled' 
                        : '\u0410\u0433\u0440\u0435\u0433\u0430\u0442\u043E\u0440 \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u043A\u043E\u0433\u0434\u0430 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u044B \u0432\u0441\u0435 \u0440\u043E\u043B\u0438'}
                  </p>
                )}
              </div>
              
              <Button className="w-full" onClick={handleStartAnalysis} disabled={isAnalyzing}>
                {isAnalyzing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('ai:analyzing', 'Analyzing')} {currentRole ? `(${currentRole})` : ''}...
                  </>
                ) : (
                  <>
                    <Brain className="mr-2 h-4 w-4" />
                    {t('ai:start_analysis', 'Start Analysis')}
                  </>
                )}
              </Button>
            </>
          ) : (
            <div className="space-y-6">
              {(['advocate', 'prosecutor', 'judge', 'aggregator'] as AIRole[]).map((role) => {
                const result = results[role];
                if (!result) return null;
                
                return (
                  <div key={role} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <h3 className="font-semibold text-lg capitalize">{role}</h3>
                      <div className="flex gap-2">
                        <Button 
                          variant={savedAnalysisRoles.has(role) ? "secondary" : "default"}
                          size="sm"
                          onClick={() => handleSaveAnalysis(role)}
                          disabled={savingAnalysisRole === role || savedAnalysisRoles.has(role)}
                        >
                          {savingAnalysisRole === role ? (
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          ) : savedAnalysisRoles.has(role) ? (
                            <Check className="mr-2 h-3 w-3" />
                          ) : (
                            <Save className="mr-2 h-3 w-3" />
                          )}
                          {savedAnalysisRoles.has(role) ? t('common:saved', 'Saved') : t('ai:save_analysis')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleExportSingleAnalysis(role)}>
                          <Download className="mr-2 h-3 w-3" />
                          PDF
                        </Button>
                      </div>
                    </div>
                    <div className="text-sm whitespace-pre-wrap mb-3">{result.analysis}</div>
                    {result.sources && result.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">
                          {t('ai:sources', 'Sources')}:
                        </p>
                        <ul className="text-xs space-y-1">
                          {result.sources.map((source, idx) => (
                            <li key={idx} className="text-muted-foreground">
                              \u2022 {source.title} ({source.category})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          
          {Object.values(results).some(r => r !== null) && (
            <div className="mt-6 pt-6 border-t">
              <FeedbackStars caseId={caseId} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
