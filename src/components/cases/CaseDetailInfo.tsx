import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { FileText, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CaseTimeline } from './CaseTimeline';
import { CaseComments } from './CaseComments';

interface CaseDetailInfoProps {
  caseId: string;
  courtName?: string | null;
  courtDate?: string | null;
  createdAt: string;
  updatedAt: string;
  isAdmin: boolean;
}

export function CaseDetailInfo({
  caseId,
  courtName,
  courtDate,
  createdAt,
  updatedAt,
  isAdmin
}: CaseDetailInfoProps) {
  const { t } = useTranslation(['cases', 'common']);

  return (
    <div className="space-y-6">
      {/* Case Info */}
      <Card>
        <CardHeader>
          <CardTitle>{t('common:information', 'Information')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {courtName && (
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{t('cases:court_name')}</p>
                <p className="text-sm break-words" style={{ overflowWrap: 'anywhere' }}>{courtName}</p>
              </div>
            </div>
          )}
          {courtDate && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{t('cases:court_date')}</p>
                <p className="text-sm">{format(new Date(courtDate), 'dd.MM.yyyy')}</p>
              </div>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">{t('cases:created_at')}</p>
            <p className="text-sm">{format(new Date(createdAt), 'dd.MM.yyyy HH:mm')}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('cases:updated_at')}</p>
            <p className="text-sm">{format(new Date(updatedAt), 'dd.MM.yyyy HH:mm')}</p>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>{t('cases:case_timeline')}</CardTitle>
        </CardHeader>
        <CardContent>
          <CaseTimeline caseId={caseId} />
        </CardContent>
      </Card>

      {/* Team Leader Comments - only visible to admins and team leaders */}
      {isAdmin && <CaseComments caseId={caseId} />}
    </div>
  );
}
