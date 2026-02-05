import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { useCase, useCases } from '@/hooks/useCases';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { CaseDetailHeader } from '@/components/cases/CaseDetailHeader';
import { CaseDetailInfo } from '@/components/cases/CaseDetailInfo';
import { CaseFactsEditor } from '@/components/cases/CaseFactsEditor';
import { CaseAIAnalysisPanel } from '@/components/cases/CaseAIAnalysisPanel';
import { CaseForm } from '@/components/cases/CaseForm';
import { CaseTimeline } from '@/components/cases/CaseTimeline';
import { CaseFileUpload } from '@/components/cases/CaseFileUpload';
import { CasePdfUpload } from '@/components/cases/CasePdfUpload';
import { CaseComments } from '@/components/cases/CaseComments';
import { DocumentGeneratorDialog } from '@/components/documents/DocumentGeneratorDialog';
import { CaseComplaintGenerator } from '@/components/cases/CaseComplaintGenerator';
import { CaseReminders, CourtDateReminderSuggestion } from '@/components/reminders';
import { MultiAgentPanel } from '@/components/agents/MultiAgentPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PdfExportButton } from '@/components/PdfExportButton';
import { exportCaseDetailToPDF } from '@/lib/pdfExport';
import { format } from 'date-fns';
import { 
  Edit, 
  Trash2,
  Loader2,
  Brain,
  FilePlus,
  Music,
  Bell,
  Bot
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

const statusColors: Record<string, string> = {
  open: 'bg-green-500/10 text-green-700 dark:text-green-400',
  in_progress: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  pending: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  closed: 'bg-gray-500/10 text-gray-700 dark:text-gray-400',
  archived: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
};

const priorityColors: Record<string, string> = {
  low: 'bg-slate-500/10 text-slate-700 dark:text-slate-400',
  medium: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  high: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  urgent: 'bg-red-500/10 text-red-700 dark:text-red-400',
};

const CaseDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation(['cases', 'common', 'ai', 'disclaimer', 'reminders']);
  const { user, signOut, isClient, isAdmin } = useAuth();
  
  const { data: caseData, isLoading } = useCase(id);
  const { updateCase, deleteCase } = useCases();
  
  const [editFormOpen, setEditFormOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pdfUploadOpen, setPdfUploadOpen] = useState(false);
  const [documentGeneratorOpen, setDocumentGeneratorOpen] = useState(false);
  const [complaintGeneratorOpen, setComplaintGeneratorOpen] = useState(false);
  const [preselectedDocumentType, setPreselectedDocumentType] = useState<'appeal' | 'cassation' | null>(null);
  const [aiCreditsExhausted, setAiCreditsExhausted] = useState(false);
  
  const { toast } = useToast();

  const handleUpdate = (data: Database['public']['Tables']['cases']['Update']) => {
    if (id) {
      updateCase.mutate(
        { id, updates: data },
        { onSuccess: () => setEditFormOpen(false) }
      );
    }
  };

  const handleDelete = () => {
    if (id) {
      deleteCase.mutate(id, {
        onSuccess: () => navigate('/dashboard'),
      });
    }
  };

  const handleExportCaseDetails = async () => {
    if (!caseData) return;
    
    const { data: files } = await supabase
      .from('case_files')
      .select('id, original_filename, created_at, file_size')
      .eq('case_id', caseData.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    
    const { data: analyses } = await supabase
      .from('ai_analysis')
      .select('id, role, created_at')
      .eq('case_id', caseData.id)
      .order('created_at', { ascending: false });
    
    const timeline: Array<{ type: string; title: string; description?: string; timestamp: string }> = [];
    
    timeline.push({
      type: 'created',
      title: '\u0533\u0578\u0580\u056E\u0568 \u057D\u057F\u0565\u0572\u056E\u057E\u0565\u056C \u0567',
      timestamp: caseData.created_at,
    });
    
    files?.forEach(file => {
      timeline.push({
        type: 'file',
        title: '\u0556\u0561\u0575\u056C\u056B \u057E\u0565\u0580\u0562\u0565\u057C\u0576\u0578\u0582\u0574',
        description: file.original_filename,
        timestamp: file.created_at,
      });
    });
    
    const roleLabels: Record<string, string> = {
      advocate: '\u0553\u0561\u057D\u057F\u0561\u0562\u0561\u0576 (\u054A\u0561\u0577\u057F\u057A\u0561\u0576)',
      prosecutor: '\u0544\u0565\u0572\u0561\u0564\u0580\u0578\u0572',
      judge: '\u0534\u0561\u057F\u0561\u057E\u0578\u0580',
      aggregator: '\u053C\u056B\u0561\u056F\u0561\u057F\u0561\u0580 \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576',
    };
    
    analyses?.forEach(analysis => {
      timeline.push({
        type: 'analysis',
        title: 'AI \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576',
        description: roleLabels[analysis.role] || analysis.role,
        timestamp: analysis.created_at,
      });
    });
    
    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    await exportCaseDetailToPDF({
      caseNumber: caseData.case_number,
      caseTitle: caseData.title,
      description: caseData.description || undefined,
      facts: caseData.facts || undefined,
      legalQuestion: caseData.legal_question || undefined,
      status: caseData.status,
      priority: caseData.priority,
      courtName: caseData.court_name || undefined,
      courtDate: caseData.court_date ? format(new Date(caseData.court_date), 'dd.MM.yyyy') : undefined,
      notes: caseData.notes || undefined,
      createdAt: new Date(caseData.created_at),
      updatedAt: new Date(caseData.updated_at),
      files: files?.map(f => ({
        original_filename: f.original_filename,
        file_size: f.file_size,
        created_at: f.created_at
      })),
      timeline,
      userName: user?.email,
      language: 'hy'
    });
  };

  const canEdit = isClient || isAdmin;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <p className="text-lg text-muted-foreground">{t('cases:case_not_found', 'Case not found')}</p>
        <Button className="mt-4" onClick={() => navigate('/dashboard')}>
          {t('common:back', 'Back')}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <CaseDetailHeader userEmail={user?.email} onSignOut={signOut} />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {/* Case Header */}
        <div className="mb-6 flex flex-col gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold line-clamp-2">{caseData.title}</h2>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              {caseData.case_number}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge className={statusColors[caseData.status]}>
                {t(`status_${caseData.status}`)}
              </Badge>
              <Badge className={priorityColors[caseData.priority]}>
                {t(`priority_${caseData.priority}`)}
              </Badge>
            </div>
          </div>
          {canEdit && (
            <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditFormOpen(true)}
                className="w-full justify-center min-w-0 px-2"
              >
                <Edit className="h-4 w-4 mr-1 sm:mr-2 shrink-0" />
                <span className="text-xs sm:text-sm truncate">
                  {i18n.language === 'hy' ? '\u053D\u0574\u0562.' : t('edit_case')}
                </span>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
                className="w-full justify-center min-w-0 px-2"
              >
                <Trash2 className="h-4 w-4 mr-1 sm:mr-2 shrink-0" />
                <span className="text-xs sm:text-sm truncate">
                  {i18n.language === 'hy' ? '\u054B\u0576\u057B\u0565\u056C' : t('delete_case')}
                </span>
              </Button>
            </div>
          )}
        </div>

        {/* Court Date Reminder Suggestion */}
        {caseData.court_date && (
          <div className="mb-4">
            <CourtDateReminderSuggestion
              caseId={caseData.id}
              caseTitle={caseData.title}
              courtDate={caseData.court_date}
            />
          </div>
        )}

        {/* Case Details & Tabs */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="details">{t('common:details', 'Details')}</TabsTrigger>
                <TabsTrigger value="files">{t('files')}</TabsTrigger>
                <TabsTrigger value="reminders">
                  <Bell className="mr-2 h-4 w-4" />
                  {t('reminders:reminders')}
                </TabsTrigger>
                <TabsTrigger value="analysis">
                  <Brain className="mr-2 h-4 w-4" />
                  {t('ai:analyze')}
                </TabsTrigger>
                <TabsTrigger value="agents">
                  <Bot className="mr-2 h-4 w-4" />
                  {t('ai:multi_agent_analysis', 'Multi-Agent')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="mt-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>{t('description')}</CardTitle>
                    <PdfExportButton onClick={handleExportCaseDetails} />
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap text-sm">
                      {caseData.description || t('common:no_description', 'No description')}
                    </p>
                  </CardContent>
                </Card>

                <CaseFactsEditor
                  caseId={caseData.id}
                  facts={caseData.facts}
                  legalQuestion={caseData.legal_question}
                  aiCreditsExhausted={aiCreditsExhausted}
                  onCreditsExhausted={() => setAiCreditsExhausted(true)}
                />

                {caseData.notes && (
                  <Card className="mt-4">
                    <CardHeader>
                      <CardTitle>{t('notes')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="whitespace-pre-wrap text-sm">{caseData.notes}</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="files" className="mt-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>{t('files')}</CardTitle>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setPdfUploadOpen(true)}
                        >
                          <FilePlus className="mr-2 h-4 w-4" />
                          {t('pdf_ocr')}
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => navigate(`/cases/${caseData.id}/transcriptions`)}
                        >
                          <Music className="mr-2 h-4 w-4" />
                          {t('audio_transcription', '\u0531\u0578\u0582\u0564\u056B\u0578 \u057F\u0580\u0561\u0576\u057D\u056F\u0580\u056B\u057A\u0581\u056B\u0561')}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CaseFileUpload caseId={caseData.id} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="reminders" className="mt-4">
                <CaseReminders caseId={caseData.id} courtDate={caseData.court_date} />
              </TabsContent>

              <TabsContent value="analysis" className="mt-4">
                <CaseAIAnalysisPanel
                  caseId={caseData.id}
                  facts={caseData.facts}
                  legalQuestion={caseData.legal_question}
                  caseNumber={caseData.case_number}
                  caseTitle={caseData.title}
                  aiCreditsExhausted={aiCreditsExhausted}
                  onOpenComplaintGenerator={() => setComplaintGeneratorOpen(true)}
                />
              </TabsContent>

              <TabsContent value="agents" className="mt-4">
                <MultiAgentPanel caseId={caseData.id} caseFacts={caseData.facts || undefined} />
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <CaseDetailInfo
            caseId={caseData.id}
            courtName={caseData.court_name}
            courtDate={caseData.court_date}
            createdAt={caseData.created_at}
            updatedAt={caseData.updated_at}
            isAdmin={isAdmin}
          />
        </div>

        {/* Legal Disclaimer */}
        <div className="mt-8 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            \u26A0\uFE0F {t('disclaimer:main')}
          </p>
        </div>
      </main>

      {/* Edit Form */}
      <CaseForm
        open={editFormOpen}
        onOpenChange={setEditFormOpen}
        onSubmit={handleUpdate}
        initialData={caseData}
        isLoading={updateCase.isPending}
      />

      {/* PDF Upload */}
      <CasePdfUpload
        open={pdfUploadOpen}
        onOpenChange={setPdfUploadOpen}
        caseId={caseData.id}
        onSuccess={() => setPdfUploadOpen(false)}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_case')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('confirm_delete')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {t('common:delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Document Generator Dialog */}
      <DocumentGeneratorDialog
        open={documentGeneratorOpen}
        onOpenChange={(open) => {
          setDocumentGeneratorOpen(open);
          if (!open) setPreselectedDocumentType(null);
        }}
        preselectedType={preselectedDocumentType}
        caseData={caseData ? {
          id: caseData.id,
          title: caseData.title,
          case_number: caseData.case_number,
          case_type: caseData.case_type || undefined,
          court: caseData.court || undefined,
          facts: caseData.facts || undefined,
          legal_question: caseData.legal_question || undefined,
          description: caseData.description || undefined,
          notes: caseData.notes || undefined,
        } : undefined}
      />

      {/* Case Complaint Generator Dialog */}
      {caseData && (
        <CaseComplaintGenerator
          open={complaintGeneratorOpen}
          onOpenChange={setComplaintGeneratorOpen}
          caseId={caseData.id}
          caseData={{
            title: caseData.title,
            case_number: caseData.case_number,
            case_type: caseData.case_type,
            court: caseData.court,
            facts: caseData.facts,
            description: caseData.description,
            notes: caseData.notes,
          }}
        />
      )}
    </div>
  );
};

export default CaseDetail;
