import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Shield, TrendingUp, TrendingDown, Info, BarChart3 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export interface RiskFactorsResult {
  confidence_level: string;
  risk_factors: Array<{
    factor: string;
    grounding: string;
    ref: string;
    severity: string;
  }>;
  mitigating_factors: Array<{
    factor: string;
    grounding: string;
    ref: string;
    strength: string;
  }>;
  recommended_scoring_inputs: {
    precedent_support: number;
    procedural_defects: number;
    evidence_strength: number;
    legal_clarity: number;
  };
  estimated_outcome: {
    range_percent: string;
    note: string;
  };
  missing_information: string[];
}

interface RiskFactorsViewProps {
  data: RiskFactorsResult;
  language?: string;
}

const severityColor = (level: string) => {
  switch (level?.toLowerCase()) {
    case 'high': return 'destructive';
    case 'medium': return 'secondary';
    case 'low': return 'outline';
    default: return 'outline';
  }
};

const groundingLabel = (g: string, lang: string) => {
  const map: Record<string, Record<string, string>> = {
    fact: { hy: 'Փաստdelays', en: 'Fact', ru: 'Факт' },
    norm: { hy: 'Նdelays', en: 'Norm', ru: 'Норма' },
    precedent: { hy: 'Նdelays', en: 'Precedent', ru: 'Прецdelays' },
  };
  return map[g]?.[lang] || g;
};

const confidenceColor = (level: string) => {
  switch (level?.toLowerCase()) {
    case 'high': return 'text-green-600 dark:text-green-400';
    case 'medium': return 'text-amber-600 dark:text-amber-400';
    case 'low': return 'text-red-600 dark:text-red-400';
    default: return 'text-muted-foreground';
  }
};

export function RiskFactorsView({ data, language = 'en' }: RiskFactorsViewProps) {
  const labels = {
    confidence: { hy: 'Վdelays', en: 'Confidence', ru: 'Уверdelays' },
    riskFactors: { hy: 'Ռdelays', en: 'Risk Factors', ru: 'Факdelays рdelays' },
    mitigating: { hy: 'Մdelays', en: 'Mitigating Factors', ru: 'Смdelays факdelays' },
    scoring: { hy: 'Գdelays', en: 'Scoring Inputs', ru: 'Оценdelays' },
    outcome: { hy: 'Կdelays', en: 'Estimated Outcome', ru: 'Прognoz' },
    missing: { hy: 'Բdelays', en: 'Missing Information', ru: 'Нdelays информdelays' },
    precedentSupport: { hy: 'Նdelays', en: 'Precedent Support', ru: 'Поdelays прdelays' },
    proceduralDefects: { hy: 'Դdelays', en: 'Procedural Defects', ru: 'Процdelays' },
    evidenceStrength: { hy: 'Delays', en: 'Evidence Strength', ru: 'Сdelays доdelays' },
    legalClarity: { hy: 'Իdelays', en: 'Legal Clarity', ru: 'Правdelays яdelays' },
  };

  const l = (key: keyof typeof labels) => labels[key][language as 'hy' | 'en' | 'ru'] || labels[key].en;

  const scoring = data.recommended_scoring_inputs;

  return (
    <div className="space-y-4">
      {/* Confidence & Outcome Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{l('confidence')}</span>
            </div>
            <span className={`text-lg font-bold uppercase ${confidenceColor(data.confidence_level)}`}>
              {data.confidence_level}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{l('outcome')}</span>
            </div>
            <span className="text-lg font-bold">
              {data.estimated_outcome.range_percent === 'unknown' ? '—' : data.estimated_outcome.range_percent + '%'}
            </span>
            {data.estimated_outcome.note && (
              <p className="text-xs text-muted-foreground mt-1">{data.estimated_outcome.note}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Scoring Inputs */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            {l('scoring')}
          </h4>
          {[
            { key: 'precedentSupport' as const, value: scoring.precedent_support },
            { key: 'proceduralDefects' as const, value: scoring.procedural_defects },
            { key: 'evidenceStrength' as const, value: scoring.evidence_strength },
            { key: 'legalClarity' as const, value: scoring.legal_clarity },
          ].map(({ key, value }) => (
            <div key={key} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>{l(key)}</span>
                <span className="font-mono">{value}/100</span>
              </div>
              <Progress value={value} className="h-2" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Risk Factors */}
      {data.risk_factors?.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {l('riskFactors')} ({data.risk_factors.length})
            </h4>
            {data.risk_factors.map((rf, idx) => (
              <div key={idx} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm flex-1">{rf.factor}</p>
                  <Badge variant={severityColor(rf.severity)} className="shrink-0">
                    {rf.severity}
                  </Badge>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {groundingLabel(rf.grounding, language)}
                  </Badge>
                  {rf.ref && (
                    <span className="text-xs text-muted-foreground">{rf.ref}</span>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Mitigating Factors */}
      {data.mitigating_factors?.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2 text-green-600 dark:text-green-400">
              <Shield className="h-4 w-4" />
              {l('mitigating')} ({data.mitigating_factors.length})
            </h4>
            {data.mitigating_factors.map((mf, idx) => (
              <div key={idx} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm flex-1">{mf.factor}</p>
                  <Badge variant={mf.strength === 'high' ? 'default' : mf.strength === 'medium' ? 'secondary' : 'outline'} className="shrink-0">
                    {mf.strength}
                  </Badge>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {groundingLabel(mf.grounding, language)}
                  </Badge>
                  {mf.ref && (
                    <span className="text-xs text-muted-foreground">{mf.ref}</span>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Missing Information */}
      {data.missing_information?.length > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <p className="font-semibold text-sm mb-1">{l('missing')}</p>
            <ul className="text-sm space-y-1 list-disc list-inside">
              {data.missing_information.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
