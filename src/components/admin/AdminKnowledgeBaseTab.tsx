import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useKnowledgeBase, type KBFilters } from "@/hooks/useKnowledgeBase";
import { KBSearchFilters } from "@/components/kb/KBSearchFilters";
import { KBDocumentCard } from "@/components/kb/KBDocumentCard";
import { KBDocumentForm } from "@/components/kb/KBDocumentForm";
import { KBPagination } from "@/components/kb/KBPagination";
import { KBPdfUpload } from "@/components/kb/KBPdfUpload";
import { KBBulkImport } from "@/components/kb/KBBulkImport";
import { KBWebScraper } from "@/components/kb/KBWebScraper";
import { KBJsonlImport } from "@/components/kb/KBJsonlImport";
import { KBMultiFileUpload } from "@/components/kb/KBMultiFileUpload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Plus, 
  Loader2,
  BookOpen,
  FileUp,
  FileStack,
  Globe,
  FileJson,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Database } from "@/integrations/supabase/types";

type KnowledgeBase = Database["public"]["Tables"]["knowledge_base"]["Row"];

export function AdminKnowledgeBaseTab() {
  const { t } = useTranslation(["kb", "common"]);
  const navigate = useNavigate();

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

  const handleCreate = (data: Database["public"]["Tables"]["knowledge_base"]["Insert"]) => {
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
    category: Database["public"]["Enums"]["kb_category"];
    source_name: string;
  }) => {
    createDocument.mutate(data, {
      onSuccess: () => setPdfUploadOpen(false),
    });
  };

  const handleUpdate = (data: Database["public"]["Tables"]["knowledge_base"]["Update"]) => {
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

  const refreshList = () => {
    setFilters({ ...filters });
  };

  return (
    <>
      <div className="space-y-6">
        {/* Action Buttons */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              {"\u0533\u056B\u057F\u0565\u056C\u056B\u0584\u0576\u0565\u0580\u056B \u0562\u0561\u0566\u0561\u0575\u056B \u056F\u0561\u057C\u0561\u057E\u0561\u0580\u0578\u0582\u0574"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <Button onClick={() => setFormOpen(true)} className="w-full sm:w-auto">
                <Plus className="mr-1.5 h-4 w-4" />
                <span className="text-xs sm:text-sm">{t("add_document")}</span>
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
                <span className="text-xs sm:text-sm">{"\u0424\u0430\u0439\u043B\u044B"}</span>
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
            {t("results_found", { count: documents.length })}
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
              {t("no_results")}
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
                    if (docToEdit && "is_active" in docToEdit) setEditingDoc(docToEdit as KnowledgeBase);
                  }}
                  onDelete={(id) => setDeletingDocId(id)}
                  isAdmin={true}
                  rank={"rank" in doc ? (doc.rank as number) : undefined}
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
      </div>

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
          refreshList();
        }}
      />

      {/* Multi-File Upload (Bulk PDF/Images) */}
      <KBMultiFileUpload
        open={multiFileUploadOpen}
        onOpenChange={setMultiFileUploadOpen}
        onSuccess={() => {
          setMultiFileUploadOpen(false);
          refreshList();
        }}
      />

      {/* Web Scraper for bulk PDF import */}
      <KBWebScraper
        open={webScraperOpen}
        onOpenChange={setWebScraperOpen}
        onSuccess={() => {
          setWebScraperOpen(false);
          refreshList();
        }}
      />

      {/* JSONL Import for massive bulk import */}
      <KBJsonlImport
        open={jsonlImportOpen}
        onOpenChange={setJsonlImportOpen}
        onSuccess={() => {
          setJsonlImportOpen(false);
          refreshList();
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingDocId} onOpenChange={() => setDeletingDocId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete_document")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirm_delete")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              {t("common:delete", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
