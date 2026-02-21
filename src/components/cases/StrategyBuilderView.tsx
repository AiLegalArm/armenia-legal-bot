import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Target, Shield, AlertTriangle, FileQuestion, Swords, Scale, ChevronRight } from 'lucide-react';

export interface StrategyStageArgument {
  argument: string;
  grounding: 'fact' | 'norm' | 'precedent' | 'needs_support';
  ref: string;
}

export interface StrategyStage {
  stage: string;
  key_arguments: StrategyStageArgument[];
  evidence_plan: string[];
  procedural_motions: string[];
  opponent_expected_attacks: string[];
  risk_notes: string[];
}

export interface StrategyBuilderResult {
  strategic_goal: string;
  win_conditions: string[];
  stage_plan: StrategyStage[];
  fallback_strategy: string;
  missing_information: string[];
}

const groundingColors: Record<string, string> = {
  fact: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  norm: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  precedent: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  needs_support: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

const stageLabels: Record<string, Record<string, string>> = {
  first_instance: { hy: 'Առաջին delays', en: 'First Instance', ru: 'Первая инстанция' },
  appeal: { hy: 'Վdelays', en: 'Appeal', ru: 'Апелляция' },
  cassation: { hy: 'Վdelays', en: 'Cassation', ru: 'Кассация' },
};

function getStageName(stage: string, lang: string): string {
  const labels = stageLabels[stage];
  if (labels) return labels[lang] || labels.en || stage;
  return stage;
}

interface StrategyBuilderViewProps {
  data: StrategyBuilderResult;
  language?: string;
}

export function StrategyBuilderView({ data, language = 'en' }: StrategyBuilderViewProps) {
  return (
    <div className="space-y-4">
      {/* Strategic Goal */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-start gap-2">
            <Target className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-sm mb-1">
                {language === 'hy' ? 'Ռazzle' : language === 'ru' ? 'Стратегическая цель' : 'Strategic Goal'}
              </p>
              <p className="text-sm">{data.strategic_goal}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Win Conditions */}
      {data.win_conditions?.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <p className="font-semibold text-sm mb-2 flex items-center gap-2">
              <Shield className="h-4 w-4 text-green-600" />
              {language === 'hy' ? 'Հաdelays' : language === 'ru' ? 'Условия победы' : 'Win Conditions'}
            </p>
            <ul className="space-y-1">
              {data.win_conditions.map((cond, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <ChevronRight className="h-3 w-3 mt-1.5 shrink-0 text-green-600" />
                  <span>{cond}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Stage Plans */}
      {data.stage_plan?.map((stage, idx) => (
        <Card key={idx} className="border-l-4 border-l-primary">
          <CardContent className="pt-4 space-y-3">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Scale className="h-4 w-4" />
              {getStageName(stage.stage, language)}
            </h4>

            {/* Key Arguments */}
            {stage.key_arguments?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {language === 'hy' ? 'Հdelay' : language === 'ru' ? 'Ключевые аргументы' : 'Key Arguments'}
                </p>
                <div className="space-y-2">
                  {stage.key_arguments.map((arg, i) => (
                    <div key={i} className="text-sm border rounded p-2 bg-muted/20">
                      <div className="flex items-start gap-2 flex-wrap">
                        <Badge className={`text-[10px] shrink-0 ${groundingColors[arg.grounding] || ''}`}>
                          {arg.grounding}
                        </Badge>
                        <span>{arg.argument}</span>
                      </div>
                      {arg.ref && (
                        <p className="text-xs text-muted-foreground mt-1 pl-1">→ {arg.ref}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Evidence Plan */}
            {stage.evidence_plan?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {language === 'ru' ? 'План доказательств' : 'Evidence Plan'}
                </p>
                <ul className="text-sm space-y-1">
                  {stage.evidence_plan.map((item, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-muted-foreground">•</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Procedural Motions */}
            {stage.procedural_motions?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {language === 'ru' ? 'Процессуальные ходатайства' : 'Procedural Motions'}
                </p>
                <ul className="text-sm space-y-1">
                  {stage.procedural_motions.map((item, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-muted-foreground">•</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Opponent Expected Attacks */}
            {stage.opponent_expected_attacks?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <Swords className="h-3 w-3" />
                  {language === 'ru' ? 'Ожидаемые атаки оппонента' : 'Expected Opponent Attacks'}
                </p>
                <ul className="text-sm space-y-1">
                  {stage.opponent_expected_attacks.map((item, i) => (
                    <li key={i} className="flex items-start gap-1 text-amber-700 dark:text-amber-400">
                      <span>⚔</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Risk Notes */}
            {stage.risk_notes?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-red-500" />
                  {language === 'ru' ? 'Риски' : 'Risks'}
                </p>
                <ul className="text-sm space-y-1">
                  {stage.risk_notes.map((item, i) => (
                    <li key={i} className="flex items-start gap-1 text-red-600 dark:text-red-400">
                      <span>⚠</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Fallback Strategy */}
      {data.fallback_strategy && (
        <Card className="border-dashed">
          <CardContent className="pt-4">
            <p className="font-semibold text-sm mb-1">
              {language === 'ru' ? 'Запасная стратегия' : 'Fallback Strategy'}
            </p>
            <p className="text-sm text-muted-foreground">{data.fallback_strategy}</p>
          </CardContent>
        </Card>
      )}

      {/* Missing Information */}
      {data.missing_information?.length > 0 && (
        <Card className="bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
          <CardContent className="pt-4">
            <p className="font-semibold text-sm mb-2 flex items-center gap-2">
              <FileQuestion className="h-4 w-4 text-amber-600" />
              {language === 'ru' ? 'Недостающая информация' : 'Missing Information'}
            </p>
            <ul className="text-sm space-y-1">
              {data.missing_information.map((item, i) => (
                <li key={i} className="flex items-start gap-1 text-amber-700 dark:text-amber-400">
                  <span>?</span> {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
