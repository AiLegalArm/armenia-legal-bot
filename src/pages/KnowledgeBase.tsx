import { useState } from 'react';
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
import { Button } from '@/components/ui/button';
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
  FileStack
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
  
  const [filters, setFilters] = useState<KBFilters>({ page: 1, pageSize: 12 });
  const [formOpen, setFormOpen] = useState(false);
  const [pdfUploadOpen, setPdfUploadOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [multiFileUploadOpen, setMultiFileUploadOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<KnowledgeBase | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  const { 
    documents, 
    pagination, 
    isLoading, 
    createDocument, 
    updateDocument, 
    deleteDocument 
  } = useKnowledgeBase(filters);

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
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">{t('common:app_name')}</h1>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <span className="hidden text-sm text-muted-foreground sm:block">
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
      <main className="container mx-auto px-4 py-6">
        {/* Back Button */}
        <Button variant="ghost" className="mb-4" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('common:back', 'Back')}
        </Button>

        {/* Page Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="h-8 w-8 text-primary" />
            <div>
              <h2 className="text-2xl font-bold">{t('knowledge_base')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('common:legal_documents', 'Legal documents and articles')}
              </p>
            </div>
          </div>
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setMultiFileUploadOpen(true)}>
                <FileStack className="mr-2 h-4 w-4" />
                Զանգվածային ներմուծում
              </Button>
              <Button variant="outline" onClick={() => setBulkImportOpen(true)}>
                <FileUp className="mr-2 h-4 w-4" />
                TXT Import
              </Button>
              <Button variant="outline" onClick={() => setPdfUploadOpen(true)}>
                <FileUp className="mr-2 h-4 w-4" />
                PDF Import
              </Button>
              <Button onClick={() => setFormOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {t('add_document')}
              </Button>
            </div>
          )}
        </div>

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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {documents.map((doc) => (
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

        {/* Legal Disclaimer */}
        <div className="mt-8 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-700 dark:text-amber-400">
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
