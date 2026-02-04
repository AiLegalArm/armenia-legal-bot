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
import { LegalPracticeKB } from '@/components/admin/LegalPracticeKB';
import { PromptManager } from '@/components/admin/PromptManager';
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
  FileJson,
  FileCode2
} from 'lucide-react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
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
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden text-sm text-muted-foreground sm:block">
              {user.email}
            </span>
            <LanguageSwitcher />
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="kb" className="space-y-6">
          <TabsList className="h-auto flex-wrap gap-1 p-1">
            <TabsTrigger value="kb" className="gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:text-sm">
              <DatabaseIcon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{'\u0533\u056B\u057F\u0565\u056C\u056B\u0584\u0576\u0565\u0580\u056B \u0562\u0561\u0566\u0561'}</span>
            </TabsTrigger>
            <TabsTrigger value="practice" className="gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:text-sm">
              <BookOpen className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{'\u054A\u0580\u0561\u056F\u057F\u056B\u056F\u0561 (KB)'}</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:text-sm">
              <Users className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{'\u0555\u0563\u057F\u0561\u057F\u0565\u0580\u0576\u0565\u0580'}</span>
            </TabsTrigger>
            <TabsTrigger value="teams" className="gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:text-sm">
              <Users2 className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{'\u0539\u056B\u0574\u0565\u0580'}</span>
            </TabsTrigger>
            <TabsTrigger value="feedback" className="gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:text-sm">
              <MessageSquare className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{'\u053F\u0561\u0580\u056E\u056B\u0584\u0576\u0565\u0580'}</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:text-sm">
              <BarChart3 className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{'\u054E\u056B\u0573\u0561\u056F\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576'}</span>
            </TabsTrigger>
            <TabsTrigger value="prompts" className="gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:text-sm">
              <FileCode2 className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Prompts</span>
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
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  <Button onClick={() => setFormOpen(true)} className="w-full sm:w-auto">
                    <Plus className="mr-1.5 h-4 w-4" />
                    <span className="text-xs sm:text-sm">{t('add_document')}</span>
                  </Button>
                  <Button variant="secondary" onClick={() => setJsonlImportOpen(true)} className="w-full sm:w-auto">
                    <FileJson className="mr-1.5 h-4 w-4" />
                    <span className="text-xs sm:text-sm">JSONL</span>
                  </Button>
                  <Button variant="outline" onClick={() => setWebScraperOpen(true)} className="w-full sm:w-auto">
                    <Globe className="mr-1.5 h-4 w-4" />
                    <span className="text-xs sm:text-sm">Web</span>
                  </Button>
                  <Button variant="outline" onClick={() => setMultiFileUploadOpen(true)} className="w-full sm:w-auto">
                    <FileStack className="mr-1.5 h-4 w-4" />
                    <span className="text-xs sm:text-sm">Файлы</span>
                  </Button>
                  <Button variant="outline" onClick={() => setBulkImportOpen(true)} className="w-full sm:w-auto">
                    <FileUp className="mr-1.5 h-4 w-4" />
                    <span className="text-xs sm:text-sm">TXT</span>
                  </Button>
                  <Button variant="outline" onClick={() => setPdfUploadOpen(true)} className="w-full sm:w-auto">
                    <FileUp className="mr-1.5 h-4 w-4" />
                    <span className="text-xs sm:text-sm">PDF</span>
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

          {/* Legal Practice KB Tab */}
          <TabsContent value="practice">
            <LegalPracticeKB />
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

          {/* Prompts Tab */}
          <TabsContent value="prompts">
            <PromptManager />
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
