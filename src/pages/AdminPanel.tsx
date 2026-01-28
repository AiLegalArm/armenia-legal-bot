import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useKnowledgeBase, type KBFilters } from '@/hooks/useKnowledgeBase';
import { KBSearchFilters } from '@/components/kb/KBSearchFilters';
import { KBDocumentCard } from '@/components/kb/KBDocumentCard';
import { KBDocumentForm } from '@/components/kb/KBDocumentForm';
import { KBPagination } from '@/components/kb/KBPagination';
import { KBPdfUpload } from '@/components/kb/KBPdfUpload';
import { KBBulkImport } from '@/components/kb/KBBulkImport';
import { KBWebScraper } from '@/components/kb/KBWebScraper';
import { KBJsonlImport } from '@/components/kb/KBJsonlImport';
import { KBMultiFileUpload } from '@/components/kb/KBMultiFileUpload';
import { UsageMonitor } from '@/components/UsageMonitor';
import { UserManagement } from '@/components/admin/UserManagement';
import { TeamManagement } from '@/components/admin/TeamManagement';
import { UserFeedback } from '@/components/admin/UserFeedback';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Shield, 
  Plus, 
  Loader2,
  LogOut,
  BookOpen,
  BarChart3,
  Database as DatabaseIcon,
  Users,
  Users2,
  MessageSquare,
  FileUp,
  FileStack,
  Globe,
  FileJson
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
import type { Database } from '@/integrations/supabase/types';

type KnowledgeBase = Database['public']['Tables']['knowledge_base']['Row'];

const AdminPanel = () => {
  const { t } = useTranslation(['kb', 'common', 'usage']);
  const navigate = useNavigate();
  const { user, signOut, isAdmin, loading: authLoading } = useAuth();
  
  const [filters, setFilters] = useState<KBFilters>({ page: 1, pageSize: 12 });
  const [formOpen, setFormOpen] = useState(false);
  const [pdfUploadOpen, setPdfUploadOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [multiFileUploadOpen, setMultiFileUploadOpen] = useState(false);
  const [webScraperOpen, setWebScraperOpen] = useState(false);
  const [jsonlImportOpen, setJsonlImportOpen] = useState(false);
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

  // Protect admin route
  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate('/admin/login');
    }
  }, [user, isAdmin, authLoading, navigate]);

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

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin/login');
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Don't render if not admin
  if (!user || !isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Админ панель</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-muted-foreground sm:block">
              {user.email}
            </span>
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="kb" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:grid-cols-none lg:flex">
            <TabsTrigger value="kb" className="gap-2">
              <DatabaseIcon className="h-4 w-4" />
              Գիտելիքների բազա
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" />
              Օգտատերեր
            </TabsTrigger>
            <TabsTrigger value="teams" className="gap-2">
              <Users2 className="h-4 w-4" />
              Թիմեր
            </TabsTrigger>
            <TabsTrigger value="feedback" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Օգտատերերի կարծիքներ
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Վերլուծություն
            </TabsTrigger>
          </TabsList>

          {/* Knowledge Base Tab */}
          <TabsContent value="kb" className="space-y-6">
            {/* Action Buttons */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Գիտելիքների բազայի կառավարում
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setFormOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    {t('add_document')}
                  </Button>
                  <Button variant="secondary" onClick={() => setJsonlImportOpen(true)}>
                    <FileJson className="mr-2 h-4 w-4" />
                    JSONL Import (155K)
                  </Button>
                  <Button variant="outline" onClick={() => setWebScraperOpen(true)}>
                    <Globe className="mr-2 h-4 w-4" />
                    Веб-скрейпинг
                  </Button>
                  <Button variant="outline" onClick={() => setMultiFileUploadOpen(true)}>
                    <FileStack className="mr-2 h-4 w-4" />
                    {t('multi_upload_title')}
                  </Button>
                  <Button variant="outline" onClick={() => setBulkImportOpen(true)}>
                    <FileUp className="mr-2 h-4 w-4" />
                    TXT Import
                  </Button>
                  <Button variant="outline" onClick={() => setPdfUploadOpen(true)}>
                    <FileUp className="mr-2 h-4 w-4" />
                    PDF/OCR
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Search & Filters */}
            <div>
              <KBSearchFilters filters={filters} onFiltersChange={setFilters} />
            </div>

            {/* Results info */}
            {filters.search && filters.search.length >= 2 && documents.length > 0 && (
              <p className="text-sm text-muted-foreground">
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
                      onEdit={(id) => {
                        const docToEdit = documents.find((d) => d.id === id);
                        if (docToEdit && 'is_active' in docToEdit) setEditingDoc(docToEdit as KnowledgeBase);
                      }}
                      onDelete={(id) => setDeletingDocId(id)}
                      isAdmin={true}
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
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <UserManagement />
          </TabsContent>

          {/* Teams Tab */}
          <TabsContent value="teams">
            <TeamManagement />
          </TabsContent>

          {/* User Feedback Tab */}
          <TabsContent value="feedback">
            <UserFeedback />
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics">
            <UsageMonitor budgetLimit={10.0} compact={false} />
          </TabsContent>
        </Tabs>
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
          setFilters({ ...filters });
        }}
      />

      {/* Web Scraper for bulk PDF import */}
      <KBWebScraper
        open={webScraperOpen}
        onOpenChange={setWebScraperOpen}
        onSuccess={() => {
          setWebScraperOpen(false);
          // Refresh the list
          setFilters({ ...filters });
        }}
      />

      {/* JSONL Import for massive bulk import */}
      <KBJsonlImport
        open={jsonlImportOpen}
        onOpenChange={setJsonlImportOpen}
        onSuccess={() => {
          setJsonlImportOpen(false);
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

export default AdminPanel;
