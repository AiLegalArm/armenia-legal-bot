import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Plus, FileText, Trash2, Edit2, CheckCircle, Clock } from "lucide-react";
import type { CaseVolume } from "./types";

interface VolumeManagerProps {
  caseId: string;
  volumes: CaseVolume[];
  onCreateVolume: (data: Partial<CaseVolume>) => Promise<CaseVolume | null>;
  onUpdateVolume: (volumeId: string, data: Partial<CaseVolume>) => Promise<void>;
  onDeleteVolume: (volumeId: string) => Promise<void>;
}

export function VolumeManager({
  caseId,
  volumes,
  onCreateVolume,
  onUpdateVolume,
  onDeleteVolume
}: VolumeManagerProps) {
  const { t } = useTranslation(["ai", "cases"]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingVolume, setEditingVolume] = useState<CaseVolume | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    page_count: ""
  });

  const handleCreateVolume = async () => {
    const result = await onCreateVolume({
      title: formData.title,
      description: formData.description,
      page_count: formData.page_count ? parseInt(formData.page_count) : undefined
    });
    
    if (result) {
      setFormData({ title: "", description: "", page_count: "" });
      setIsAddDialogOpen(false);
    }
  };

  const handleUpdateVolume = async () => {
    if (!editingVolume) return;
    
    await onUpdateVolume(editingVolume.id, {
      title: formData.title,
      description: formData.description,
      page_count: formData.page_count ? parseInt(formData.page_count) : undefined
    });
    
    setEditingVolume(null);
    setFormData({ title: "", description: "", page_count: "" });
  };

  const openEditDialog = (volume: CaseVolume) => {
    setEditingVolume(volume);
    setFormData({
      title: volume.title,
      description: volume.description || "",
      page_count: volume.page_count?.toString() || ""
    });
  };

  return (
    <div className="space-y-4">
      {/* Header with Add button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{t("ai:case_volumes")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("ai:volumes_description")}
          </p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t("ai:add_volume")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("ai:add_volume")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">{t("ai:volume_title")}</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder={t("ai:volume_title_placeholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t("ai:volume_description")}</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder={t("ai:volume_description_placeholder")}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="page_count">{t("ai:page_count")}</Label>
                <Input
                  id="page_count"
                  type="number"
                  value={formData.page_count}
                  onChange={(e) => setFormData(prev => ({ ...prev, page_count: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                {t("common:cancel")}
              </Button>
              <Button onClick={handleCreateVolume} disabled={!formData.title}>
                {t("common:create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Volumes Grid */}
      {volumes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              {t("ai:no_volumes")}
            </p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => setIsAddDialogOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("ai:add_first_volume")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {volumes.map((volume) => (
            <Card key={volume.id} className="group">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-base">
                      {t("ai:volume")} {volume.volume_number}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEditDialog(volume)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("ai:delete_volume")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("ai:delete_volume_confirm")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("common:cancel")}</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => onDeleteVolume(volume.id)}
                            className="bg-destructive text-destructive-foreground"
                          >
                            {t("common:delete")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="font-medium mb-2">{volume.title}</p>
                {volume.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {volume.description}
                  </p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {volume.page_count && (
                    <Badge variant="secondary">
                      {volume.page_count} {t("ai:pages")}
                    </Badge>
                  )}
                  <Badge variant={volume.ocr_completed ? "default" : "outline"}>
                    {volume.ocr_completed ? (
                      <>
                        <CheckCircle className="mr-1 h-3 w-3" />
                        OCR
                      </>
                    ) : (
                      <>
                        <Clock className="mr-1 h-3 w-3" />
                        {t("ai:pending_ocr")}
                      </>
                    )}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingVolume} onOpenChange={(open) => !open && setEditingVolume(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ai:edit_volume")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">{t("ai:volume_title")}</Label>
              <Input
                id="edit-title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">{t("ai:volume_description")}</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-page_count">{t("ai:page_count")}</Label>
              <Input
                id="edit-page_count"
                type="number"
                value={formData.page_count}
                onChange={(e) => setFormData(prev => ({ ...prev, page_count: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingVolume(null)}>
              {t("common:cancel")}
            </Button>
            <Button onClick={handleUpdateVolume}>
              {t("common:save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
