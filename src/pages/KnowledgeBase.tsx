import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Database } from '@/integrations/supabase/types';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { KBSearchFilters } from '@/components/kb/KBSearchFilters';
import { KBDocumentCard } from '@/components/kb/KBDocumentCard';
import { KBDocumentForm } from '@/components/kb/KBDocumentForm';
import { KBPagination } from '@/components/kb/KBPagination';
import { KBPdfUpload } from '@/components/kb/KBPdfUpload';
import { KBBulkImport } from '@/components/kb/KBBulkImport';
import { KBMultiFileUpload } from '@/components/kb/KBMultiFileUpload';
import { KBSearchPanel } from '@/components/kb/KBSearchPanel';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useKnowledgeBase, type KBFilters } from '@/hooks/useKnowledgeBase';
import { useAuth } from '@/hooks/useAuth';
import { 
  Scale, 
  Plus, 
  Loader2,
  LogOut,
  BookOpen,
  ArrowLeft,
  FileUp,
  FileStack,
  Folder,
  FolderOpen,
  ChevronRight,
  Gavel,
} from 'lucide-react';
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

type KnowledgeBase = Database['public']['Tables']['knowledge_base']['Row'];
type KBSearchResult = {
  id: string;
  title: string;
  content_text: string;
  category: Database['public']['Enums']['kb_category'];
  source_name: string | null;
  version_date: string | null;
  rank: number;
};

const KnowledgeBasePage = () => {
  const { t } = useTranslation(['kb', 'common', 'disclaimer']);
  const navigate = useNavigate();
  const { user, signOut, isAdmin } = useAuth();
  
  const [filters, setFilters] = useState<KBFilters>({ page: 1, pageSize: 200 });
  const [formOpen, setFormOpen] = useState(false);
  const [pdfUploadOpen, setPdfUploadOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [multiFileUploadOpen, setMultiFileUploadOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<KnowledgeBase | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

  const { 
    documents, 
    pagination, 
    isLoading, 
    createDocument, 
    updateDocument, 
    deleteDocument 
  } = useKnowledgeBase(filters);

  // Group documents by source_name
  const groupedDocuments = useMemo(() => {
    const groups = new Map<string, Array<(typeof documents)[number]>>();
    for (const doc of documents) {
      let raw = ('source_name' in doc && doc.source_name) ? doc.source_name : t('common:other', 'Other');
      // Normalize unicode and trim whitespace for consistent grouping
      raw = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
      if (!groups.has(raw)) groups.set(raw, []);
      groups.get(raw)!.push(doc);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [documents, t]);

  const toggleFolder = (name: string) => {
    setOpenFolders(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleCreate = (data: Database['public']['Tables']['knowledge_base']['Insert']) => {
    createDocument.mutate(data, {
      onSuccess: () => {
        setFormOpen(false);
        setPdfUploadOpen(false);
      },
    });
  };

  const handlePdfImport = (data: {
    title: string;
    content_text: string;
    category: Database['public']['Enums']['kb_category'];
    source_name: string;
  }) => {
    createDocument.mutate(data, {
      onSuccess: () => setPdfUploadOpen(false),
    });
  };

  const handleUpdate = (data: Database['public']['Tables']['knowledge_base']['Update']) => {
    if (editingDoc) {
      updateDocument.mutate(
        { id: editingDoc.id, updates: data },
        { onSuccess: () => setEditingDoc(null) }
      );
    }
  };

  const handleDeleteConfirm = () => {
    if (deletingDocId) {
      deleteDocument.mutate(deletingDocId);
      setDeletingDocId(null);
    }
  };

  const handlePageChange = (page: number) => {
    setFilters({ ...filters, page });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="container mx-auto flex h-14 sm:h-16 items-center justify-between px-3 sm:px-4">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <h1 className="text-lg sm:text-xl font-bold hidden sm:block">{t('common:app_name')}</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {user && (
              <span className="hidden text-sm text-muted-foreground sm:block truncate max-w-[120px]">
                {user.email}
              </span>
            )}
            <LanguageSwitcher />
            {user && (
              <Button variant="ghost" size="icon" onClick={() => signOut()}>
                <LogOut className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {/* Back Button */}
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('common:back', 'Back')}
        </Button>

        {/* Page Header */}
        <div className="mb-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <BookOpen className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">{t('knowledge_base')}</h2>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t('common:legal_documents', 'Legal documents and articles')}
                </p>
              </div>
            </div>
            {isAdmin && (
              <Button onClick={() => setFormOpen(true)} size="sm" className="sm:hidden">
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
          {isAdmin && (
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setMultiFileUploadOpen(true)} className="text-xs sm:text-sm">
                <FileStack className="mr-1 sm:mr-2 h-4 w-4" />
                <span className="hidden sm:inline">{'\u0536\u0561\u0576\u0563\u057E\u0561\u056E\u0561\u0575\u056B\u0576 \u0576\u0565\u0580\u0562\u0565\u057C\u0576\u0578\u0582\u0574'}</span>
                <span className="sm:hidden">Bulk</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setBulkImportOpen(true)} className="text-xs sm:text-sm">
                <FileUp className="mr-1 sm:mr-2 h-4 w-4" />
                TXT
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPdfUploadOpen(true)} className="text-xs sm:text-sm">
                <FileUp className="mr-1 sm:mr-2 h-4 w-4" />
                PDF
              </Button>
              <Button onClick={() => setFormOpen(true)} size="sm" className="hidden sm:flex">
                <Plus className="mr-2 h-4 w-4" />
                {t('add_document')}
              </Button>
            </div>
          )}
        </div>

        {/* Tabs: Legislation + Judicial Practice */}
        <Tabs defaultValue="legislation" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="legislation" className="gap-1.5">
              <BookOpen className="h-4 w-4" />
              {t('tab_legislation', '\u0555\u0580\u0565\u0576\u057D\u0564\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576')}
            </TabsTrigger>
            <TabsTrigger value="practice" className="gap-1.5">
              <Gavel className="h-4 w-4" />
              {t('tab_practice', '\u0534\u0561\u057F\u0561\u056F\u0561\u0576 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561')}
            </TabsTrigger>
          </TabsList>

          {/* Legislation Tab */}
          <TabsContent value="legislation">
            {/* Search & Filters */}
            <div className="mb-6">
              <KBSearchFilters filters={filters} onFiltersChange={setFilters} />
            </div>

            {/* Results info */}
            {filters.search && filters.search.length >= 2 && documents.length > 0 && (
              <p className="mb-4 text-sm text-muted-foreground">
                {t('results_found', { count: documents.length })}
              </p>
            )}

            {/* Documents Grid */}
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
                <BookOpen className="h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4 text-lg font-medium text-muted-foreground">
                  {t('no_results')}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {groupedDocuments.map(([sourceName, docs]) => {
                    const isOpen = openFolders.has(sourceName);
                    return (
                      <Collapsible key={sourceName} open={isOpen} onOpenChange={() => toggleFolder(sourceName)}>
                        <CollapsibleTrigger asChild>
                          <button className="flex w-full items-center gap-2 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50">
                            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                            {isOpen ? (
                              <FolderOpen className="h-5 w-5 text-primary" />
                            ) : (
                              <Folder className="h-5 w-5 text-primary" />
                            )}
                            <span className="flex-1 font-medium">{sourceName}</span>
                            <span className="text-sm text-muted-foreground">{docs.length}</span>
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-2 grid gap-4 pl-6 sm:grid-cols-2 lg:grid-cols-3">
                            {docs.map((doc) => (
                              <KBDocumentCard
                                key={doc.id}
                                document={doc}
                                onView={(id) => navigate(`/kb/${id}`)}
                                onEdit={isAdmin ? (id) => {
                                  const docToEdit = documents.find((d) => d.id === id);
                                  if (docToEdit && 'is_active' in docToEdit) setEditingDoc(docToEdit as KnowledgeBase);
                                } : undefined}
                                onDelete={isAdmin ? (id) => setDeletingDocId(id) : undefined}
                                isAdmin={isAdmin}
                                rank={'rank' in doc ? (doc.rank as number) : undefined}
                              />
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </div>

                {/* Pagination */}
                {pagination && (
                  <div className="mt-6">
                    <KBPagination 
                      page={pagination.page}
                      totalPages={pagination.totalPages}
                      total={pagination.total}
                      onPageChange={handlePageChange}
                    />
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Judicial Practice Tab */}
          <TabsContent value="practice">
            <KBSearchPanel />
          </TabsContent>
        </Tabs>

        {/* Legal Disclaimer */}
        <div className="mt-8 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-amber-700 dark:text-amber-400">
            ⚠️ {t('disclaimer:main')}
          </p>
        </div>
      </main>

      {/* Create/Edit Form */}
      <KBDocumentForm
        open={formOpen || !!editingDoc}
        onOpenChange={(open) => {
          if (!open) {
            setFormOpen(false);
            setEditingDoc(null);
          }
        }}
        onSubmit={editingDoc ? handleUpdate : handleCreate}
        initialData={editingDoc}
        isLoading={createDocument.isPending || updateDocument.isPending}
      />

      {/* PDF Upload */}
      <KBPdfUpload
        open={pdfUploadOpen}
        onOpenChange={setPdfUploadOpen}
        onSuccess={handlePdfImport}
      />

      {/* Bulk Import (TXT) */}
      <KBBulkImport
        open={bulkImportOpen}
        onOpenChange={setBulkImportOpen}
        onSuccess={() => {
          setBulkImportOpen(false);
          // Refresh the list
          setFilters({ ...filters });
        }}
      />

      {/* Multi-File Upload (Bulk PDF/Images) */}
      <KBMultiFileUpload
        open={multiFileUploadOpen}
        onOpenChange={setMultiFileUploadOpen}
        onSuccess={() => {
          setMultiFileUploadOpen(false);
          // Refresh the list
          setFilters({ ...filters });
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingDocId} onOpenChange={() => setDeletingDocId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_document')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('confirm_delete')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              {t('common:delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default KnowledgeBasePage;
