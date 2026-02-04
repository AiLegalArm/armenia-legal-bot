import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, FileText, CheckCircle2, History } from "lucide-react";
import { DocumentTemplateList } from "./DocumentTemplateList";
import { DocumentPreview } from "./DocumentPreview";
import { DocumentEditor } from "./DocumentEditor";
import { CourtSelector } from "./CourtSelector";
import { ProsecutorSelector } from "./ProsecutorSelector";
import { GovernmentSelector } from "./GovernmentSelector";
import { InvestigativeBodySelector } from "./InvestigativeBodySelector";
import { CommitteeServiceSelector } from "./CommitteeServiceSelector";
import { DynamicDocumentFields } from "./DynamicDocumentFields";
import { EnhancedFileUpload, UploadedFile } from "./EnhancedFileUpload";
import { ValidationModal, validateDocumentForm, ValidationField } from "./ValidationModal";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { DocumentHistory } from "./DocumentHistory";
import { FlatCourt } from "@/data/armenianCourts";
import { FlatProsecutor } from "@/data/armenianProsecutors";
import { FlatGovernmentBody } from "@/data/armenianGovernment";
import { FlatInvestigativeBody } from "@/data/armenianInvestigativeBodies";
import { FlatCommitteeService } from "@/data/armenianCommitteesServices";

interface DocumentGeneratorProps {
  caseData?: {
    id: string;
    title: string;
    case_number: string;
    case_type?: string;
    court?: string;
    facts?: string;
    legal_question?: string;
    description?: string;
    notes?: string;
  };
  preselectedType?: 'appeal' | 'cassation' | null;
  onClose?: () => void;
}

interface DocumentTemplate {
  id: string;
  category: string;
  subcategory: string | null;
  name_hy: string;
  name_ru: string;
  name_en: string;
  required_fields: string[];
}

interface DynamicFieldsState {
  claimAmount: string;
  courtFee: string;
  currentMeasure: string;
  proposedAlternative: string;
  thirdParties: Array<{ id: string; fullName: string; address: string; role: string }>;
  coDefendants: Array<{ id: string; fullName: string; address: string; role: string }>;
  requirements: Array<{ id: string; text: string }>;
}

export function DocumentGenerator({ caseData, preselectedType, onClose }: DocumentGeneratorProps) {
  const { t, i18n } = useTranslation(["cases", "common"]);
  const { toast } = useToast();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState("");
  const [editedContent, setEditedContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("template");
  
  // Form fields
  const [recipientName, setRecipientName] = useState("");
  const [recipientPosition, setRecipientPosition] = useState("");
  const [recipientOrganization, setRecipientOrganization] = useState("");
  const [selectedCourtId, setSelectedCourtId] = useState<string>("");
  const [selectedCourtData, setSelectedCourtData] = useState<FlatCourt | null>(null);
  const [selectedProsecutorId, setSelectedProsecutorId] = useState<string>("");
  const [selectedProsecutorData, setSelectedProsecutorData] = useState<FlatProsecutor | null>(null);
  const [selectedGovernmentId, setSelectedGovernmentId] = useState<string>("");
  const [selectedGovernmentData, setSelectedGovernmentData] = useState<FlatGovernmentBody | null>(null);
  const [selectedInvestigativeId, setSelectedInvestigativeId] = useState<string>("");
  const [selectedInvestigativeData, setSelectedInvestigativeData] = useState<FlatInvestigativeBody | null>(null);
  const [selectedCommitteeId, setSelectedCommitteeId] = useState<string>("");
  const [selectedCommitteeData, setSelectedCommitteeData] = useState<FlatCommitteeService | null>(null);
  const [recipientType, setRecipientType] = useState<"court" | "prosecutor" | "government" | "investigative" | "other">("court");
  const [senderName, setSenderName] = useState("");
  const [senderAddress, setSenderAddress] = useState("");
  const [senderContact, setSenderContact] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [fileExtractedText, setFileExtractedText] = useState("");
  const [language, setLanguage] = useState(i18n.language);

  // New state for enhanced features
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [dynamicFields, setDynamicFields] = useState<DynamicFieldsState>({
    claimAmount: "",
    courtFee: "",
    currentMeasure: "",
    proposedAlternative: "",
    thirdParties: [],
    coDefendants: [],
    requirements: []
  });
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationFields, setValidationFields] = useState<ValidationField[]>([]);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  // Auto-select template when preselectedType changes and templates are loaded
  useEffect(() => {
    if (preselectedType && templates.length > 0 && !selectedTemplate) {
      const caseType = caseData?.case_type || 'civil';
      
      const categoryMap: Record<string, string> = {
        criminal: 'criminal_process',
        civil: 'civil_process',
        administrative: 'administrative_process',
      };
      const targetCategory = categoryMap[caseType] || 'civil_process';
      
      let matchingTemplate: DocumentTemplate | undefined;
      
      if (preselectedType === 'appeal') {
        matchingTemplate = templates.find(t => 
          t.category === targetCategory && 
          (t.subcategory === 'appeal' || t.name_ru.toLowerCase().includes('апелляц'))
        );
      } else if (preselectedType === 'cassation') {
        matchingTemplate = templates.find(t => 
          t.category === targetCategory && 
          (t.subcategory === 'cassation' || t.name_ru.toLowerCase().includes('кассац'))
        );
      }
      
      if (!matchingTemplate) {
        matchingTemplate = templates.find(t => 
          preselectedType === 'appeal' 
            ? (t.subcategory === 'appeal' || t.name_ru.toLowerCase().includes('апелляц'))
            : (t.subcategory === 'cassation' || t.name_ru.toLowerCase().includes('кассац'))
        );
      }
      
      if (matchingTemplate) {
        setSelectedTemplate(matchingTemplate);
        setRecipientType('court');
      }
    }
  }, [preselectedType, templates, caseData?.case_type]);

  const fetchTemplates = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("document_templates")
        .select("*")
        .eq("is_active", true)
        .order("category", { ascending: true });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast({
        title: t("common:error"),
        description: t("cases:template_loading_error"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getTemplateName = (template: DocumentTemplate) => {
    switch (i18n.language) {
      case 'hy': return template.name_hy;
      case 'en': return template.name_en;
      default: return template.name_ru;
    }
  };

  // Validate form before generation
  const handleValidate = useCallback(() => {
    const fields = validateDocumentForm({
      selectedTemplate,
      senderName,
      senderAddress,
      senderContact,
      recipientOrganization,
      recipientName,
      recipientPosition,
      sourceText,
      fileExtractedText
    }, i18n.language);
    
    setValidationFields(fields);
    setShowValidationModal(true);
  }, [selectedTemplate, senderName, senderAddress, senderContact, recipientOrganization, recipientName, recipientPosition, sourceText, fileExtractedText, i18n.language]);

  const handleGenerate = async () => {
    if (!selectedTemplate) {
      toast({
        title: t("common:error"),
        description: t("cases:select_document_type"),
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setGeneratedContent("");
    setShowValidationModal(false);

    try {
      // Build recipient organization with court or prosecutor data
      let finalRecipientOrg = recipientOrganization;
      let recipientAddress: string | null = null;
      let recipientPhones: string[] | null = null;
      let recipientEmail: string | null = null;

      if (selectedCourtData) {
        const courtName = language === 'hy' ? selectedCourtData.fullName_hy : 
                          language === 'en' ? selectedCourtData.fullName_en : 
                          selectedCourtData.fullName_ru;
        finalRecipientOrg = courtName;
        recipientAddress = selectedCourtData.address || null;
        recipientPhones = selectedCourtData.phones || null;
      } else if (selectedProsecutorData) {
        const prosecutorName = language === 'hy' ? selectedProsecutorData.fullName_hy : 
                                language === 'en' ? selectedProsecutorData.fullName_en : 
                                selectedProsecutorData.fullName_ru;
        finalRecipientOrg = prosecutorName;
        recipientAddress = selectedProsecutorData.address || null;
        recipientPhones = selectedProsecutorData.phones || null;
        recipientEmail = selectedProsecutorData.email || null;
      } else if (selectedGovernmentData) {
        const govName = language === 'hy' ? selectedGovernmentData.fullName_hy : 
                        language === 'en' ? selectedGovernmentData.fullName_en : 
                        selectedGovernmentData.fullName_ru;
        finalRecipientOrg = govName;
        recipientAddress = selectedGovernmentData.address || null;
        recipientPhones = selectedGovernmentData.phones || null;
        recipientEmail = selectedGovernmentData.email || null;
      } else if (selectedInvestigativeData) {
        const invName = language === 'hy' ? selectedInvestigativeData.fullName_hy : 
                        language === 'en' ? selectedInvestigativeData.fullName_en : 
                        selectedInvestigativeData.fullName_ru;
        finalRecipientOrg = invName;
        recipientAddress = selectedInvestigativeData.address || null;
        recipientPhones = selectedInvestigativeData.phones || null;
        recipientEmail = selectedInvestigativeData.email || null;
      } else if (selectedCommitteeData) {
        const commName = language === 'hy' ? selectedCommitteeData.fullName_hy : 
                         language === 'en' ? selectedCommitteeData.fullName_en : 
                         selectedCommitteeData.fullName_ru;
        finalRecipientOrg = commName;
        recipientAddress = selectedCommitteeData.address || null;
        recipientPhones = selectedCommitteeData.phones || null;
        recipientEmail = selectedCommitteeData.email || null;
      }

      // Build additional fields including dynamic fields and uploaded files
      const additionalFields = {
        ...dynamicFields,
        uploadedFiles: uploadedFiles.map((f, idx) => ({
          name: f.file.name,
          description: f.description,
          attachmentNumber: idx + 1,
          extractedText: f.extractedText
        }))
      };

      const { data, error } = await supabase.functions.invoke("generate-document", {
        body: {
          templateId: selectedTemplate.id,
          templateName: getTemplateName(selectedTemplate),
          category: selectedTemplate.category,
          subcategory: selectedTemplate.subcategory,
          caseData: caseData || null,
          sourceText: sourceText || null,
          fileExtractedText: fileExtractedText || null,
          recipientName,
          recipientPosition,
          recipientOrganization: finalRecipientOrg,
          recipientAddress,
          recipientPhones,
          recipientEmail,
          senderName,
          senderAddress,
          senderContact,
          language,
          additionalFields
        },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      setGeneratedContent(data.content);
      setEditedContent(data.content);
      setIsEditing(false);
      setShowPreviewModal(true);
      
      toast({
        title: t("cases:document_created"),
        description: t("cases:document_generated_success"),
      });
    } catch (error: any) {
      console.error("Generation error:", error);
      toast({
        title: t("common:error"),
        description: error.message || t("cases:generation_error"),
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    const contentToSave = editedContent || generatedContent;
    if (!contentToSave) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("generated_documents").insert({
        case_id: caseData?.id || null,
        template_id: selectedTemplate?.id || null,
        user_id: user.id,
        title: selectedTemplate ? getTemplateName(selectedTemplate) : "Документ",
        recipient_name: recipientName,
        recipient_position: recipientPosition,
        recipient_organization: recipientOrganization,
        sender_name: senderName,
        sender_address: senderAddress,
        sender_contact: senderContact,
        content_text: contentToSave,
        source_text: sourceText || caseData?.facts || null,
        status: "draft",
      });

      if (error) throw error;

      toast({
        title: t("cases:document_saved"),
        description: t("cases:document_saved_to_drafts"),
      });
    } catch (error: any) {
      console.error("Save error:", error);
      toast({
        title: t("common:error"),
        description: error.message || t("cases:save_error"),
        variant: "destructive",
      });
    }
  };

  // Handle loading document from history
  const handleLoadFromHistory = useCallback((doc: { content_text: string; title: string }) => {
    setGeneratedContent(doc.content_text);
    setEditedContent(doc.content_text);
    setShowHistory(false);
    setShowPreviewModal(true);
  }, []);

  // Labels for UI
  const labels = {
    validate: i18n.language === 'hy' ? "\u054d\u057f\u0578\u0582\u0563\u0565\u056c \u057f\u057e\u0575\u0561\u056c\u0576\u0565\u0580\u0568" : i18n.language === 'ru' ? "\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u0434\u0430\u043d\u043d\u044b\u0435" : "Validate data",
    history: i18n.language === 'hy' ? "\u054a\u0561\u057f\u0574\u0578\u0582\u0569\u0575\u0578\u0582\u0576" : i18n.language === 'ru' ? "\u0418\u0441\u0442\u043e\u0440\u0438\u044f" : "History",
    recipient: i18n.language === 'hy' ? '\u0540\u0561\u057D\u0581\u0565\u0561\u057F\u0565\u0580' : i18n.language === 'en' ? 'Recipient' : 'Адресат',
    court: i18n.language === 'hy' ? "\u0534\u0561\u057F\u0561\u0580\u0561\u0576" : i18n.language === 'en' ? 'Court' : 'Суд',
    prosecutor: i18n.language === 'hy' ? "\u0534\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576" : i18n.language === 'en' ? "Prosecutor" : 'Прокуратура',
    investigative: i18n.language === 'hy' ? "\u0554\u0576\u0576\u0579\u0561\u056F\u0561\u0576" : i18n.language === 'en' ? 'Investigative' : 'Расследование',
    government: i18n.language === 'hy' ? "\u053F\u0561\u057C\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576" : i18n.language === 'en' ? 'Government' : 'Правительство',
    other: i18n.language === 'hy' ? "\u0531\u0575\u056C" : i18n.language === 'en' ? 'Other' : 'Другое',
    position: i18n.language === 'hy' ? '\u054A\u0561\u0577\u057F\u0578\u0576' : i18n.language === 'en' ? 'Position' : 'Должность',
    fullName: i18n.language === 'hy' ? '\u0531\u0576\u0578\u0582\u0576 \u0561\u0566\u0563\u0561\u0576\u0578\u0582\u0576' : i18n.language === 'en' ? 'Full name' : 'ФИО',
    orEnterManually: i18n.language === 'hy' ? "\u053F\u0561\u0574 \u0574\u0578\u0582\u057F\u0584\u0561\u0563\u0580\u0565\u0584 \u0571\u0565\u057C\u0584\u0578\u057E" : i18n.language === 'en' ? 'Or enter manually' : 'Или введите вручную',
    describeYourSituation: i18n.language === 'hy' ? "\u0546\u056F\u0561\u0580\u0561\u0563\u0580\u0565\u0584 \u0571\u0565\u0580 \u056B\u0580\u0561\u057E\u056B\u0573\u0561\u056F\u0568" : i18n.language === 'en' ? 'Describe Your Situation' : 'Опишите вашу ситуацию',
    aiWillGenerate: i18n.language === 'hy' ? "\u0531\u0532-\u0576 \u056F\u057D\u057F\u0565\u0572\u056E\u056B \u0574\u0561\u057D\u0576\u0561\u0563\u056B\u057F\u0561\u056F\u0561\u0576 \u056B\u0580\u0561\u057E\u0561\u0562\u0561\u0576\u0561\u056F\u0561\u0576 \u0583\u0561\u057D\u057F\u0561\u0569\u0578\u0582\u0572\u0569 \u0571\u0565\u0580 \u0576\u056F\u0561\u0580\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0561\u0576 \u0570\u056B\u0574\u0561\u0576 \u057E\u0580\u0561" : i18n.language === 'en' ? 'The AI will generate a professional legal document based on your description' : 'ИИ сгенерирует профессиональный юридический документ на основе вашего описания',
    textareaPlaceholder: i18n.language === 'hy' 
      ? "\u0546\u056F\u0561\u0580\u0561\u0563\u0580\u0565\u0584 \u0571\u0565\u0580 \u0563\u0578\u0580\u056E\u056B \u0583\u0561\u057D\u057F\u0565\u0580\u0568, \u056B\u0576\u0579 \u0567 \u057A\u0561\u057F\u0561\u0570\u0565\u056C, \u056B\u0576\u0579 \u0565\u0584 \u0578\u0582\u0566\u0578\u0582\u0574 \u0570\u0561\u057D\u0576\u0565\u056C, \u0571\u0565\u0580 \u057A\u0561\u0570\u0561\u0576\u057B\u0576\u0565\u0580\u0568..." 
      : i18n.language === 'en'
      ? 'Describe the facts of your case, what happened, what you want to achieve, your demands...' 
      : 'Опишите факты вашего дела, что произошло, чего вы хотите добиться, ваши требования...',
    caseDataNote: i18n.language === 'hy' ? "\u0533\u0578\u0580\u056E\u056B \u057F\u057E\u0575\u0561\u056C\u0576\u0565\u0580\u0568 \u0576\u0578\u0582\u0575\u0576\u057A\u0565\u057D \u056F\u0585\u0563\u057F\u0561\u0563\u0578\u0580\u056E\u057E\u0565\u0576 \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u056B \u057D\u057F\u0565\u0572\u056E\u0574\u0561\u0576 \u0570\u0561\u0574\u0561\u0580\u0589" : i18n.language === 'en' ? 'Case data will also be used for generation.' : 'Данные дела также будут использованы для генерации.',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="template">{t("cases:template_select_tab")}</TabsTrigger>
          <TabsTrigger value="result" disabled={!generatedContent}>
            {t("cases:result_tab")}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1">
            <History className="h-3 w-3" />
            {labels.history}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="template" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Template Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {t("cases:document_type")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DocumentTemplateList
                  templates={templates}
                  selectedTemplate={selectedTemplate}
                  onSelect={setSelectedTemplate}
                  getTemplateName={getTemplateName}
                  recipientType={recipientType}
                />
              </CardContent>
            </Card>

            {/* Form Fields */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{labels.recipient}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Recipient Type Selector */}
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant={recipientType === "court" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setRecipientType("court");
                        setSelectedTemplate(null);
                        setSelectedProsecutorId("");
                        setSelectedProsecutorData(null);
                        setSelectedGovernmentId("");
                        setSelectedGovernmentData(null);
                        setSelectedInvestigativeId("");
                        setSelectedInvestigativeData(null);
                        setSelectedCommitteeId("");
                        setSelectedCommitteeData(null);
                      }}
                    >
                      {labels.court}
                    </Button>
                    <Button
                      type="button"
                      variant={recipientType === "prosecutor" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setRecipientType("prosecutor");
                        setSelectedTemplate(null);
                        setSelectedCourtId("");
                        setSelectedCourtData(null);
                        setSelectedGovernmentId("");
                        setSelectedGovernmentData(null);
                        setSelectedInvestigativeId("");
                        setSelectedInvestigativeData(null);
                        setSelectedCommitteeId("");
                        setSelectedCommitteeData(null);
                      }}
                    >
                      {labels.prosecutor}
                    </Button>
                    <Button
                      type="button"
                      variant={recipientType === "investigative" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setRecipientType("investigative");
                        setSelectedTemplate(null);
                        setSelectedCourtId("");
                        setSelectedCourtData(null);
                        setSelectedProsecutorId("");
                        setSelectedProsecutorData(null);
                        setSelectedGovernmentId("");
                        setSelectedGovernmentData(null);
                        setSelectedCommitteeId("");
                        setSelectedCommitteeData(null);
                      }}
                    >
                      {labels.investigative}
                    </Button>
                    <Button
                      type="button"
                      variant={recipientType === "government" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setRecipientType("government");
                        setSelectedTemplate(null);
                        setSelectedCourtId("");
                        setSelectedCourtData(null);
                        setSelectedProsecutorId("");
                        setSelectedProsecutorData(null);
                        setSelectedInvestigativeId("");
                        setSelectedInvestigativeData(null);
                        setSelectedCommitteeId("");
                        setSelectedCommitteeData(null);
                      }}
                    >
                      {labels.government}
                    </Button>
                    <Button
                      type="button"
                      variant={recipientType === "other" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setRecipientType("other");
                        setSelectedTemplate(null);
                        setSelectedCourtId("");
                        setSelectedCourtData(null);
                        setSelectedProsecutorId("");
                        setSelectedProsecutorData(null);
                        setSelectedGovernmentId("");
                        setSelectedGovernmentData(null);
                        setSelectedInvestigativeId("");
                        setSelectedInvestigativeData(null);
                      }}
                    >
                      {labels.other}
                    </Button>
                  </div>

                  {/* Court Selector */}
                  {recipientType === "court" && (
                    <CourtSelector
                      value={selectedCourtId}
                      onChange={(courtId, courtData) => {
                        setSelectedCourtId(courtId);
                        setSelectedCourtData(courtData);
                        if (courtData) {
                          const courtName = i18n.language === 'hy' ? courtData.fullName_hy : 
                                            i18n.language === 'en' ? courtData.fullName_en : 
                                            courtData.fullName_ru;
                          setRecipientOrganization(courtName);
                        }
                      }}
                    />
                  )}

                  {/* Prosecutor Selector */}
                  {recipientType === "prosecutor" && (
                    <ProsecutorSelector
                      value={selectedProsecutorId}
                      onChange={(prosecutorId, prosecutorData) => {
                        setSelectedProsecutorId(prosecutorId);
                        setSelectedProsecutorData(prosecutorData);
                        if (prosecutorData) {
                          const prosecutorName = i18n.language === 'hy' ? prosecutorData.fullName_hy : 
                                                  i18n.language === 'en' ? prosecutorData.fullName_en : 
                                                  prosecutorData.fullName_ru;
                          setRecipientOrganization(prosecutorName);
                        }
                      }}
                    />
                  )}

                  {/* Investigative Body Selector */}
                  {recipientType === "investigative" && (
                    <InvestigativeBodySelector
                      value={selectedInvestigativeId}
                      onChange={(bodyId, bodyData) => {
                        setSelectedInvestigativeId(bodyId);
                        setSelectedInvestigativeData(bodyData);
                        if (bodyData) {
                          const bodyName = i18n.language === 'hy' ? bodyData.fullName_hy : 
                                            i18n.language === 'en' ? bodyData.fullName_en : 
                                            bodyData.fullName_ru;
                          setRecipientOrganization(bodyName);
                        }
                      }}
                    />
                  )}

                  {/* Government Selector */}
                  {recipientType === "government" && (
                    <GovernmentSelector
                      value={selectedGovernmentId}
                      onChange={(governmentId, governmentData) => {
                        setSelectedGovernmentId(governmentId);
                        setSelectedGovernmentData(governmentData);
                        if (governmentData) {
                          const govName = i18n.language === 'hy' ? governmentData.fullName_hy : 
                                          i18n.language === 'en' ? governmentData.fullName_en : 
                                          governmentData.fullName_ru;
                          setRecipientOrganization(govName);
                        }
                      }}
                    />
                  )}

                  {/* Other Organization */}
                  {recipientType === "other" && (
                    <div className="space-y-4">
                      <CommitteeServiceSelector
                        value={selectedCommitteeId}
                        onChange={(bodyId, bodyData) => {
                          setSelectedCommitteeId(bodyId);
                          setSelectedCommitteeData(bodyData);
                          if (bodyData) {
                            const bodyName = i18n.language === 'hy' ? bodyData.fullName_hy : 
                                              i18n.language === 'en' ? bodyData.fullName_en : 
                                              bodyData.fullName_ru;
                            setRecipientOrganization(bodyName);
                          }
                        }}
                      />
                      
                      <div>
                        <Label htmlFor="recipientOrganization">{labels.orEnterManually}</Label>
                        <Input
                          id="recipientOrganization"
                          value={recipientOrganization}
                          onChange={(e) => {
                            setRecipientOrganization(e.target.value);
                            setSelectedCommitteeId("");
                            setSelectedCommitteeData(null);
                          }}
                          placeholder={i18n.language === 'hy' ? "\u0555\u0580\u056B\u0576\u0561\u056F\u055D \u053F\u0561\u0566\u0574\u0561\u056F\u0565\u0580\u057A\u0578\u0582\u0569\u0575\u0561\u0576 \u0561\u0576\u0578\u0582\u0576\u0568" : 
                                        i18n.language === 'en' ? 'e.g. Other organization name' : 
                                        'Например: Название другой организации'}
                        />
                      </div>
                    </div>
                  )}
                  
                  <div>
                    <Label htmlFor="recipientPosition">{labels.position}</Label>
                    <Input
                      id="recipientPosition"
                      value={recipientPosition}
                      onChange={(e) => setRecipientPosition(e.target.value)}
                      placeholder={i18n.language === 'hy' ? '\u0555\u0580\u056B\u0576\u0561\u056F\u055D \u0546\u0561\u056D\u0561\u0563\u0561\u0570' : 
                                    i18n.language === 'en' ? 'e.g. Chairman' : 
                                    'Например: Председатель'}
                    />
                  </div>
                  <div>
                    <Label htmlFor="recipientName">{labels.fullName}</Label>
                    <Input
                      id="recipientName"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder={i18n.language === 'hy' ? '\u053B\u057E\u0561\u0576\u0578\u057E \u053B\u057E\u0561\u0576 \u053B\u057E\u0561\u0576\u056B' : 
                                    i18n.language === 'en' ? 'John Smith' : 
                                    'Иванов Иван Иванович'}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("cases:sender")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="senderName">{t("cases:sender_name")}</Label>
                    <Input
                      id="senderName"
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      placeholder={t("cases:sender_name_placeholder")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="senderAddress">{t("cases:sender_address")}</Label>
                    <Input
                      id="senderAddress"
                      value={senderAddress}
                      onChange={(e) => setSenderAddress(e.target.value)}
                      placeholder={t("cases:sender_address_placeholder")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="senderContact">{t("cases:sender_contact")}</Label>
                    <Input
                      id="senderContact"
                      value={senderContact}
                      onChange={(e) => setSenderContact(e.target.value)}
                      placeholder={t("cases:sender_contact_placeholder")}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Dynamic Document Fields */}
              {selectedTemplate && (
                <DynamicDocumentFields
                  templateId={selectedTemplate.id}
                  category={selectedTemplate.category}
                  subcategory={selectedTemplate.subcategory}
                  onFieldsChange={setDynamicFields}
                />
              )}

              <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    {labels.describeYourSituation}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{labels.aiWillGenerate}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    value={sourceText}
                    onChange={(e) => setSourceText(e.target.value)}
                    placeholder={labels.textareaPlaceholder}
                    className="min-h-[180px] text-base"
                  />
                  
                  {/* Enhanced File Upload */}
                  <EnhancedFileUpload
                    files={uploadedFiles}
                    onFilesChange={setUploadedFiles}
                    onExtractedTextChange={setFileExtractedText}
                    isDisabled={isGenerating}
                  />
                  
                  {caseData && (
                    <p className="text-xs text-muted-foreground">{labels.caseDataNote}</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("cases:document_language")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hy">{"\u0540\u0561\u0575\u0565\u0580\u0565\u0576"} (Armenian)</SelectItem>
                      <SelectItem value="ru">Русский</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  onClick={handleValidate}
                  disabled={isGenerating}
                  className="flex-1"
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {labels.validate}
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={!selectedTemplate || isGenerating}
                  className="flex-1"
                  size="lg"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("cases:generating")}
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      {t("cases:generate_document_btn")}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="result">
          {generatedContent && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {selectedTemplate ? getTemplateName(selectedTemplate) : "Документ"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <DocumentEditor
                    content={editedContent}
                    onChange={setEditedContent}
                    editable={true}
                  />
                ) : (
                  <DocumentPreview content={editedContent || generatedContent} />
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history">
          <DocumentHistory
            onLoadDocument={handleLoadFromHistory}
            onClose={() => setActiveTab("template")}
          />
        </TabsContent>
      </Tabs>

      {/* Validation Modal */}
      <ValidationModal
        open={showValidationModal}
        onOpenChange={setShowValidationModal}
        fields={validationFields}
        onProceed={handleGenerate}
        onCancel={() => setShowValidationModal(false)}
      />

      {/* Preview Modal */}
      <DocumentPreviewModal
        open={showPreviewModal}
        onOpenChange={setShowPreviewModal}
        content={editedContent || generatedContent}
        title={selectedTemplate ? getTemplateName(selectedTemplate) : "Документ"}
        onEdit={() => {
          setShowPreviewModal(false);
          setIsEditing(true);
          setActiveTab("result");
        }}
        onRegenerate={handleGenerate}
        onSave={handleSave}
        isGenerating={isGenerating}
      />
    </div>
  );
}
