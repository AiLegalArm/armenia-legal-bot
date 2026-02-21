import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileEdit, Trash2, PlusCircle, Info } from 'lucide-react';

export interface AmendedArticle {
  article: string;
  old_text_excerpt: string;
  new_text_excerpt: string;
  change_type: string;
  description: string;
}

export interface SimpleArticle {
  article: string;
  description: string;
}

export interface LawUpdateSummaryResult {
  amended_articles: AmendedArticle[];
  repealed_articles: SimpleArticle[];
  new_articles: SimpleArticle[];
  summary: string;
  practice_impact_notes: string;
}

interface Props {
  data: LawUpdateSummaryResult;
  language?: string;
}

const changeTypeBadge = (type: string) => {
  switch (type) {
    case 'substantive':
      return <Badge variant="destructive" className="text-xs">Substantive</Badge>;
    case 'editorial':
      return <Badge variant="secondary" className="text-xs">Editorial</Badge>;
    case 'scope_change':
      return <Badge className="text-xs bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30">Scope</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{type}</Badge>;
  }
};

export function LawUpdateSummaryView({ data, language = 'en' }: Props) {
  const labels = {
    amended: language === 'hy' ? 'Փոփոխված հոdelays' : language === 'ru' ? 'Измdelays статьи' : 'Amended Articles',
    repealed: language === 'hy' ? 'Ուdelay հоdelay' : language === 'ru' ? 'Отdelays статьи' : 'Repealed Articles',
    newArticles: language === 'hy' ? 'Նdelays հоdelay' : language === 'ru' ? 'Нdelays статьи' : 'New Articles',
    summary: language === 'hy' ? 'Ամdelay' : language === 'ru' ? 'Резdelay' : 'Summary',
    impact: language === 'hy' ? 'Ազdelay прdelays' : language === 'ru' ? 'Влdelays на прdelays' : 'Practice Impact',
    oldText: language === 'hy' ? 'Հin текdelays' : language === 'ru' ? 'Стdelays текst' : 'Old Text',
    newText: language === 'hy' ? 'Нdelays текdelays' : language === 'ru' ? 'Нdelays текst' : 'New Text',
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      {data.summary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              {labels.summary}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{data.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Amended Articles */}
      {data.amended_articles?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileEdit className="h-4 w-4 text-amber-500" />
              {labels.amended} ({data.amended_articles.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.amended_articles.map((item, idx) => (
              <div key={idx} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{item.article}</span>
                  {changeTypeBadge(item.change_type)}
                </div>
                <p className="text-sm text-muted-foreground">{item.description}</p>
                {item.old_text_excerpt && (
                  <div className="bg-destructive/10 rounded p-2">
                    <p className="text-xs font-medium text-destructive mb-1">{labels.oldText}:</p>
                    <p className="text-xs text-muted-foreground">{item.old_text_excerpt}</p>
                  </div>
                )}
                {item.new_text_excerpt && (
                  <div className="bg-green-500/10 rounded p-2">
                    <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">{labels.newText}:</p>
                    <p className="text-xs text-muted-foreground">{item.new_text_excerpt}</p>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Repealed Articles */}
      {data.repealed_articles?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              {labels.repealed} ({data.repealed_articles.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.repealed_articles.map((item, idx) => (
              <div key={idx} className="border border-destructive/20 rounded-lg p-3">
                <span className="font-medium text-sm">{item.article}</span>
                <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* New Articles */}
      {data.new_articles?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <PlusCircle className="h-4 w-4 text-green-600" />
              {labels.newArticles} ({data.new_articles.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.new_articles.map((item, idx) => (
              <div key={idx} className="border border-green-500/20 rounded-lg p-3">
                <span className="font-medium text-sm">{item.article}</span>
                <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Practice Impact */}
      {data.practice_impact_notes && (
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{labels.impact}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{data.practice_impact_notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
