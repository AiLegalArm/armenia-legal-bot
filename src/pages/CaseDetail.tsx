import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { useCase, useCases } from '@/hooks/useCases';
import { useAuth } from '@/hooks/useAuth';
import { useAIAnalysis, type AIRole } from '@/hooks/useAIAnalysis';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { CaseForm } from '@/components/cases/CaseForm';
import { CaseTimeline } from '@/components/cases/CaseTimeline';
import { CaseFileUpload } from '@/components/cases/CaseFileUpload';
import { CasePdfUpload } from '@/components/cases/CasePdfUpload';
import { CaseComments } from '@/components/cases/CaseComments';
import { FeedbackStars } from '@/components/FeedbackStars';
import { DocumentGeneratorDialog } from '@/components/documents/DocumentGeneratorDialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { exportAnalysisToPDF, exportMultipleAnalysesToPDF, exportCaseDetailToPDF } from '@/lib/pdfExport';
import { PdfExportButton } from '@/components/PdfExportButton';
import { format } from 'date-fns';
import { 
  Scale, 
  ArrowLeft, 
  Edit, 
  Trash2,
  Calendar,
  FileText,
  Loader2,
  LogOut,
  Brain,
  Download,
  FilePlus,
  Music,
  Wand2,
  Pencil,
  Save,
  X,
  AlertTriangle,
  FileSignature
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Gavel } from 'lucide-react';

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
  const { t, i18n } = useTranslation(['cases', 'common', 'ai', 'disclaimer']);
  const { user, signOut, isClient, isAdmin } = useAuth();
  
  const { data: caseData, isLoading } = useCase(id);
  const { updateCase, deleteCase } = useCases();
  const { isLoading: isAnalyzing, currentRole, results, creditsExhausted: aiCreditsFromHook, analyzeCase, runAllRoles, clearResults } = useAIAnalysis();
  
  const [editFormOpen, setEditFormOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pdfUploadOpen, setPdfUploadOpen] = useState(false);
  const [documentGeneratorOpen, setDocumentGeneratorOpen] = useState(false);
  const [preselectedDocumentType, setPreselectedDocumentType] = useState<'appeal' | 'cassation' | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [aiCreditsExhaustedLocal, setAiCreditsExhaustedLocal] = useState(false);
  
  // Combine both sources of credits exhausted state
  const aiCreditsExhausted = aiCreditsFromHook || aiCreditsExhaustedLocal;
  
  // Manual edit state for Facts & Legal Question
  const [isEditingFields, setIsEditingFields] = useState(false);
  const [editFacts, setEditFacts] = useState('');
  const [editLegalQuestion, setEditLegalQuestion] = useState('');
  const [isSavingFields, setIsSavingFields] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleExtractFields = async () => {
    if (!caseData) return;
    
    setIsExtracting(true);
    setAiCreditsExhaustedLocal(false);
    try {
      const { data, error } = await supabase.functions.invoke('extract-case-fields', {
        body: { caseId: caseData.id }
      });
      
      if (error) {
        // Check for 402 Payment Required error
        if (error.message?.includes('402') || error.message?.includes('Payment required')) {
          setAiCreditsExhaustedLocal(true);
          toast({
            title: t('cases:ai_credits_exhausted'),
            variant: 'destructive',
          });
          return;
        }
        throw error;
      }
      
      if (data.success) {
        toast({
          title: t('common:success', 'Success'),
          description: t('cases:fields_extracted', 'Facts and legal question extracted successfully'),
        });
        // Refresh case data
        queryClient.invalidateQueries({ queryKey: ['case', caseData.id] });
      } else {
        // Check for 402 in response data
        if (data.error?.includes('402') || data.error?.includes('Payment required') || data.error?.includes('credits')) {
          setAiCreditsExhaustedLocal(true);
          toast({
            title: t('cases:ai_credits_exhausted'),
            variant: 'destructive',
          });
          return;
        }
        throw new Error(data.error || 'Extraction failed');
      }
    } catch (error) {
      console.error('Extraction error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      
      // Check for 402 in catch block
      if (errorMsg.includes('402') || errorMsg.includes('Payment required')) {
        setAiCreditsExhaustedLocal(true);
        toast({
          title: t('cases:ai_credits_exhausted'),
          variant: 'destructive',
        });
        return;
      }
      
      toast({
        title: t('errors:operation_failed', 'Operation failed'),
        description: errorMsg,
        variant: 'destructive',
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleStartEditFields = () => {
    setEditFacts(caseData?.facts || '');
    setEditLegalQuestion(caseData?.legal_question || '');
    setIsEditingFields(true);
  };

  const handleCancelEditFields = () => {
    setIsEditingFields(false);
    setEditFacts('');
    setEditLegalQuestion('');
  };

  const handleSaveFields = async () => {
    if (!caseData) return;
    
    setIsSavingFields(true);
    try {
      const { error } = await supabase
        .from('cases')
        .update({
          facts: editFacts,
          legal_question: editLegalQuestion,
          updated_at: new Date().toISOString()
        })
        .eq('id', caseData.id);
      
      if (error) throw error;
      
      toast({
        title: t('cases:fields_saved', 'Fields saved successfully'),
      });
      
      queryClient.invalidateQueries({ queryKey: ['case', caseData.id] });
      setIsEditingFields(false);
    } catch (error) {
      console.error('Save fields error:', error);
      toast({
        title: t('errors:operation_failed', 'Operation failed'),
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsSavingFields(false);
    }
  };

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

  const handleStartAnalysis = async () => {
    if (!caseData) return;
    await runAllRoles(caseData.id, caseData.facts, caseData.legal_question || '');
  };

  const handleExportSingleAnalysis = (role: AIRole) => {
    if (!caseData || !results[role]) return;
    
    exportAnalysisToPDF({
      caseNumber: caseData.case_number,
      caseTitle: caseData.title,
      role,
      analysisText: results[role]!.analysis,
      sources: results[role]!.sources,
      createdAt: new Date(),
      language: 'hy'
    });
  };

  const handleExportAllAnalyses = () => {
    if (!caseData) return;
    
    const analyses = Object.entries(results)
      .filter((entry): entry is [string, NonNullable<typeof results[keyof typeof results]>] => entry[1] !== null)
      .map(([role, result]) => ({
        role,
        text: result.analysis,
        sources: result.sources
      }));
    
    if (analyses.length === 0) return;
    
    exportMultipleAnalysesToPDF(
      caseData.case_number,
      caseData.title,
      analyses,
      'hy'
    );
  };

  const handleExportCaseDetails = async () => {
    if (!caseData) return;
    
    // Fetch timeline data
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
    
    // Build timeline events
    const timeline: Array<{ type: string; title: string; description?: string; timestamp: string }> = [];
    
    // Case created
    timeline.push({
      type: 'created',
      title: 'Գործը ստեղծվել է',
      timestamp: caseData.created_at,
    });
    
    // Files uploaded
    files?.forEach(file => {
      timeline.push({
        type: 'file',
        title: 'Ֆայլի վերբեռնում',
        description: file.original_filename,
        timestamp: file.created_at,
      });
    });
    
    // AI analyses
    const roleLabels: Record<string, string> = {
      advocate: 'Փաստաբան (Պաշտպան)',
      prosecutor: 'Մեղադրող',
      judge: 'Դատավոր',
      aggregator: 'Լիակատար վերլուծություն',
    };
    
    analyses?.forEach(analysis => {
      timeline.push({
        type: 'analysis',
        title: 'AI վերլուծություն',
        description: roleLabels[analysis.role] || analysis.role,
        timestamp: analysis.created_at,
      });
    });
    
    // Sort by timestamp descending
    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    exportCaseDetailToPDF({
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
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('common:back', 'Back')}
        </Button>
      </div>
    );
  }

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
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <LanguageSwitcher />
            <Button variant="ghost" size="icon" onClick={() => signOut()}>
              <LogOut className="h-5 w-5" />
            </Button>
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

        {/* Case Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold">{caseData.title}</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
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
            <div className="flex flex-wrap gap-2">
              {/* Quick Complaint Generation Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="default">
                    <Gavel className="mr-2 h-4 w-4" />
                    {i18n.language === 'hy' ? '\u0532\u0578\u0572\u0578\u0584 \u0576\u0565\u0580\u056F\u0561\u0575\u0561\u0581\u0576\u0565\u056C' : i18n.language === 'en' ? 'File Complaint' : 'Подать жалобу'}
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => {
                    setPreselectedDocumentType('appeal');
                    setDocumentGeneratorOpen(true);
                  }}>
                    <FileSignature className="mr-2 h-4 w-4" />
                    {i18n.language === 'hy' ? '\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0562\u0578\u0572\u0578\u0584' : i18n.language === 'en' ? 'Appeal' : 'Апелляционная жалоба'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    setPreselectedDocumentType('cassation');
                    setDocumentGeneratorOpen(true);
                  }}>
                    <FileSignature className="mr-2 h-4 w-4" />
                    {i18n.language === 'hy' ? '\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0562\u0578\u0572\u0578\u0584' : i18n.language === 'en' ? 'Cassation Appeal' : 'Кассационная жалоба'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => {
                    setPreselectedDocumentType(null);
                    setDocumentGeneratorOpen(true);
                  }}>
                    <FileText className="mr-2 h-4 w-4" />
                    {i18n.language === 'hy' ? '\u0531\u0575\u056C \u0583\u0561\u057D\u057F\u0561\u0569\u0578\u0582\u0572\u0569' : i18n.language === 'en' ? 'Other Document' : 'Другой документ'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <Button variant="outline" onClick={() => setEditFormOpen(true)}>
                <Edit className="mr-2 h-4 w-4" />
                {t('edit_case')}
              </Button>
              <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                {t('delete_case')}
              </Button>
            </div>
          )}
        </div>

        {/* Case Details & Tabs */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="details">{t('common:details', 'Details')}</TabsTrigger>
                <TabsTrigger value="files">{t('files')}</TabsTrigger>
                <TabsTrigger value="analysis">
                  <Brain className="mr-2 h-4 w-4" />
                  {t('ai:analyze')}
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

                {/* Facts and Legal Question Section */}
                <Card className="mt-4">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>{t('cases:facts_and_question', 'Facts & Legal Question')}</CardTitle>
                    <div className="flex gap-2">
                      {!isEditingFields && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleStartEditFields}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            {t('cases:edit_fields', 'Edit')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExtractFields}
                            disabled={isExtracting}
                          >
                            {isExtracting ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {t('common:processing', 'Processing')}...
                              </>
                            ) : (
                              <>
                                <Wand2 className="mr-2 h-4 w-4" />
                                {t('cases:auto_extract', 'Auto-extract')}
                              </>
                            )}
                          </Button>
                        </>
                      )}
                      {isEditingFields && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCancelEditFields}
                            disabled={isSavingFields}
                          >
                            <X className="mr-2 h-4 w-4" />
                            {t('cases:cancel_edit', 'Cancel')}
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSaveFields}
                            disabled={isSavingFields}
                          >
                            {isSavingFields ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="mr-2 h-4 w-4" />
                            )}
                            {t('cases:save_fields', 'Save')}
                          </Button>
                        </>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* AI Credits Exhausted Warning */}
                    {aiCreditsExhausted && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          {t('cases:ai_credits_exhausted')}
                        </AlertDescription>
                      </Alert>
                    )}
                    
                    {isEditingFields ? (
                      <>
                        {/* Edit Mode */}
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                            {t('cases:facts', 'Facts')} ({t('cases:facts_hy', '\u0553\u0561\u057D\u057F\u0565\u0580')})
                          </label>
                          <Textarea
                            value={editFacts}
                            onChange={(e) => setEditFacts(e.target.value)}
                            placeholder={t('cases:no_facts')}
                            className="min-h-[100px]"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                            {t('cases:legal_question', 'Legal Question')} ({t('cases:legal_question_hy', '\u053b\u0580\u0561\u057e\u0561\u056f\u0561\u0576 \u0570\u0561\u0580\u0581')})
                          </label>
                          <Textarea
                            value={editLegalQuestion}
                            onChange={(e) => setEditLegalQuestion(e.target.value)}
                            placeholder={t('cases:no_legal_question')}
                            className="min-h-[100px]"
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        {/* View Mode */}
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">
                            {t('cases:facts', 'Facts')} ({t('cases:facts_hy', '\u0553\u0561\u057D\u057F\u0565\u0580')})
                          </p>
                          <p className="whitespace-pre-wrap text-sm border rounded-md p-3 bg-muted/50 min-h-[60px]">
                            {caseData.facts || t('cases:no_facts')}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">
                            {t('cases:legal_question', 'Legal Question')} ({t('cases:legal_question_hy', '\u053b\u0580\u0561\u057e\u0561\u056f\u0561\u0576 \u0570\u0561\u0580\u0581')})
                          </p>
                          <p className="whitespace-pre-wrap text-sm border rounded-md p-3 bg-muted/50 min-h-[60px]">
                            {caseData.legal_question || t('cases:no_legal_question')}
                          </p>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

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
                          {t('audio_transcription', 'Աուդիո տրանսկրիպցիա')}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CaseFileUpload caseId={caseData.id} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="analysis" className="mt-4">
                <div className="space-y-4">
                  {/* AI Credits Exhausted Warning */}
                  {aiCreditsExhausted && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        {t('cases:ai_credits_exhausted_analysis')}
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {/* AI Warning */}
                  <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      ⚠️ {t('disclaimer:ai_warning')}
                    </p>
                  </div>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>{t('ai:analyze')}</span>
                        {Object.values(results).some(r => r !== null) && (
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={clearResults}
                            >
                              {t('common:clear', 'Clear')}
                            </Button>
                            <PdfExportButton onClick={handleExportAllAnalyses} />
                          </div>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {!Object.values(results).some(r => r !== null) ? (
                        <>
                          <p className="text-sm text-muted-foreground mb-4">
                            {t('ai:analysis_placeholder', 'AI analysis will appear here')}
                          </p>
                          <Button 
                            className="w-full" 
                            onClick={handleStartAnalysis}
                            disabled={isAnalyzing}
                          >
                            {isAnalyzing ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {t('ai:analyzing', 'Analyzing')} {currentRole ? `(${currentRole})` : ''}...
                              </>
                            ) : (
                              <>
                                <Brain className="mr-2 h-4 w-4" />
                                {t('ai:start_analysis', 'Start Analysis')}
                              </>
                            )}
                          </Button>
                        </>
                      ) : (
                        <div className="space-y-6">
                          {(['advocate', 'prosecutor', 'judge', 'aggregator'] as AIRole[]).map((role) => {
                            const result = results[role];
                            if (!result) return null;
                            
                            return (
                              <div key={role} className="border rounded-lg p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <h3 className="font-semibold text-lg capitalize">{role}</h3>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => handleExportSingleAnalysis(role)}
                                  >
                                    <Download className="mr-2 h-3 w-3" />
                                    {t('common:export', 'Export')} PDF
                                  </Button>
                                </div>
                                <div className="text-sm whitespace-pre-wrap mb-3">{result.analysis}</div>
                                {result.sources && result.sources.length > 0 && (
                                  <div className="mt-3 pt-3 border-t">
                                    <p className="text-xs font-semibold text-muted-foreground mb-2">
                                      {t('ai:sources', 'Sources')}:
                                    </p>
                                    <ul className="text-xs space-y-1">
                                      {result.sources.map((source, idx) => (
                                        <li key={idx} className="text-muted-foreground">
                                          • {source.title} ({source.category})
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      
                      {/* Feedback Component - shown after analysis is complete */}
                      {Object.values(results).some(r => r !== null) && (
                        <div className="mt-6 pt-6 border-t">
                          <FeedbackStars caseId={caseData.id} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Case Info */}
            <Card>
              <CardHeader>
                <CardTitle>{t('common:information', 'Information')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {caseData.court_name && (
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">{t('court_name')}</p>
                      <p className="text-sm">{caseData.court_name}</p>
                    </div>
                  </div>
                )}
                {caseData.court_date && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">{t('court_date')}</p>
                      <p className="text-sm">{format(new Date(caseData.court_date), 'dd.MM.yyyy')}</p>
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">{t('created_at')}</p>
                  <p className="text-sm">{format(new Date(caseData.created_at), 'dd.MM.yyyy HH:mm')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('updated_at')}</p>
                  <p className="text-sm">{format(new Date(caseData.updated_at), 'dd.MM.yyyy HH:mm')}</p>
                </div>
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>{t('case_timeline')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CaseTimeline caseId={caseData.id} />
              </CardContent>
            </Card>

            {/* Team Leader Comments */}
            <CaseComments caseId={caseData.id} />
          </div>
        </div>

        {/* Legal Disclaimer */}
        <div className="mt-8 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            ⚠️ {t('disclaimer:main')}
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
        onSuccess={() => {
          setPdfUploadOpen(false);
        }}
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
    </div>
  );
};

export default CaseDetail;
