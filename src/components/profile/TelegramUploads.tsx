import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { FileText, Image, Download, Trash2, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

interface TelegramUpload {
  id: string;
  user_id: string;
  filename: string;
  original_filename: string;
  storage_path: string;
  file_type: string | null;
  file_size: number | null;
  caption: string | null;
  created_at: string;
}

export const TelegramUploads = () => {
  const { i18n } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const getText = (hy: string, ru: string, en: string) => {
    if (i18n.language === 'hy') return hy;
    if (i18n.language === 'ru') return ru;
    return en;
  };

  const { data: uploads, isLoading } = useQuery({
    queryKey: ['telegram-uploads', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      // Use type assertion since telegram_uploads is new
      const { data, error } = await (supabase as any)
        .from('telegram_uploads')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as TelegramUpload[];
    },
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: async (upload: TelegramUpload) => {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('telegram-uploads')
        .remove([upload.storage_path]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await (supabase as any)
        .from('telegram_uploads')
        .delete()
        .eq('id', upload.id);

      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telegram-uploads'] });
      toast({
        title: getText(' Delays', 'Файл удалён', 'File deleted'),
      });
    },
    onError: () => {
      toast({
        title: getText('Сխал', 'Ошибка', 'Error'),
        description: getText('Չdelays', 'Не удалось удалить файл', 'Failed to delete file'),
        variant: 'destructive',
      });
    },
  });

  const downloadFile = async (upload: TelegramUpload) => {
    try {
      const { data, error } = await supabase.storage
        .from('telegram-uploads')
        .createSignedUrl(upload.storage_path, 3600);

      if (error) throw error;

      window.open(data.signedUrl, '_blank');
    } catch (error) {
      toast({
        title: getText('Сխал', 'Ошибка', 'Error'),
        description: getText('Չdelays', 'Не удалось скачать файл', 'Failed to download file'),
        variant: 'destructive',
      });
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string | null) => {
    if (mimeType?.startsWith('image/')) {
      return <Image className="h-5 w-5 text-primary" />;
    }
    return <FileText className="h-5 w-5 text-muted-foreground" />;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!uploads || uploads.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>{getText('Delays', 'Нет загруженных файлов', 'No uploaded files')}</p>
          <p className="text-sm mt-2">
            {getText(
              'Delays Telegram',
              'Отправьте файл боту в Telegram',
              'Send a file to the Telegram bot'
            )}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {uploads.map((upload) => (
        <Card key={upload.id} className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              {getFileIcon(upload.file_type)}
              
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{upload.original_filename}</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{formatFileSize(upload.file_size)}</span>
                  <span>•</span>
                  <span>{format(new Date(upload.created_at), 'dd.MM.yyyy HH:mm')}</span>
                </div>
                {upload.caption && (
                  <p className="text-sm text-muted-foreground mt-1 truncate">
                    {upload.caption}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => downloadFile(upload)}
                  title={getText('Ներdelays', 'Скачать', 'Download')}
                >
                  <Download className="h-4 w-4" />
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      title={getText('Ջdelays', 'Удалить', 'Delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {getText(' Delays', 'Удалить файл?', 'Delete file?')}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {getText(
                          'Delays',
                          'Файл будет удалён безвозвратно.',
                          'The file will be permanently deleted.'
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        {getText('Չdelays', 'Отмена', 'Cancel')}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate(upload)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {getText('Ջdelays', 'Удалить', 'Delete')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
