import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { Database } from '@/integrations/supabase/types';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { CaseFilters } from '@/components/cases/CaseFilters';
import { CaseCard } from '@/components/cases/CaseCard';
import { CaseForm } from '@/components/cases/CaseForm';
import { UsageMonitor } from '@/components/UsageMonitor';
import { TeamStats } from '@/components/team/TeamStats';
import { LegalChatBot } from '@/components/chat/LegalChatBot';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCases, type CaseFilters as CaseFiltersType } from '@/hooks/useCases';
import { useKnowledgeBase, type KBFilters as KBFiltersType } from '@/hooks/useKnowledgeBase';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Scale, 
  Plus, 
  Loader2,
  LogOut,
  FolderOpen,
  BookOpen,
  BarChart3,
  Users2,
  Calendar as CalendarIcon,
  FileText,
  Mic,
  MessageCircle,
  FileWarning,
  ExternalLink
} from 'lucide-react';
import { DocumentGeneratorDialog } from '@/components/documents/DocumentGeneratorDialog';
import { ComplaintWizard } from '@/components/complaints/ComplaintWizard';
import { KBSearchFilters } from '@/components/kb/KBSearchFilters';
import { KBDocumentCard } from '@/components/kb/KBDocumentCard';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

type Case = Database['public']['Tables']['cases']['Row'];

const Dashboard = () => {
  const { t } = useTranslation(['common', 'cases', 'dashboard', 'disclaimer', 'usage', 'kb']);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, signOut, isClient, isAdmin, isAuditor } = useAuth();
  
  const [filters, setFilters] = useState<CaseFiltersType>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<Case | null>(null);
  const [deletingCaseId, setDeletingCaseId] = useState<string | null>(null);
  const [docGeneratorOpen, setDocGeneratorOpen] = useState(false);
  const [complaintWizardOpen, setComplaintWizardOpen] = useState(false);
  const [kbSearchOpen, setKbSearchOpen] = useState(false);
  const [legalChatOpen, setLegalChatOpen] = useState(false);
  const [kbFilters, setKbFilters] = useState<KBFiltersType>({ page: 1, pageSize: 10 });

  const { cases, isLoading, createCase, updateCase, deleteCase } = useCases(filters);
  const { documents: kbDocuments, isLoading: kbLoading } = useKnowledgeBase(kbFilters);

  // Helper function to upload files after case creation
  const uploadFilesToCase = async (caseId: string, files: File[]) => {
    for (const file of files) {
      const fileId = crypto.randomUUID();
      const fileExt = file.name.split('.').pop();
      const storagePath = `${caseId}/${fileId}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('case-files')
        .upload(storagePath, file);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        continue;
      }

      await supabase.from('case_files').insert({
        case_id: caseId,
        filename: `${fileId}.${fileExt}`,
        original_filename: file.name,
        storage_path: storagePath,
        file_type: file.type || 'application/octet-stream',
        file_size: file.size,
        version: 1,
        uploaded_by: user?.id,
      });
    }
  };

  const handleCreateCase = (data: Database['public']['Tables']['cases']['Insert'], files?: File[]) => {
    const caseData = {
      ...data,
      client_id: user?.id,
    };
    createCase.mutate(caseData, {
      onSuccess: async (newCase) => {
        if (files && files.length > 0 && newCase?.id) {
          await uploadFilesToCase(newCase.id, files);
          toast({
            title: t('cases:file_uploaded'),
            variant: 'default',
          });
        }
        setFormOpen(false);
      },
    });
  };

  const handleUpdateCase = (data: Database['public']['Tables']['cases']['Update']) => {
    if (editingCase) {
      updateCase.mutate(
        { id: editingCase.id, updates: data },
        { onSuccess: () => setEditingCase(null) }
      );
    }
  };

  const handleDeleteConfirm = () => {
    if (deletingCaseId) {
      deleteCase.mutate(deletingCaseId);
      setDeletingCaseId(null);
    }
  };

  // Allow all authenticated users to create cases
  const canCreateCase = !!user;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="container mx-auto flex h-14 sm:h-16 items-center justify-between px-3 sm:px-4">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <h1 className="text-lg sm:text-xl font-bold hidden xs:block">{t('common:app_name')}</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden sm:block text-sm text-muted-foreground truncate max-w-[120px]">
              {user?.email}
            </span>
            <LanguageSwitcher />
            <Button variant="ghost" size="icon" onClick={() => signOut()}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {/* Page Header */}
        <div className="mb-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold">{t('cases:cases')}</h2>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t('dashboard:manage_cases', 'Manage your legal cases')}
              </p>
            </div>
            {canCreateCase && (
              <Button onClick={() => setFormOpen(true)} size="sm" className="sm:hidden">
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2">
            {/* AI Legal Chat - Available for all users (replaces KB Search for non-admins) */}
            {!isAdmin && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setLegalChatOpen(true)}
                className="flex-col sm:flex-row h-auto py-2 sm:py-2 sm:h-9"
              >
                <MessageCircle className="h-4 w-4 sm:mr-2" />
                <span className="text-xs sm:text-sm mt-1 sm:mt-0">{t('ai:ai_name', 'AI Legal')}</span>
              </Button>
            )}
            {/* KB Search - Admin only */}
            {isAdmin && (
              <Sheet open={kbSearchOpen} onOpenChange={setKbSearchOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="flex-col sm:flex-row h-auto py-2 sm:py-2 sm:h-9">
                    <BookOpen className="h-4 w-4 sm:mr-2" />
                    <span className="text-xs sm:text-sm mt-1 sm:mt-0">{t('common:search', 'Search')}</span>
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>{t('kb:knowledge_base')}</SheetTitle>
                    <SheetDescription>
                      {t('dashboard:search_kb')}
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-4">
                    <KBSearchFilters filters={kbFilters} onFiltersChange={setKbFilters} />
                    
                    {kbLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : kbDocuments.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">
                        {t('kb:no_results')}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {kbDocuments.map((doc) => (
                          <KBDocumentCard
                            key={doc.id}
                            document={doc}
                            isAdmin={false}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate('/calendar')} className="flex-col sm:flex-row h-auto py-2 sm:py-2 sm:h-9">
              <CalendarIcon className="h-4 w-4 sm:mr-2" />
              <span className="text-xs sm:text-sm mt-1 sm:mt-0">{t('calendar:calendar', 'Calendar')}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/transcriptions')} className="flex-col sm:flex-row h-auto py-2 sm:py-2 sm:h-9">
              <Mic className="h-4 w-4 sm:mr-2" />
              <span className="text-xs sm:text-sm mt-1 sm:mt-0">{t('audio:audio', 'Audio')}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDocGeneratorOpen(true)} className="flex-col sm:flex-row h-auto py-2 sm:py-2 sm:h-9">
              <FileText className="h-4 w-4 sm:mr-2" />
              <span className="text-xs sm:text-sm mt-1 sm:mt-0">{t('common:documents', 'Documents')}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setComplaintWizardOpen(true)} className="flex-col sm:flex-row h-auto py-2 sm:py-2 sm:h-9">
              <FileWarning className="h-4 w-4 sm:mr-2" />
              <span className="text-xs sm:text-sm mt-1 sm:mt-0">{t('common:complaint', 'Complaint')}</span>
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => window.open('https://e-request.am', '_blank')}
              className="flex-col sm:flex-row h-auto py-2 sm:py-2 sm:h-9"
            >
              <ExternalLink className="h-4 w-4 sm:mr-2" />
              <span className="text-xs sm:text-sm mt-1 sm:mt-0">E-request</span>
            </Button>
            {/* KB Management - Admin only */}
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => navigate('/kb')} className="flex-col sm:flex-row h-auto py-2 sm:py-2 sm:h-9">
                <BookOpen className="h-4 w-4 sm:mr-2" />
                <span className="text-xs sm:text-sm mt-1 sm:mt-0">{t('kb:kb_short', 'KB')}</span>
              </Button>
            )}
            {isAdmin && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="flex-col sm:flex-row h-auto py-2 sm:py-2 sm:h-9">
                    <BarChart3 className="h-4 w-4 sm:mr-2" />
                    <span className="text-xs sm:text-sm mt-1 sm:mt-0">{t('usage:usage')}</span>
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>{t('usage:usage_title')}</SheetTitle>
                    <SheetDescription>
                      {t('usage:monthly_usage')}
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6">
                    <UsageMonitor budgetLimit={5.0} showChart={true} showTopUsers={true} />
                  </div>
                </SheetContent>
              </Sheet>
            )}
            {canCreateCase && (
              <Button onClick={() => setFormOpen(true)} size="sm" className="hidden sm:flex">
                <Plus className="mr-2 h-4 w-4" />
                {t('cases:new_case')}
              </Button>
            )}
          </div>
        </div>

        {/* Dashboard Tabs for Auditors */}
        {isAuditor ? (
          <Tabs defaultValue="team" className="space-y-6">
            <TabsList>
              <TabsTrigger value="team" className="gap-2">
                <Users2 className="h-4 w-4" />
                Իմ թիմը
              </TabsTrigger>
              <TabsTrigger value="cases" className="gap-2">
                <FolderOpen className="h-4 w-4" />
                Գործեր
              </TabsTrigger>
            </TabsList>

            <TabsContent value="team">
              <TeamStats />
            </TabsContent>

            <TabsContent value="cases" className="space-y-6">
              {/* Filters */}
              <CaseFilters filters={filters} onFiltersChange={setFilters} />

              {/* Cases Grid */}
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : cases.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
                  <FolderOpen className="h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-lg font-medium text-muted-foreground">
                    {t('cases:no_cases')}
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {cases.map((caseItem) => (
                    <CaseCard
                      key={caseItem.id}
                      caseData={caseItem}
                      onView={(id) => navigate(`/cases/${id}`)}
                      onEdit={(id) => {
                        const caseToEdit = cases.find(c => c.id === id);
                        if (caseToEdit) setEditingCase(caseToEdit);
                      }}
                      onDelete={(id) => setDeletingCaseId(id)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          <>
            {/* Filters */}
            <div className="mb-6">
              <CaseFilters filters={filters} onFiltersChange={setFilters} />
            </div>

            {/* Cases Grid */}
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : cases.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
                <FolderOpen className="h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4 text-lg font-medium text-muted-foreground">
                  {t('cases:no_cases')}
                </p>
                {canCreateCase && (
                  <Button className="mt-4" onClick={() => setFormOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    {t('cases:new_case')}
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cases.map((caseItem) => (
                  <CaseCard
                    key={caseItem.id}
                    caseData={caseItem}
                    onView={(id) => navigate(`/cases/${id}`)}
                    onEdit={(id) => {
                      const caseToEdit = cases.find(c => c.id === id);
                      if (caseToEdit) setEditingCase(caseToEdit);
                    }}
                    onDelete={(id) => setDeletingCaseId(id)}
                  />
                ))}
              </div>
            )}

            {/* Usage Widget for Admins */}
            {isAdmin && (
              <div className="mt-8">
                <UsageMonitor budgetLimit={5.0} compact={true} />
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
      <CaseForm
        open={formOpen || !!editingCase}
        onOpenChange={(open) => {
          if (!open) {
            setFormOpen(false);
            setEditingCase(null);
          }
        }}
        onSubmit={editingCase ? handleUpdateCase : handleCreateCase}
        initialData={editingCase}
        isLoading={createCase.isPending || updateCase.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingCaseId} onOpenChange={() => setDeletingCaseId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('cases:delete_case')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('cases:confirm_delete')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              {t('common:delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Legal AI Chatbot */}
      <LegalChatBot isOpen={legalChatOpen} onOpenChange={setLegalChatOpen} />

      {/* Document Generator Dialog */}
      <DocumentGeneratorDialog
        open={docGeneratorOpen}
        onOpenChange={setDocGeneratorOpen}
      />

      {/* Complaint Wizard */}
      <ComplaintWizard
        open={complaintWizardOpen}
        onOpenChange={setComplaintWizardOpen}
      />
    </div>
  );
};

export default Dashboard;
