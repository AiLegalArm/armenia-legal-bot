import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus, Trash2, Edit, Search, FileText, Scale, AlertTriangle, Sparkles, FolderUp, Wand2, Loader2, Folder, FolderOpen, ChevronRight, Layers } from 'lucide-react';
import { LegalPracticeAIImport } from './LegalPracticeAIImport';
import { LegalPracticeBulkImport } from './LegalPracticeBulkImport';

// Types matching database schema
type CourtType = 'first_instance' | 'appeal' | 'cassation' | 'constitutional' | 'echr';
type PracticeCategory = 'criminal' | 'civil' | 'administrative' | 'echr' | 'constitutional';
type CaseOutcome = 'granted' | 'rejected' | 'partial' | 'remanded' | 'discontinued';

interface LegalPracticeDocument {
  id: string;
  title: string;
  description: string | null;
  content_text: string;
  court_type: CourtType;
  practice_category: PracticeCategory;
  court_name: string | null;
  case_number_anonymized: string | null;
  decision_date: string | null;
  applied_articles: any;
  outcome: CaseOutcome;
  key_violations: string[] | null;
  legal_reasoning_summary: string | null;
  source_name: string | null;
  source_url: string | null;
  is_anonymized: boolean;
  is_active: boolean;
  visibility: string;
  created_at: string;
  updated_at: string;
}

const courtTypeKeys: Record<CourtType, string> = {
  first_instance: 'lp_court_first_instance',
  appeal: 'lp_court_appeal',
  cassation: 'lp_court_cassation',
  constitutional: 'lp_court_constitutional',
  echr: 'lp_court_echr'
};

const categoryKeys: Record<PracticeCategory, string> = {
  criminal: 'lp_cat_criminal',
  civil: 'lp_cat_civil',
  administrative: 'lp_cat_administrative',
  echr: 'lp_cat_echr',
  constitutional: 'lp_cat_constitutional',
};

const outcomeKeys: Record<CaseOutcome, string> = {
  granted: 'lp_outcome_granted',
  rejected: 'lp_outcome_rejected',
  partial: 'lp_outcome_partial',
  remanded: 'lp_outcome_remanded',
  discontinued: 'lp_outcome_discontinued'
};

const defaultFormData = {
  title: '',
  description: '',
  content_text: '',
  court_type: 'first_instance' as CourtType,
  practice_category: 'criminal' as PracticeCategory,
  court_name: '',
  case_number_anonymized: '',
  decision_date: '',
  applied_articles: null as any,
  outcome: 'granted' as CaseOutcome,
  key_violations: [] as string[],
  legal_reasoning_summary: '',
  source_name: '',
  source_url: '',
  is_anonymized: true,
  visibility: 'ai_only'
};

export function LegalPracticeKB() {
  const { t } = useTranslation('kb');
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<LegalPracticeDocument | null>(null);
  const [formData, setFormData] = useState(defaultFormData);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<PracticeCategory | 'all'>('all');
  const [keyViolationsInput, setKeyViolationsInput] = useState('');
  const [articlesInput, setArticlesInput] = useState('');
  const [aiImportOpen, setAiImportOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set());
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

  // Fetch documents in batches to overcome 1000-row limit
  const { data: documents, isLoading } = useQuery({
    queryKey: ['legal-practice-kb', searchTerm, filterCategory],
    queryFn: async () => {
      const selectFields = 'id,title,description,court_type,practice_category,court_name,case_number_anonymized,decision_date,outcome,key_violations,legal_reasoning_summary,applied_articles,source_name,source_url,is_anonymized,visibility,is_active,created_at,updated_at';
      const batchSize = 1000;
      let allData: any[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('legal_practice_kb')
          .select(selectFields)
          .order('created_at', { ascending: false })
          .range(offset, offset + batchSize - 1);

        if (filterCategory !== 'all') {
          query = query.eq('practice_category', filterCategory);
        }

        if (searchTerm) {
          query = query.or(`title.ilike.%${searchTerm}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (data && data.length > 0) {
          allData.push(...data);
          offset += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      return allData.map((doc: any) => ({
        ...doc,
        content_text: '', // not fetched in list view
        applied_articles: doc.applied_articles ?? null
      })) as LegalPracticeDocument[];
    }
  });

  // Group documents by practice_category
  const groupedDocuments = useMemo(() => {
    if (!documents) return [];
    const groups = new Map<string, { key: string; docs: LegalPracticeDocument[] }>();
    for (const doc of documents) {
      const cat = doc.practice_category;
      const label = t(categoryKeys[cat]);
      if (!groups.has(cat)) groups.set(cat, { key: cat, docs: [] });
      groups.get(cat)!.docs.push(doc);
    }
    return Array.from(groups.values()).sort((a, b) => t(categoryKeys[a.key as PracticeCategory]).localeCompare(t(categoryKeys[b.key as PracticeCategory])));
  }, [documents, t]);

  const toggleFolder = (name: string) => {
    setOpenFolders(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData & { id?: string }) => {
      const payload = {
        ...data,
        key_violations: data.key_violations.length > 0 ? data.key_violations : null,
        applied_articles: data.applied_articles || null,
        decision_date: data.decision_date || null,
        court_name: data.court_name || null,
        case_number_anonymized: data.case_number_anonymized || null,
        legal_reasoning_summary: data.legal_reasoning_summary || null,
        source_name: data.source_name || null,
        source_url: data.source_url || null,
        description: data.description || null,
      };

      if (data.id) {
        const { error } = await supabase
          .from('legal_practice_kb')
          .update(payload)
          .eq('id', data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('legal_practice_kb')
          .insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['legal-practice-kb'] });
      toast.success(editingDoc ? t('lp_updated') : t('lp_saved'));
      resetForm();
    },
    onError: (error) => {
      console.error('Save error:', error);
      toast.error(t('lp_save_error'));
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('legal_practice_kb')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['legal-practice-kb'] });
      toast.success(t('lp_deleted'));
    },
    onError: () => {
      toast.error(t('lp_delete_error'));
    }
  });

  // AI Enrich mutation
  const handleEnrich = async (docId: string, silent = false) => {
    setEnrichingIds(prev => new Set(prev).add(docId));
    try {
      let lastErr: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { data, error } = await supabase.functions.invoke('legal-practice-import', {
            body: { enrichDocId: docId },
          });
          if (error) throw error;
          if (data?.enriched) {
            if (!silent) toast.success(t('lp_enrich_success', { count: (data.updated_fields as string[]).length }));
            queryClient.invalidateQueries({ queryKey: ['legal-practice-kb'] });
          } else {
            if (!silent) toast.info(t('lp_enrich_no_update'));
          }
          return true;
        } catch (e) {
          lastErr = e;
          if (attempt < 2) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        }
      }
      throw lastErr;
    } catch (err) {
      console.error('Enrich error:', err);
      if (!silent) toast.error(t('lp_enrich_error'));
      return false;
    } finally {
      setEnrichingIds(prev => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  };

  const [bulkEnrichRunning, setBulkEnrichRunning] = useState(false);
  const [bulkEnrichProgress, setBulkEnrichProgress] = useState({ done: 0, remaining: 0 });

  const handleBulkEnrich = async () => {
    if (bulkEnrichRunning) return;
    
    const categoryParam = filterCategory !== 'all' ? filterCategory : undefined;
    
    const { data: countData, error: countErr } = await supabase.functions.invoke('legal-practice-enrich', {
      body: { countOnly: true, category: categoryParam },
    });
    
    if (countErr || !countData?.success) {
      toast.error(t('lp_enrich_error'));
      return;
    }
    
    if (countData.remaining === 0) {
      toast.info(t('lp_bulk_enrich_all_done'));
      return;
    }
    
    setBulkEnrichRunning(true);
    setBulkEnrichProgress({ done: 0, remaining: countData.remaining });
    toast.info(t('lp_bulk_enrich_start', { count: countData.remaining }));
    
    let totalEnriched = 0;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;
    
    while (consecutiveErrors < maxConsecutiveErrors) {
      try {
        const { data, error } = await supabase.functions.invoke('legal-practice-enrich', {
          body: { limit: 3, category: categoryParam },
        });
        
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Unknown error');
        
        if (data.enriched === 0 && data.remaining === 0) break;
        
        totalEnriched += data.enriched;
        consecutiveErrors = data.enriched > 0 ? 0 : consecutiveErrors + 1;
        setBulkEnrichProgress({ done: totalEnriched, remaining: data.remaining });
        
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error('Bulk enrich batch error:', err);
        consecutiveErrors++;
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    
    setBulkEnrichRunning(false);
    queryClient.invalidateQueries({ queryKey: ['legal-practice-kb'] });
    
    if (totalEnriched > 0) {
      toast.success(t('lp_bulk_enrich_success', { count: totalEnriched }));
    }
    if (consecutiveErrors >= maxConsecutiveErrors) {
      toast.error(t('lp_bulk_enrich_fail', { count: consecutiveErrors }));
    }
  };

  const [bulkChunkRunning, setBulkChunkRunning] = useState(false);
  const [bulkChunkProgress, setBulkChunkProgress] = useState({ done: 0, total: 0 });

  const handleBulkChunk = async () => {
    if (bulkChunkRunning) return;
    setBulkChunkRunning(true);
    setBulkChunkProgress({ done: 0, total: 0 });
    
    let totalChunked = 0;
    let consecutiveEmpty = 0;
    
    while (consecutiveEmpty < 3) {
      try {
        const { data, error } = await supabase.functions.invoke('kb-backfill-chunks', {
          body: { chunkSize: 8000, batchLimit: 10 },
        });
        
        if (error) throw error;
        
        const inserted = data?.totalChunksInserted || 0;
        totalChunked += inserted;
        setBulkChunkProgress({ done: totalChunked, total: data?.totalRemaining || 0 });
        
        if (inserted === 0) consecutiveEmpty++;
        else consecutiveEmpty = 0;
        
        if (data?.totalRemaining === 0 || !data?.hint) break;
        
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.error('Bulk chunk error:', err);
        consecutiveEmpty++;
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    setBulkChunkRunning(false);
    if (totalChunked > 0) {
      toast.success(`Chunking: ${totalChunked} chunks created`);
    } else {
      toast.info('All documents already chunked');
    }
  };

  const resetForm = () => {
    setFormData(defaultFormData);
    setEditingDoc(null);
    setIsDialogOpen(false);
    setKeyViolationsInput('');
    setArticlesInput('');
  };

  const handleEdit = (doc: LegalPracticeDocument) => {
    setEditingDoc(doc);
    setFormData({
      title: doc.title,
      description: doc.description || '',
      content_text: doc.content_text,
      court_type: doc.court_type,
      practice_category: doc.practice_category,
      court_name: doc.court_name || '',
      case_number_anonymized: doc.case_number_anonymized || '',
      decision_date: doc.decision_date || '',
      applied_articles: doc.applied_articles || [],
      outcome: doc.outcome,
      key_violations: doc.key_violations || [],
      legal_reasoning_summary: doc.legal_reasoning_summary || '',
      source_name: doc.source_name || '',
      source_url: doc.source_url || '',
      is_anonymized: doc.is_anonymized,
      visibility: doc.visibility
    });
    setKeyViolationsInput((doc.key_violations || []).join(', '));
    setArticlesInput(JSON.stringify(doc.applied_articles || null, null, 2));
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const violations = keyViolationsInput
      .split(',')
      .map(v => v.trim())
      .filter(v => v.length > 0);
    
    let articles: Array<{ code: string; articles: string[] }> = [];
    try {
      if (articlesInput.trim()) {
        articles = JSON.parse(articlesInput);
      }
    } catch {
      toast.error(t('lp_invalid_json'));
      return;
    }

    saveMutation.mutate({
      ...formData,
      key_violations: violations,
      applied_articles: articles,
      id: editingDoc?.id
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-5 w-5" />
          <span>{t('lp_title')}</span>
        </CardTitle>
        <CardDescription className="flex items-center gap-2 text-amber-600">
          <AlertTriangle className="h-4 w-4" />
          <span>{t('lp_description')}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search and filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('lp_search_placeholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={filterCategory}
            onValueChange={(v) => setFilterCategory(v as PracticeCategory | 'all')}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t('lp_category')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('lp_all')}</SelectItem>
              {(Object.keys(categoryKeys) as PracticeCategory[]).map((value) => (
                <SelectItem key={value} value={value}>{t(categoryKeys[value])}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            onClick={handleBulkChunk}
            disabled={bulkChunkRunning}
            className="border-blue-500/50 text-blue-600 hover:bg-blue-500/10"
          >
            {bulkChunkRunning ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Layers className="h-4 w-4 mr-2" />
            )}
            {bulkChunkRunning 
              ? `Chunks: ${bulkChunkProgress.done}`
              : `Chunking${filterCategory !== 'all' ? ` (${t(categoryKeys[filterCategory])})` : ''}`}
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setBulkImportOpen(true)}
          >
            <FolderUp className="h-4 w-4 mr-2" />
            {t('lp_bulk_import')}
          </Button>
          <Button 
            variant="outline" 
            onClick={handleBulkEnrich}
            disabled={bulkEnrichRunning}
            className="border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
          >
            {bulkEnrichRunning ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4 mr-2" />
            )}
            {bulkEnrichRunning 
              ? `AI: ${bulkEnrichProgress.done} / ${bulkEnrichProgress.done + bulkEnrichProgress.remaining}`
              : `${t('lp_ai_enrich')}${filterCategory !== 'all' ? ` (${t(categoryKeys[filterCategory])})` : ''}`}
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setAiImportOpen(true)}
            className="border-purple-500/50 text-purple-600 hover:bg-purple-500/10"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {t('lp_ai_import')}
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                {t('lp_add')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingDoc ? t('lp_edit_title') : t('lp_add_title')}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>{t('lp_doc_title')}</Label>
                    <Input
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      required
                    />
                  </div>
                  
                  <div>
                    <Label>{t('lp_category')}</Label>
                    <Select
                      value={formData.practice_category}
                      onValueChange={(v) => setFormData({ ...formData, practice_category: v as PracticeCategory })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(categoryKeys) as PracticeCategory[]).map((value) => (
                          <SelectItem key={value} value={value}>{t(categoryKeys[value])}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label>{t('lp_court_type')}</Label>
                    <Select
                      value={formData.court_type}
                      onValueChange={(v) => setFormData({ ...formData, court_type: v as CourtType })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(courtTypeKeys) as CourtType[]).map((value) => (
                          <SelectItem key={value} value={value}>{t(courtTypeKeys[value])}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label>{t('lp_outcome')}</Label>
                    <Select
                      value={formData.outcome}
                      onValueChange={(v) => setFormData({ ...formData, outcome: v as CaseOutcome })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(outcomeKeys) as CaseOutcome[]).map((value) => (
                          <SelectItem key={value} value={value}>{t(outcomeKeys[value])}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label>{t('lp_decision_date')}</Label>
                    <Input
                      type="date"
                      value={formData.decision_date}
                      onChange={(e) => setFormData({ ...formData, decision_date: e.target.value })}
                    />
                  </div>
                  
                  <div>
                    <Label>{t('lp_court_name')}</Label>
                    <Input
                      value={formData.court_name}
                      onChange={(e) => setFormData({ ...formData, court_name: e.target.value })}
                    />
                  </div>
                  
                  <div>
                    <Label>{t('lp_case_number')}</Label>
                    <Input
                      value={formData.case_number_anonymized}
                      onChange={(e) => setFormData({ ...formData, case_number_anonymized: e.target.value })}
                      placeholder={t('lp_case_number_placeholder')}
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <Label>{t('lp_applied_articles')}</Label>
                    <Textarea
                      value={articlesInput}
                      onChange={(e) => setArticlesInput(e.target.value)}
                      placeholder='[{"code": "criminal_code", "articles": ["104", "105"]}]'
                      rows={3}
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <Label>{t('lp_key_violations')}</Label>
                    <Input
                      value={keyViolationsInput}
                      onChange={(e) => setKeyViolationsInput(e.target.value)}
                      placeholder={t('lp_key_violations_placeholder')}
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <Label>{t('lp_legal_reasoning')}</Label>
                    <Textarea
                      value={formData.legal_reasoning_summary}
                      onChange={(e) => setFormData({ ...formData, legal_reasoning_summary: e.target.value })}
                      rows={3}
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <Label>{t('lp_content')}</Label>
                    <Textarea
                      value={formData.content_text}
                      onChange={(e) => setFormData({ ...formData, content_text: e.target.value })}
                      rows={8}
                      required
                    />
                  </div>
                </div>
                
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={resetForm}>
                    {t('lp_cancel')}
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? t('lp_saving') : t('lp_save')}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Documents table */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            {t('lp_loading')}
          </div>
        ) : groupedDocuments.length > 0 ? (
          <div className="space-y-2">
            {groupedDocuments.map(({ key: catKey, docs }) => {
              const folderLabel = t(categoryKeys[catKey as PracticeCategory]);
              const isOpen = openFolders.has(catKey);
              return (
                <div key={catKey}>
                  <button
                    onClick={() => toggleFolder(catKey)}
                    className="flex w-full items-center gap-2 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                    {isOpen ? (
                      <FolderOpen className="h-5 w-5 text-primary" />
                    ) : (
                      <Folder className="h-5 w-5 text-primary" />
                    )}
                    <span className="flex-1 font-medium">{folderLabel}</span>
                    <span className="text-sm text-muted-foreground">{docs.length}</span>
                  </button>
                  {isOpen && (
                    <div className="mt-1 ml-6">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('lp_doc_title')}</TableHead>
                            <TableHead>{t('lp_category')}</TableHead>
                            <TableHead>{t('lp_court_type')}</TableHead>
                            <TableHead>{t('lp_outcome')}</TableHead>
                            <TableHead>{t('lp_decision_date')}</TableHead>
                            <TableHead className="text-right">{t('lp_actions')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {docs.map((doc) => (
                            <TableRow key={doc.id}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <FileText className="h-4 w-4 text-muted-foreground" />
                                  {doc.title}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {t(categoryKeys[doc.practice_category])}
                                </Badge>
                              </TableCell>
                              <TableCell>{t(courtTypeKeys[doc.court_type])}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    doc.outcome === 'granted' ? 'default' :
                                    doc.outcome === 'rejected' ? 'destructive' :
                                    'secondary'
                                  }
                                >
                                  {t(outcomeKeys[doc.outcome])}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {doc.decision_date ? new Date(doc.decision_date).toLocaleDateString('hy-AM') : '-'}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEnrich(doc.id)}
                                  disabled={enrichingIds.has(doc.id)}
                                  title={t('lp_ai_enrich')}
                                >
                                  {enrichingIds.has(doc.id) ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Wand2 className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEdit(doc)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    if (confirm(t('lp_confirm_delete'))) {
                                      deleteMutation.mutate(doc.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            {t('lp_no_documents')}
          </div>
        )}
      </CardContent>

      {/* Bulk Import Dialog */}
      <LegalPracticeBulkImport
        open={bulkImportOpen}
        onOpenChange={setBulkImportOpen}
      />

      {/* AI Import Dialog */}
      <LegalPracticeAIImport 
        open={aiImportOpen} 
        onOpenChange={setAiImportOpen} 
      />
    </Card>
  );
}
