import { useTranslation } from 'react-i18next';
import { Music, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAudioTranscriptions } from '@/hooks/useAudioTranscriptions';
import { AudioTranscriptionResult } from './AudioTranscriptionResult';
import { AudioUpload } from './AudioUpload';

interface AudioTranscriptionListProps {
  caseId: string;
}

export function AudioTranscriptionList({ caseId }: AudioTranscriptionListProps) {
  const { t } = useTranslation(['audio', 'common']);
  const { transcriptions, isLoading } = useAudioTranscriptions(caseId);

  return (
    <div className="space-y-6">
      <AudioUpload caseId={caseId} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" aria-hidden="true" />
            {t('audio:transcriptions_list')}
          </CardTitle>
          <CardDescription>
            {t('audio:audio_history')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="sr-only">{t('common:loading')}</span>
            </div>
          ) : transcriptions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Music className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{t('audio:no_transcriptions')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {transcriptions.map((transcription) => (
                <AudioTranscriptionResult
                  key={transcription.id}
                  transcription={transcription}
                  caseId={caseId}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
