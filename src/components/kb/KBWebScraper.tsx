import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Globe, Loader2, CheckCircle, AlertTriangle, Search, Upload } from 'lucide-react';
import { kbCategoryOptions, type KbCategory } from '@/components/kb/kbCategories';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface KBWebScraperProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type ScrapeStatus = 'idle' | 'mapping' | 'scraping' | 'success' | 'error';
type ScrapeMode = 'search' | 'sitemap' | 'urls' | 'jsonl';

interface ScrapeResult {
  totalUrls: number;
  processed: number;
  successCount: number;
  errorCount: number;
  remainingUrls: number;
  results: Array<{ url: string; status: string; title?: string; error?: string }>;
}

export function KBWebScraper({ open, onOpenChange, onSuccess }: KBWebScraperProps) {
  const { t } = useTranslation(['kb', 'common']);
  
  const [status, setStatus] = useState<ScrapeStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [siteUrl, setSiteUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [manualUrls, setManualUrls] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [category, setCategory] = useState<KbCategory>('other');
  const [limit, setLimit] = useState(20);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ScrapeMode>('search');
  const [jsonlFile, setJsonlFile] = useState<File | null>(null);
  const [parsedJsonlUrls, setParsedJsonlUrls] = useState<string[]>([]);

  const handleJsonlUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setJsonlFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const urls: string[] = [];
      let skippedCount = 0;
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed);
          // Filter: only include entries with ActStatus "Գործում է"
          if (obj.ActStatus && obj.ActStatus !== 'Գործում է') {
            skippedCount++;
            continue;
          }
          const url = obj.url || obj.link || obj.pdf_url || obj.source_url || obj.href;
          if (url && typeof url === 'string') urls.push(url);
        } catch {
          // skip invalid lines
        }
      }
      setParsedJsonlUrls(urls);
      if (urls.length === 0) toast.error('JSONL файлда URL не найден');
      if (skippedCount > 0) toast.info(`Пропущено ${skippedCount} записей (ActStatus ≠ "Գործում է")`);
    };
    reader.readAsText(file);
  };

  const handleScrape = async () => {
    if (mode === 'search' && !searchQuery.trim()) {
      toast.error('Введите поисковый запрос');
      return;
    }
    if (mode === 'sitemap' && !siteUrl) {
      toast.error('Укажите URL сайта');
      return;
    }
    if (mode === 'urls' && !manualUrls.trim()) {
      toast.error('Укажите URL-ы для скрейпинга');
      return;
    }
    if (mode === 'jsonl' && parsedJsonlUrls.length === 0) {
      toast.error('Загрузите JSONL файл с URL-ами');
      return;
    }
    if (!sourceName) {
      toast.error('Укажите название источника');
      return;
    }

    setStatus(mode === 'sitemap' ? 'mapping' : 'scraping');
    setProgress(10);
    setError(null);
    setResult(null);

    try {
      const body: any = {
        category,
        sourceName,
        limit,
      };

      if (mode === 'search') {
        body.searchQuery = searchQuery;
      } else if (mode === 'sitemap') {
        body.sitemapUrl = siteUrl;
      } else if (mode === 'jsonl') {
        body.urls = parsedJsonlUrls;
      } else {
        body.urls = manualUrls
          .split('\n')
          .map(url => url.trim())
          .filter(url => url.length > 0);
      }

      setStatus('scraping');
      setProgress(30);

      const { data, error: fnError } = await supabase.functions.invoke('kb-scrape-batch', {
        body,
      });

      setProgress(90);

      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);

      setResult(data);
      setProgress(100);
      setStatus('success');
      toast.success(`Обработано ${data.successCount} документов`);
      onSuccess();

    } catch (err) {
      console.error('Scrape error:', err);
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Ошибка скрейпинга');
      toast.error('Ошибка скрейпинга');
    }
  };

  const handleClose = () => {
    setSiteUrl('');
    setSearchQuery('');
    setManualUrls('');
    setSourceName('');
    setCategory('other');
    setLimit(20);
    setStatus('idle');
    setProgress(0);
    setResult(null);
    setError(null);
    setJsonlFile(null);
    setParsedJsonlUrls([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Веб-скрейпинг для Knowledge Base
          </DialogTitle>
          <DialogDescription>
            Автоматически собирайте документы с веб-сайтов
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as ScrapeMode)} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="search">🔍 Поиск</TabsTrigger>
            <TabsTrigger value="sitemap">🗺️ Сайт</TabsTrigger>
            <TabsTrigger value="urls">📋 URL-ы</TabsTrigger>
            <TabsTrigger value="jsonl">📄 JSONL</TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-4">
            <div className="space-y-2">
              <Label>Поисковый запрос</Label>
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ՀՀ Քրեական օրենսգիրք site:arlis.am"
              />
              <p className="text-xs text-muted-foreground">
                Примеры: "ՀՀ Քրեական օրենսգրքի մեկնաբանություն site:arlis.am" или "cassation court decision Armenia"
              </p>
            </div>
          </TabsContent>

          <TabsContent value="sitemap" className="space-y-4">
            <div className="space-y-2">
              <Label>URL сайта</Label>
              <Input
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="https://arlis.am"
              />
              <p className="text-xs text-muted-foreground">
                Firecrawl найдёт все страницы и документы
              </p>
            </div>
          </TabsContent>

          <TabsContent value="urls" className="space-y-4">
            <div className="space-y-2">
              <Label>URL-ы (по одному на строку)</Label>
              <Textarea
                value={manualUrls}
                onChange={(e) => setManualUrls(e.target.value)}
                placeholder="https://arlis.am/DocumentView.aspx?docid=12345&#10;https://cassation.am/decision/123"
                className="h-32 font-mono text-xs"
              />
            </div>
          </TabsContent>

          <TabsContent value="jsonl" className="space-y-4">
            <div className="space-y-2">
              <Label>JSONL файл с URL-ами PDF</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".jsonl,.ndjson"
                  onChange={handleJsonlUpload}
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Каждая строка — JSON объект с полем url, link, pdf_url или source_url
              </p>
              {parsedJsonlUrls.length > 0 && (
                <div className="rounded-lg border bg-muted/50 p-3 space-y-1">
                  <p className="text-sm font-medium">Найдено URL: {parsedJsonlUrls.length}</p>
                  <div className="max-h-24 overflow-y-auto text-xs font-mono space-y-0.5">
                    {parsedJsonlUrls.slice(0, 10).map((u, i) => (
                      <p key={i} className="truncate text-muted-foreground">{u}</p>
                    ))}
                    {parsedJsonlUrls.length > 10 && (
                      <p className="text-muted-foreground">... и ещё {parsedJsonlUrls.length - 10}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-4 py-4">
          {/* Source Name */}
          <div className="space-y-2">
            <Label>Название источника</Label>
            <Input
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="ARLIS.am / Cassation Court"
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>{t('categories')}</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as KbCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {kbCategoryOptions.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {t(cat.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Limit */}
          <div className="space-y-2">
            <Label>Лимит документов</Label>
            <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 (тест)</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Start Button */}
          {status === 'idle' && (
            <Button onClick={handleScrape} className="w-full">
              <Search className="mr-2 h-4 w-4" />
              Начать скрейпинг
            </Button>
          )}

          {/* Progress */}
          {(status === 'mapping' || status === 'scraping') && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">
                  {status === 'mapping' ? 'Сканирование сайта...' : 'Обработка документов...'}
                </span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {/* Error */}
          {status === 'error' && error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive bg-destructive/10 p-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          )}

          {/* Success */}
          {status === 'success' && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">
                  Обработано: {result.successCount} успешно, {result.errorCount} ошибок
                </span>
              </div>

              {result.remainingUrls > 0 && (
                <div className="rounded-lg border bg-muted/50 p-3">
                  <p className="text-sm">
                    <strong>Осталось:</strong> {result.remainingUrls} URL
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Запустите скрейпинг ещё раз для следующей партии
                  </p>
                </div>
              )}

              <div className="max-h-40 overflow-y-auto space-y-1">
                {result.results.slice(0, 10).map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    {item.status === 'success' ? (
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{item.title || item.url}</p>
                      {item.error && (
                        <p className="text-xs text-destructive truncate">{item.error}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <Button onClick={handleClose} className="w-full">
                {t('common:close')}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
