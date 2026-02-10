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
import { Plus, Trash2, Edit, Search, FileText, Scale, AlertTriangle, Sparkles, FolderUp, Wand2, Loader2, Folder, FolderOpen, ChevronRight } from 'lucide-react';
import { LegalPracticeAIImport } from './LegalPracticeAIImport';
import { LegalPracticeBulkImport } from './LegalPracticeBulkImport';

// Types matching database schema
type CourtType = 'first_instance' | 'appeal' | 'cassation' | 'constitutional' | 'echr';
type PracticeCategory = 'criminal' | 'civil' | 'administrative' | 'echr';
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
  applied_articles: Array<{ code: string; articles: string[] }>;
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

const courtTypeLabels: Record<CourtType, string> = {
  first_instance: '\u0531\u057C\u0561\u057B\u056B\u0576 \u0561\u057F\u0575\u0561\u0576',
  appeal: '\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579',
  cassation: '\u054E\u0573\u057C\u0561\u0562\u0565\u056F',
  constitutional: '\u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576',
  echr: '\u0535\u054D\u054A\u053F'
};

const categoryLabels: Record<PracticeCategory, string> = {
  criminal: '\u0554\u0580\u0565\u0561\u056F\u0561\u0576',
  civil: '\u0554\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576',
  administrative: '\u054E\u0561\u0580\u0579\u0561\u056F\u0561\u0576',
  echr: '\u0535\u054D\u054A\u053F'
};

const outcomeLabels: Record<CaseOutcome, string> = {
  granted: '\u0532\u0561\u057E\u0561\u0580\u0561\u0580\u057E\u0565\u056C',
  rejected: '\u0544\u0565\u0580\u056A\u057E\u0565\u056C',
  partial: '\u0544\u0561\u057D\u0576\u0561\u056F\u056B',
  remanded: '\u054E\u0565\u0580\u0561\u0564\u0561\u0580\u0571\u057E\u0565\u056C',
  discontinued: '\u053F\u0561\u0580\u0573\u057E\u0565\u056C'
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
  applied_articles: [] as Array<{ code: string; articles: string[] }>,
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

  // Fetch documents
  const { data: documents, isLoading } = useQuery({
    queryKey: ['legal-practice-kb', searchTerm, filterCategory],
    queryFn: async () => {
      let query = supabase
        .from('legal_practice_kb')
        .select('*')
        .order('created_at', { ascending: false });

      if (filterCategory !== 'all') {
        query = query.eq('practice_category', filterCategory);
      }

      if (searchTerm) {
        query = query.or(`title.ilike.%${searchTerm}%,content_text.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((doc: any) => ({
        ...doc,
        applied_articles: Array.isArray(doc.applied_articles) ? doc.applied_articles : []
      })) as LegalPracticeDocument[];
    }
  });

  // Group documents by source_name
  const groupedDocuments = useMemo(() => {
    if (!documents) return [];
    const groups = new Map<string, LegalPracticeDocument[]>();
    for (const doc of documents) {
      const key = doc.source_name || '\u0531\u0575\u056C';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(doc);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [documents]);

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
        applied_articles: data.applied_articles.length > 0 ? data.applied_articles : [],
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
      toast.success(editingDoc ? '\u0553\u0561\u057D\u057F\u0561\u0569\u0578\u0582\u0572\u0569\u0568 \u0569\u0561\u0580\u0574\u0561\u0581\u057E\u0565\u0581' : '\u0553\u0561\u057D\u057F\u0561\u0569\u0578\u0582\u0572\u0569\u0568 \u0561\u057E\u0565\u056C\u0561\u0581\u057E\u0565\u0581');
      resetForm();
    },
    onError: (error) => {
      console.error('Save error:', error);
      toast.error('\u054D\u056D\u0561\u056C \u057A\u0561\u0570\u057A\u0561\u0576\u0574\u0561\u0576 \u056A\u0561\u0574\u0561\u0576\u0561\u056F');
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
      toast.success('\u0553\u0561\u057D\u057F\u0561\u0569\u0578\u0582\u0572\u0569\u0568 \u057B\u0576\u057B\u057E\u0565\u0581');
    },
    onError: () => {
      toast.error('\u054D\u056D\u0561\u056C \u057B\u0576\u057B\u0574\u0561\u0576 \u056A\u0561\u0574\u0561\u0576\u0561\u056F');
    }
  });

  // AI Enrich mutation
  const handleEnrich = async (docId: string, silent = false) => {
    setEnrichingIds(prev => new Set(prev).add(docId));
    try {
      // Retry up to 2 times on transient errors
      let lastErr: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { data, error } = await supabase.functions.invoke('legal-practice-import', {
            body: { enrichDocId: docId },
          });
          if (error) throw error;
          if (data?.enriched) {
            if (!silent) toast.success(`AI \u0570\u0561\u0580\u057D\u057F\u0561\u0581\u0580\u0565\u0581\u055D ${(data.updated_fields as string[]).length} \u0564\u0561\u0577\u057F`);
            queryClient.invalidateQueries({ queryKey: ['legal-practice-kb'] });
          } else {
            if (!silent) toast.info('\u0544\u0565\u057F\u0561\u057F\u057E\u0575\u0561\u056C\u0576\u0565\u0580 \u0579\u0565\u0576 \u0570\u0561\u0575\u057F\u0576\u0561\u0562\u0565\u0580\u057E\u0565\u056C');
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
      if (!silent) toast.error('AI \u0570\u0561\u0580\u057D\u057F\u0561\u0581\u0574\u0561\u0576 \u057D\u056D\u0561\u056C');
      return false;
    } finally {
      setEnrichingIds(prev => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  };

  const handleBulkEnrich = async () => {
    if (!documents) return;
    const emptyDocs = documents.filter(d => !d.court_name && !d.case_number_anonymized && !d.decision_date);
    if (emptyDocs.length === 0) {
      toast.info('\u0532\u0578\u056C\u0578\u0580 \u0563\u0580\u0561\u057C\u0578\u0582\u0574\u0576\u0565\u0580\u0576 \u0561\u0580\u0564\u0565\u0576 \u0570\u0561\u0580\u057D\u057F\u0561\u0581\u057E\u0561\u056E \u0565\u0576');
      return;
    }
    toast.info(`AI \u0570\u0561\u0580\u057D\u057F\u0561\u0581\u0576\u0578\u0582\u0574\u055D ${emptyDocs.length} \u0563\u0580\u0561\u057C\u0578\u0582\u0574...`);
    let success = 0;
    let fail = 0;
    for (const doc of emptyDocs) {
      const ok = await handleEnrich(doc.id, true);
      if (ok) success++; else fail++;
      // Small delay between sequential calls to avoid overwhelming edge functions
      await new Promise(r => setTimeout(r, 500));
    }
    if (success > 0) toast.success(`\u0540\u0561\u0580\u057D\u057F\u0561\u0581\u057E\u0565\u0581\u055D ${success} \u0563\u0580\u0561\u057C\u0578\u0582\u0574`);
    if (fail > 0) toast.error(`\u054D\u056D\u0561\u056C\u057E\u0565\u0581\u055D ${fail} \u0563\u0580\u0561\u057C\u0578\u0582\u0574`);
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
    setArticlesInput(JSON.stringify(doc.applied_articles || [], null, 2));
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Parse key violations from comma-separated input
    const violations = keyViolationsInput
      .split(',')
      .map(v => v.trim())
      .filter(v => v.length > 0);
    
    // Parse applied articles from JSON input
    let articles: Array<{ code: string; articles: string[] }> = [];
    try {
      if (articlesInput.trim()) {
        articles = JSON.parse(articlesInput);
      }
    } catch {
      toast.error('\u053D\u0578\u0572\u0577\u0561\u056F JSON \u0571\u0587\u0561\u0579\u0561\u0583 \u0570\u0578\u0564\u057E\u0561\u056E\u0576\u0565\u0580\u056B \u0570\u0561\u0574\u0561\u0580');
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
          <span>{'\u053B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561\u0575\u056B \u0562\u0561\u0566\u0561 (KB)'}</span>
        </CardTitle>
        <CardDescription className="flex items-center gap-2 text-amber-600">
          <AlertTriangle className="h-4 w-4" />
          <span>{'\u0544\u056B\u0561\u0575\u0576 \u0561\u0564\u0574\u056B\u0576\u056B\u057D\u057F\u0580\u0561\u057F\u0578\u0580\u0576\u0565\u0580\u056B \u0570\u0561\u0574\u0561\u0580 \u0587 AI-\u056B \u056E\u0580\u0561\u0575\u056B\u0576 \u0585\u0563\u057F\u0561\u0563\u0578\u0580\u056E\u0574\u0561\u0576 \u0570\u0561\u0574\u0561\u0580'}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search and filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={'\u0548\u0580\u0578\u0576\u0565\u056C \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561\u0575\u056B \u0562\u0561\u0566\u0561\u0575\u0578\u0582\u0574...'}
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
              <SelectValue placeholder={'\u053F\u0561\u057F\u0565\u0563\u0578\u0580\u056B\u0561'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{'\u0532\u0578\u056C\u0578\u0580\u0568'}</SelectItem>
              {Object.entries(categoryLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            onClick={() => setBulkImportOpen(true)}
          >
            <FolderUp className="h-4 w-4 mr-2" />
            {'\u0544\u0561\u057D\u057D\u0561\u0575\u0561\u056F\u0561\u0576'}
          </Button>
          <Button 
            variant="outline" 
            onClick={handleBulkEnrich}
            className="border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
          >
            <Wand2 className="h-4 w-4 mr-2" />
            AI {'\u0540\u0561\u0580\u057D\u057F\u0561\u0581\u0576\u0565\u056C'}
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setAiImportOpen(true)}
            className="border-purple-500/50 text-purple-600 hover:bg-purple-500/10"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            AI {'\u053B\u0574\u057A\u0578\u0580\u057F'}
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                {'\u0531\u057E\u0565\u056C\u0561\u0581\u0576\u0565\u056C'}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingDoc ? '\u053D\u0574\u0562\u0561\u0563\u0580\u0565\u056C \u0583\u0561\u057D\u057F\u0561\u0569\u0578\u0582\u0572\u0569\u0568' : '\u0531\u057E\u0565\u056C\u0561\u0581\u0576\u0565\u056C \u0576\u0578\u0580 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>{'\u054E\u0565\u0580\u0576\u0561\u0563\u056B\u0580'}</Label>
                    <Input
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      required
                    />
                  </div>
                  
                  <div>
                    <Label>{'\u053F\u0561\u057F\u0565\u0563\u0578\u0580\u056B\u0561'}</Label>
                    <Select
                      value={formData.practice_category}
                      onValueChange={(v) => setFormData({ ...formData, practice_category: v as PracticeCategory })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(categoryLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label>{'\u0531\u057F\u0575\u0561\u0576'}</Label>
                    <Select
                      value={formData.court_type}
                      onValueChange={(v) => setFormData({ ...formData, court_type: v as CourtType })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(courtTypeLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label>{'\u0531\u0580\u0564\u0575\u0578\u0582\u0576\u0584'}</Label>
                    <Select
                      value={formData.outcome}
                      onValueChange={(v) => setFormData({ ...formData, outcome: v as CaseOutcome })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(outcomeLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label>{'\u0548\u0580\u0578\u0577\u0574\u0561\u0576 \u0561\u0574\u057D\u0561\u0569\u056B\u057E'}</Label>
                    <Input
                      type="date"
                      value={formData.decision_date}
                      onChange={(e) => setFormData({ ...formData, decision_date: e.target.value })}
                    />
                  </div>
                  
                  <div>
                    <Label>{'\u0534\u0561\u057F\u0561\u0580\u0561\u0576\u056B \u0561\u0576\u0578\u0582\u0576'}</Label>
                    <Input
                      value={formData.court_name}
                      onChange={(e) => setFormData({ ...formData, court_name: e.target.value })}
                    />
                  </div>
                  
                  <div>
                    <Label>{'\u0533\u0578\u0580\u056E\u056B \u0570\u0561\u0574\u0561\u0580 (\u0561\u0576\u0578\u0576\u056B\u0574)'}</Label>
                    <Input
                      value={formData.case_number_anonymized}
                      onChange={(e) => setFormData({ ...formData, case_number_anonymized: e.target.value })}
                      placeholder="\u0555\u0580\u056B\u0576\u0561\u056F\u055D XXX/0000/00/00"
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <Label>{'\u053F\u056B\u0580\u0561\u057C\u057E\u0561\u056E \u0570\u0578\u0564\u057E\u0561\u056E\u0576\u0565\u0580 (JSON)'}</Label>
                    <Textarea
                      value={articlesInput}
                      onChange={(e) => setArticlesInput(e.target.value)}
                      placeholder='[{"code": "criminal_code", "articles": ["104", "105"]}]'
                      rows={3}
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <Label>{'\u0540\u056B\u0574\u0576\u0561\u056F\u0561\u0576 \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580 (\u057D\u057F\u0578\u0580\u0561\u056F\u0565\u057F\u0578\u057E)'}</Label>
                    <Input
                      value={keyViolationsInput}
                      onChange={(e) => setKeyViolationsInput(e.target.value)}
                      placeholder={'\u0555\u0580\u056B\u0576\u0561\u056F\u055D \u0531\u0580\u0564\u0561\u0580 \u0564\u0561\u057F, \u0553\u0561\u057D\u057F\u0561\u0562\u0561\u0576\u056B \u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584'}
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <Label>{'\u053B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0570\u056B\u0574\u0576\u0561\u057E\u0578\u0580\u0578\u0582\u0574'}</Label>
                    <Textarea
                      value={formData.legal_reasoning_summary}
                      onChange={(e) => setFormData({ ...formData, legal_reasoning_summary: e.target.value })}
                      rows={3}
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <Label>{'\u0533\u0578\u0580\u056E\u056B \u0562\u0578\u057E\u0561\u0576\u0564\u0561\u056F\u0578\u0582\u0569\u0575\u0578\u0582\u0576 (\u0561\u0576\u0578\u0576\u056B\u0574\u0561\u0581\u057E\u0561\u056E)'}</Label>
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
                    {'\u0549\u0565\u0572\u0561\u0580\u056F\u0565\u056C'}
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? '\u054A\u0561\u0570\u057A\u0561\u0576\u0578\u0582\u0574...' : '\u054A\u0561\u0570\u057A\u0561\u0576\u0565\u056C'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Documents table */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            {'\u0532\u0565\u057C\u0576\u057E\u0578\u0582\u0574 \u0567...'}
          </div>
        ) : groupedDocuments.length > 0 ? (
          <div className="space-y-2">
            {groupedDocuments.map(([sourceName, docs]) => {
              const isOpen = openFolders.has(sourceName);
              return (
                <div key={sourceName}>
                  <button
                    onClick={() => toggleFolder(sourceName)}
                    className="flex w-full items-center gap-2 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                    {isOpen ? (
                      <FolderOpen className="h-5 w-5 text-primary" />
                    ) : (
                      <Folder className="h-5 w-5 text-primary" />
                    )}
                    <span className="flex-1 font-medium">{sourceName}</span>
                    <span className="text-sm text-muted-foreground">{docs.length}</span>
                  </button>
                  {isOpen && (
                    <div className="mt-1 ml-6">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{'\u054E\u0565\u0580\u0576\u0561\u0563\u056B\u0580'}</TableHead>
                            <TableHead>{'\u053F\u0561\u057F\u0565\u0563\u0578\u0580\u056B\u0561'}</TableHead>
                            <TableHead>{'\u0531\u057F\u0575\u0561\u0576'}</TableHead>
                            <TableHead>{'\u0531\u0580\u0564\u0575\u0578\u0582\u0576\u0584'}</TableHead>
                            <TableHead>{'\u0531\u0574\u057D\u0561\u0569\u056B\u057E'}</TableHead>
                            <TableHead className="text-right">{'\u0533\u0578\u0580\u056E\u0578\u0572\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580'}</TableHead>
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
                                  {categoryLabels[doc.practice_category]}
                                </Badge>
                              </TableCell>
                              <TableCell>{courtTypeLabels[doc.court_type]}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    doc.outcome === 'granted' ? 'default' :
                                    doc.outcome === 'rejected' ? 'destructive' :
                                    'secondary'
                                  }
                                >
                                  {outcomeLabels[doc.outcome]}
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
                                  title="AI Enrich"
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
                                    if (confirm('\u054E\u057D\u057F\u0561\u0570 \u0565\u0584, \u0578\u0580 \u0578\u0582\u0566\u0578\u0582\u0574 \u0565\u0584 \u057B\u0576\u057B\u0565\u056C \u0561\u0575\u057D \u0583\u0561\u057D\u057F\u0561\u0569\u0578\u0582\u0572\u0569\u0568?')) {
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
            {'\u0553\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580 \u0579\u0565\u0576 \u0563\u057F\u0576\u057E\u0565\u056C'}
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
