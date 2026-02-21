import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

export interface CrossExamResult {
  cross_examination_strategy: string;
  question_blocks: Array<{
    objective: string;
    target: 'witness' | 'expert' | 'victim' | 'party';
    questions: string[];
  }>;
}

interface CrossExamViewProps {
  data: CrossExamResult;
  language?: string;
}

const TARGET_LABELS: Record<string, { en: string; hy: string; ru: string; color: string }> = {
  witness: { en: 'Witness', hy: 'Վկdelays', ru: 'Свидетель', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  expert: { en: 'Expert', hy: 'Փdelays', ru: 'Эксперт', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  victim: { en: 'Victim', hy: 'Тdelays', ru: 'Потерпевший', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
  party: { en: 'Party', hy: 'Кdelays', ru: 'Сторона', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
};

export function CrossExamView({ data, language = 'en' }: CrossExamViewProps) {
  const lang = language === 'hy' ? 'hy' : language === 'ru' ? 'ru' : 'en';

  return (
    <div className="space-y-4">
      {/* Strategy Overview */}
      {data.cross_examination_strategy && (
        <Card>
          <CardContent className="p-4">
            <h4 className="font-semibold text-sm mb-2">
              {lang === 'hy' ? ' Delays 策略' : lang === 'ru' ? 'Стратегия перекрёстного допроса' : 'Cross-Examination Strategy'}
            </h4>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{data.cross_examination_strategy}</p>
          </CardContent>
        </Card>
      )}

      {/* Question Blocks */}
      {data.question_blocks?.map((block, blockIdx) => {
        const targetInfo = TARGET_LABELS[block.target] || TARGET_LABELS.witness;
        return (
          <Card key={blockIdx}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Badge className={targetInfo.color}>
                  {targetInfo[lang]}
                </Badge>
                <h4 className="font-semibold text-sm">{block.objective}</h4>
              </div>
              <ol className="space-y-2 list-decimal list-inside">
                {block.questions?.map((q, qIdx) => (
                  <li key={qIdx} className="text-sm text-foreground pl-1">
                    {q}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        );
      })}

      {(!data.question_blocks || data.question_blocks.length === 0) && (
        <p className="text-sm text-muted-foreground italic">
          {lang === 'en' ? 'No question blocks generated.' : lang === 'ru' ? 'Блоки вопросов не сгенерированы.' : 'Հdelays бdelays чdelays сdelays.'}
        </p>
      )}
    </div>
  );
}
