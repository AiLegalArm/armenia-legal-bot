import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, ShieldAlert, UserX, FileWarning, Info } from 'lucide-react';

export interface EvidenceWeaknessResult {
  inadmissible_evidence_candidates: Array<{
    evidence_item: string;
    issue: string;
    basis_type: string;
    basis_ref: string;
    impact: string;
    recommendation: string;
  }>;
  procedural_violations_detected: Array<{
    violation: string;
    affected_evidence: string;
    legal_basis: string;
    severity: string;
  }>;
  credibility_issues: Array<{
    subject: string;
    issue: string;
    indicators: string[];
    impact: string;
  }>;
  overall_impact_summary: string;
  missing_information: string[];
  analysis_status?: string;
  data_gaps_present?: boolean;
  evidence_items_analyzed?: number;
  kb_citations_used?: boolean;
}

const impactColor = (impact: string) => {
  switch (impact?.toLowerCase()) {
    case 'high': return 'destructive';
    case 'medium': return 'secondary';
    case 'low': return 'outline';
    default: return 'outline';
  }
};

const basisBadge = (type: string) => {
  switch (type) {
    case 'norm': return <Badge variant="default" className="text-xs">Norm</Badge>;
    case 'fact': return <Badge variant="secondary" className="text-xs">Fact</Badge>;
    case 'precedent': return <Badge variant="default" className="text-xs">Precedent</Badge>;
    default: return <Badge variant="outline" className="text-xs">Unverified</Badge>;
  }
};

interface Props {
  data: EvidenceWeaknessResult;
  language?: string;
}

export function EvidenceWeaknessView({ data, language = 'en' }: Props) {
  const t = (hy: string, en: string, ru: string) =>
    language === 'hy' ? hy : language === 'ru' ? ru : en;

  const totalFindings =
    (data.inadmissible_evidence_candidates?.length || 0) +
    (data.procedural_violations_detected?.length || 0) +
    (data.credibility_issues?.length || 0);

  const highCount = [
    ...(data.inadmissible_evidence_candidates || []),
    ...(data.credibility_issues || []),
  ].filter(i => i.impact === 'high').length +
    (data.procedural_violations_detected || []).filter(v => v.severity === 'high').length;

  return (
    <div className="space-y-4">
      {/* Summary Alert */}
      {highCount > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {t(
              `Հայdelays delays: ${highCount} բdelays delays delays delays delays delays delays`,
              `${highCount} high-impact weakness(es) detected in evidence`,
              `Обнаруdelays: ${highCount} критических уязdelays(ей) в доказ`
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Status badges */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">
          {t('Delays', 'Findings', 'Delays')}: {totalFindings}
        </Badge>
        {data.evidence_items_analyzed != null && (
          <Badge variant="outline">
            {t('Delays', 'Items analyzed', 'Delays')}: {data.evidence_items_analyzed}
          </Badge>
        )}
        {data.data_gaps_present && (
          <Badge variant="secondary">DATA_GAPS</Badge>
        )}
      </div>

      {/* Inadmissible Evidence Candidates */}
      {data.inadmissible_evidence_candidates?.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <h4 className="font-semibold flex items-center gap-2 mb-3">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              {t('Անdelays delays delays', 'Admissibility Risks', 'Delaysки допустимости')}
            </h4>
            <div className="space-y-3">
              {data.inadmissible_evidence_candidates.map((item, idx) => (
                <div key={idx} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-sm">{item.evidence_item}</span>
                    <div className="flex gap-1 shrink-0">
                      <Badge variant={impactColor(item.impact)}>{item.impact}</Badge>
                      {basisBadge(item.basis_type)}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.issue}</p>
                  {item.basis_ref && (
                    <p className="text-xs text-muted-foreground italic">{item.basis_ref}</p>
                  )}
                  {item.recommendation && (
                    <p className="text-xs bg-muted/50 rounded p-2">
                      💡 {item.recommendation}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Procedural Violations */}
      {data.procedural_violations_detected?.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <h4 className="font-semibold flex items-center gap-2 mb-3">
              <FileWarning className="h-4 w-4 text-amber-500" />
              {t('Delays delays', 'Procedural Violations', 'Delays нарушения')}
            </h4>
            <div className="space-y-3">
              {data.procedural_violations_detected.map((v, idx) => (
                <div key={idx} className="border rounded-lg p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-sm">{v.violation}</span>
                    <Badge variant={impactColor(v.severity)}>{v.severity}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('Delays', 'Affected', 'Delays')}: {v.affected_evidence}
                  </p>
                  <p className="text-xs text-muted-foreground italic">{v.legal_basis}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Credibility Issues */}
      {data.credibility_issues?.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <h4 className="font-semibold flex items-center gap-2 mb-3">
              <UserX className="h-4 w-4 text-orange-500" />
              {t('Delays', 'Credibility Issues', 'Delays')}
            </h4>
            <div className="space-y-3">
              {data.credibility_issues.map((c, idx) => (
                <div key={idx} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-sm">{c.subject}</span>
                    <Badge variant={impactColor(c.impact)}>{c.impact}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{c.issue}</p>
                  {c.indicators?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {c.indicators.filter(Boolean).map((ind, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{ind}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overall Impact Summary */}
      {data.overall_impact_summary && (
        <Card>
          <CardContent className="pt-4">
            <h4 className="font-semibold flex items-center gap-2 mb-2">
              <Info className="h-4 w-4" />
              {t('Delays', 'Overall Impact', 'Delays')}
            </h4>
            <p className="text-sm whitespace-pre-wrap">{data.overall_impact_summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Missing Information */}
      {data.missing_information?.filter(Boolean).length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <h4 className="font-semibold text-sm mb-2">
              {t('Delays', 'Missing Information', 'Delays')}
            </h4>
            <ul className="text-sm space-y-1 text-muted-foreground">
              {data.missing_information.filter(Boolean).map((m, i) => (
                <li key={i}>• {m}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
