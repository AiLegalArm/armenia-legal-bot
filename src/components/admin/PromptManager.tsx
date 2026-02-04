import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Copy,
  Eye,
  History,
  Download,
  Upload,
  Loader2,
  FileCode,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';

// AI Functions list
const AI_FUNCTIONS = [
  { id: 'ai-analyze', name: 'AI Analyze', nameHy: 'AI Վdelays' },
  { id: 'generate-document', name: 'Generate Document', nameHy: 'Փdelays delays' },
  { id: 'generate-complaint', name: 'Generate Complaint', nameHy: 'Բdelays delays' },
  { id: 'legal-chat', name: 'Legal Chat', nameHy: 'Իdelays Չdelays' },
  { id: 'ocr-process', name: 'OCR Process', nameHy: 'OCR Մdelays' },
  { id: 'audio-transcribe', name: 'Audio Transcribe', nameHy: 'Աdelays Տdelays' },
  { id: 'extract-case-fields', name: 'Extract Case Fields', nameHy: 'Դashy Հdelays' },
  { id: 'legal-practice-import', name: 'Legal Practice Import', nameHy: 'Պdelays Delays' },
];

interface Prompt {
  id: string;
  function_name: string;
  module_type: string;
  name_hy: string;
  name_ru: string;
  name_en: string | null;
  description: string | null;
  prompt_text: string;
  is_active: boolean;
  current_version: number;
  created_at: string;
  updated_at: string;
}

interface PromptVersion {
  id: string;
  prompt_id: string;
  version_number: number;
  prompt_text: string;
  change_reason: string | null;
  changed_at: string;
}

const PAGE_SIZE = 15;

export const PromptManager = () => {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFunction, setFilterFunction] = useState<string>('all');
  const [page, setPage] = useState(1);
  
  // Dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [versionsDialogOpen, setVersionsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    function_name: '',
    module_type: '',
    name_hy: '',
    name_ru: '',
    name_en: '',
    description: '',
    prompt_text: '',
  });
  const [saving, setSaving] = useState(false);

  // Fetch prompts
  const fetchPrompts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ai_prompts')
        .select('*')
        .order('function_name')
        .order('module_type');
      
      if (error) throw error;
      setPrompts((data || []) as Prompt[]);
    } catch (error) {
      console.error('Error fetching prompts:', error);
      toast.error('Չdelays delays prompts- delays');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrompts();
  }, []);

  // Filtered and paginated prompts
  const filteredPrompts = useMemo(() => {
    let result = prompts;
    
    if (filterFunction !== 'all') {
      result = result.filter(p => p.function_name === filterFunction);
    }
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.name_hy.toLowerCase().includes(q) ||
        p.name_ru.toLowerCase().includes(q) ||
        p.module_type.toLowerCase().includes(q) ||
        p.prompt_text.toLowerCase().includes(q)
      );
    }
    
    return result;
  }, [prompts, filterFunction, searchQuery]);

  const totalPages = Math.ceil(filteredPrompts.length / PAGE_SIZE);
  const paginatedPrompts = filteredPrompts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Handle form submission
  const handleSave = async () => {
    if (!formData.function_name || !formData.module_type || !formData.name_hy || !formData.prompt_text) {
      toast.error('Լdelays delays delays delays');
      return;
    }

    setSaving(true);
    try {
      if (selectedPrompt) {
        // Update existing
        const { error } = await supabase
          .from('ai_prompts')
          .update({
            function_name: formData.function_name,
            module_type: formData.module_type,
            name_hy: formData.name_hy,
            name_ru: formData.name_ru,
            name_en: formData.name_en || null,
            description: formData.description || null,
            prompt_text: formData.prompt_text,
          })
          .eq('id', selectedPrompt.id);
        
        if (error) throw error;
        toast.success('Պdelays delays delays');
      } else {
        // Create new
        const { error } = await supabase
          .from('ai_prompts')
          .insert({
            function_name: formData.function_name,
            module_type: formData.module_type,
            name_hy: formData.name_hy,
            name_ru: formData.name_ru,
            name_en: formData.name_en || null,
            description: formData.description || null,
            prompt_text: formData.prompt_text,
          });
        
        if (error) throw error;
        toast.success('Պdelays delays delays');
      }
      
      setEditDialogOpen(false);
      fetchPrompts();
    } catch (error: unknown) {
      console.error('Error saving prompt:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(` Delays: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!selectedPrompt) return;
    
    try {
      const { error } = await supabase
        .from('ai_prompts')
        .delete()
        .eq('id', selectedPrompt.id);
      
      if (error) throw error;
      toast.success('Պdelays delays delays');
      setDeleteDialogOpen(false);
      fetchPrompts();
    } catch (error) {
      console.error('Error deleting prompt:', error);
      toast.error('Չdelays delays delays prompt-delays');
    }
  };

  // Handle duplicate
  const handleDuplicate = async (prompt: Prompt) => {
    try {
      const { error } = await supabase
        .from('ai_prompts')
        .insert({
          function_name: prompt.function_name,
          module_type: `${prompt.module_type}_copy`,
          name_hy: `${prompt.name_hy} (delays)`,
          name_ru: `${prompt.name_ru} (delays)`,
          name_en: prompt.name_en ? `${prompt.name_en} (copy)` : null,
          description: prompt.description,
          prompt_text: prompt.prompt_text,
        });
      
      if (error) throw error;
      toast.success('Պdelays delays delays');
      fetchPrompts();
    } catch (error) {
      console.error('Error duplicating prompt:', error);
      toast.error('Չdelays delays delays prompt-delays');
    }
  };

  // Fetch versions
  const fetchVersions = async (promptId: string) => {
    setVersionsLoading(true);
    try {
      const { data, error } = await supabase
        .from('ai_prompt_versions')
        .select('*')
        .eq('prompt_id', promptId)
        .order('version_number', { ascending: false });
      
      if (error) throw error;
      setVersions((data || []) as PromptVersion[]);
    } catch (error) {
      console.error('Error fetching versions:', error);
      toast.error('Չdelays delays delays');
    } finally {
      setVersionsLoading(false);
    }
  };

  // Export prompts to JSON
  const handleExport = () => {
    const exportData = prompts.map(p => ({
      function_name: p.function_name,
      module_type: p.module_type,
      name_hy: p.name_hy,
      name_ru: p.name_ru,
      name_en: p.name_en,
      description: p.description,
      prompt_text: p.prompt_text,
    }));
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai_prompts_${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Էdelays delays delays');
  };

  // Import prompts from JSON
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importData = JSON.parse(text);
      
      if (!Array.isArray(importData)) {
        throw new Error('Invalid JSON format');
      }

      let imported = 0;
      let skipped = 0;

      for (const item of importData) {
        if (!item.function_name || !item.module_type || !item.name_hy || !item.prompt_text) {
          skipped++;
          continue;
        }

        const { error } = await supabase
          .from('ai_prompts')
          .upsert({
            function_name: item.function_name,
            module_type: item.module_type,
            name_hy: item.name_hy,
            name_ru: item.name_ru || item.name_hy,
            name_en: item.name_en || null,
            description: item.description || null,
            prompt_text: item.prompt_text,
          }, {
            onConflict: 'function_name,module_type',
          });

        if (error) {
          console.error('Import error:', error);
          skipped++;
        } else {
          imported++;
        }
      }

      toast.success(`Imports delays: ${imported}, skipped: ${skipped}`);
      fetchPrompts();
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Սdelays delays import-delays');
    }
    
    // Reset input
    event.target.value = '';
  };

  // Open edit dialog
  const openEditDialog = (prompt?: Prompt) => {
    if (prompt) {
      setSelectedPrompt(prompt);
      setFormData({
        function_name: prompt.function_name,
        module_type: prompt.module_type,
        name_hy: prompt.name_hy,
        name_ru: prompt.name_ru,
        name_en: prompt.name_en || '',
        description: prompt.description || '',
        prompt_text: prompt.prompt_text,
      });
    } else {
      setSelectedPrompt(null);
      setFormData({
        function_name: '',
        module_type: '',
        name_hy: '',
        name_ru: '',
        name_en: '',
        description: '',
        prompt_text: '',
      });
    }
    setEditDialogOpen(true);
  };

  // Open preview dialog
  const openPreviewDialog = (prompt: Prompt) => {
    setSelectedPrompt(prompt);
    setPreviewDialogOpen(true);
  };

  // Open versions dialog
  const openVersionsDialog = (prompt: Prompt) => {
    setSelectedPrompt(prompt);
    fetchVersions(prompt.id);
    setVersionsDialogOpen(true);
  };

  // Open delete dialog
  const openDeleteDialog = (prompt: Prompt) => {
    setSelectedPrompt(prompt);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCode className="h-5 w-5" />
            Պdelays Մdelays (Prompt Manager)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Փdelays..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterFunction} onValueChange={setFilterFunction}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder=" Delays delays" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alls delays</SelectItem>
                  {AI_FUNCTIONS.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => openEditDialog()}>
                <Plus className="mr-1.5 h-4 w-4" />
                 Delays
              </Button>
              <Button variant="outline" onClick={handleExport}>
                <Download className="mr-1.5 h-4 w-4" />
                Эdelays
              </Button>
              <label>
                <Button variant="outline" asChild>
                  <span>
                    <Upload className="mr-1.5 h-4 w-4" />
                    Иdelays
                  </span>
                </Button>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>Alls: {prompts.length}</span>
            <span>|</span>
            <span>Filtered: {filteredPrompts.length}</span>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Delays</TableHead>
                    <TableHead className="w-[150px]">Delays/Тdelays</TableHead>
                    <TableHead>Delays (RU)</TableHead>
                    <TableHead className="w-[100px]">Вdelays</TableHead>
                    <TableHead className="w-[120px]">Обdelays</TableHead>
                    <TableHead className="w-[180px] text-right">Delays</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPrompts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        Delays delays delays
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedPrompts.map((prompt) => (
                      <TableRow key={prompt.id}>
                        <TableCell className="font-medium">
                          <span className="rounded bg-primary/10 px-2 py-1 text-xs">
                            {prompt.function_name}
                          </span>
                        </TableCell>
                        <TableCell>{prompt.module_type}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{prompt.name_ru}</div>
                            <div className="text-xs text-muted-foreground">{prompt.name_hy}</div>
                          </div>
                        </TableCell>
                        <TableCell>v{prompt.current_version}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(prompt.updated_at), 'dd.MM.yyyy')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openPreviewDialog(prompt)}
                              title="Пdelays"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(prompt)}
                              title="Рdelays"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDuplicate(prompt)}
                              title="Дdelays"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openVersionsDialog(prompt)}
                              title="Вdelays"
                            >
                              <History className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openDeleteDialog(prompt)}
                              title="Уdelays"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedPrompt ? 'Рdelays промпт' : 'Ноdelays промпт'}
            </DialogTitle>
            <DialogDescription>
              Зdelays delays delays delays delays
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Фdelays *</label>
                <Select
                  value={formData.function_name}
                  onValueChange={(v) => setFormData({ ...formData, function_name: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Вdelays delays" />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_FUNCTIONS.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Мdelays/Тdelays *</label>
                <Input
                  value={formData.module_type}
                  onChange={(e) => setFormData({ ...formData, module_type: e.target.value })}
                  placeholder="напр. defense, civil_appeal"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Нdelays (HY) *</label>
                <Input
                  value={formData.name_hy}
                  onChange={(e) => setFormData({ ...formData, name_hy: e.target.value })}
                  placeholder="Delays delays"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Нdelays (RU) *</label>
                <Input
                  value={formData.name_ru}
                  onChange={(e) => setFormData({ ...formData, name_ru: e.target.value })}
                  placeholder="Нdelays delays delays"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Нdelays (EN)</label>
              <Input
                value={formData.name_en}
                onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
                placeholder="English name (optional)"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Оdelays</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Кdelays delays delays delays..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Тdelays промпта *</label>
              <Textarea
                value={formData.prompt_text}
                onChange={(e) => setFormData({ ...formData, prompt_text: e.target.value })}
                placeholder="Вdelays delays delays delays..."
                rows={15}
                className="font-mono text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Оdelays
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Сdelays
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedPrompt?.name_ru}</DialogTitle>
            <DialogDescription>
              {selectedPrompt?.function_name} / {selectedPrompt?.module_type}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted p-4">
            <pre className="whitespace-pre-wrap font-mono text-sm">
              {selectedPrompt?.prompt_text}
            </pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>
              Зdelays
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Versions Dialog */}
      <Dialog open={versionsDialogOpen} onOpenChange={setVersionsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Иdelays версий: {selectedPrompt?.name_ru}</DialogTitle>
            <DialogDescription>
              Тdelays delays: v{selectedPrompt?.current_version}
            </DialogDescription>
          </DialogHeader>
          
          {versionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              Иdelays delays delays delays
            </div>
          ) : (
            <div className="space-y-4">
              {versions.map((v) => (
                <Card key={v.id}>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Вdelays {v.version_number}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(v.changed_at), 'dd.MM.yyyy HH:mm')}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="py-2">
                    <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs">
                      {v.prompt_text.substring(0, 500)}...
                    </pre>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setVersionsDialogOpen(false)}>
              Зdelays
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Уdelays промпт?</AlertDialogTitle>
            <AlertDialogDescription>
              Эdelays delays delays delays delays. Вdelays delays delays delays delays: 
              <strong> {selectedPrompt?.name_ru}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Оdelays</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Уdelays
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
