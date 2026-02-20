import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCases } from '@/hooks/useCases';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  ArrowLeft, 
  Scale, 
  LogOut, 
  Mic, 
  Upload, 
  Loader2,
  FileAudio,
  CheckCircle,
  AlertCircle,
  Download
} from 'lucide-react';

const SUPPORTED_AUDIO_FORMATS = [
  'audio/mpeg',
  'audio/wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
];

const SUPPORTED_VIDEO_FORMATS = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/x-matroska',
];

const ALL_SUPPORTED_FORMATS = [...SUPPORTED_AUDIO_FORMATS, ...SUPPORTED_VIDEO_FORMATS];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

const AudioTranscriptions = () => {
  const { t } = useTranslation(['audio', 'common', 'errors']);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const { cases, isLoading: casesLoading } = useCases({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [transcriptionResult, setTranscriptionResult] = useState<{
    success: boolean;
    transcription?: string;
    confidence_score?: number;
    language_detected?: string;
    duration_seconds?: number;
    error?: string;
  } | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const isM4A = fileExt === 'm4a';
    
    if (!ALL_SUPPORTED_FORMATS.includes(file.type) && !isM4A) {
      toast({
        title: t('audio:unsupported_format'),
        description: t('audio:supported_formats'),
        variant: 'destructive',
      });
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: t('audio:file_too_large'),
        description: t('audio:max_size', 'Maximum file size: 100MB'),
        variant: 'destructive',
      });
      return;
    }

    setSelectedFile(file);
    setTranscriptionResult(null);
  };

  const handleUploadAndTranscribe = async () => {
    if (!selectedFile || !selectedCaseId || !user) return;

    setIsUploading(true);
    setTranscriptionResult(null);

    try {
      // Generate UUID for file
      const fileId = crypto.randomUUID();
      const fileExt = selectedFile.name.split('.').pop()?.toLowerCase();
      const storagePath = `${selectedCaseId}/${fileId}.${fileExt}`;

      // Normalize MIME type for M4A files
      let contentType = selectedFile.type;
      if (fileExt === 'm4a' || selectedFile.type === 'audio/x-m4a' || selectedFile.type === 'audio/m4a') {
        contentType = 'audio/mp4';
      }

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('case-files')
        .upload(storagePath, selectedFile, { contentType });

      if (uploadError) throw uploadError;

      // Create case_files record
      const { data: fileRecord, error: dbError } = await supabase
        .from('case_files')
        .insert({
          case_id: selectedCaseId,
          filename: `${fileId}.${fileExt}`,
          original_filename: selectedFile.name,
          storage_path: storagePath,
          file_type: contentType,
          file_size: selectedFile.size,
          hash_sha256: '',
          version: 1,
          uploaded_by: user.id,
        })
        .select()
        .single();

      if (dbError) {
        await supabase.storage.from('case-files').remove([storagePath]);
        throw dbError;
      }

      // Get signed URL for the audio file
      const { data: signedUrlData } = await supabase.storage
        .from('case-files')
        .createSignedUrl(storagePath, 3600);

      if (!signedUrlData?.signedUrl) {
        throw new Error('Failed to get signed URL');
      }

      // Call edge function for transcription
      const { data: result, error: fnError } = await supabase.functions
        .invoke('audio-transcribe', {
          body: {
            audioUrl: signedUrlData.signedUrl,
            fileName: selectedFile.name,
            caseId: selectedCaseId,
            fileId: fileRecord.id,
          },
        });

      if (fnError) throw fnError;

      setTranscriptionResult({
        success: true,
        transcription: result.transcription,
        confidence_score: result.confidence_score,
        language_detected: result.language_detected,
        duration_seconds: result.duration_seconds,
      });

      toast({
        title: t('audio:processing_complete'),
        description: `${t('audio:confidence')}: ${Math.round((result.confidence_score || 0) * 100)}%`,
        variant: result.confidence_score >= 0.5 ? 'default' : 'destructive',
      });

      // Reset form
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      console.error('Transcription error:', error);
      setTranscriptionResult({
        success: false,
        error: error instanceof Error ? error.message : t('errors:transcription_failed'),
      });
      toast({
        title: t('audio:processing_failed'),
        description: error instanceof Error ? error.message : t('errors:transcription_failed'),
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Scale className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">{t('common:app_name')}</h1>
            </div>
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
        <div className="mb-6">
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <Mic className="h-6 w-6 text-primary" />
            {t('audio:audio_transcription')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('audio:upload_description', 'Upload audio files to transcribe them automatically')}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Upload Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                {t('audio:upload_audio')}
              </CardTitle>
              <CardDescription>
                {t('audio:supported_formats', 'Supported: MP3, WAV, M4A, OGG, WebM, FLAC')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Case Selection */}
              <div className="space-y-2">
                <Label>{t('audio:select_case', 'Select Case')}</Label>
                <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('audio:select_case_placeholder', 'Choose a case...')} />
                  </SelectTrigger>
                  <SelectContent>
                    {casesLoading ? (
                      <div className="flex items-center justify-center p-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : cases.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        {t('cases:no_cases')}
                      </div>
                    ) : (
                      cases.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.case_number} - {c.title}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* File Input */}
              <div className="space-y-2">
                <Label>{t('audio:audio_file', 'Audio File')}</Label>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,video/*,.m4a,.mp3,.wav,.ogg,.webm,.flac,.aac,.mp4,.mov,.avi,.mkv"
                  onChange={handleFileSelect}
                  disabled={isUploading}
                />
              </div>

              {/* Selected File Info */}
              {selectedFile && (
                <div className="flex items-center gap-2 rounded-lg border p-3">
                  <FileAudio className="h-5 w-5 text-primary" />
                  <div className="flex-1 truncate">
                    <p className="font-medium truncate">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
              )}

              {/* Upload Button */}
              <Button
                onClick={handleUploadAndTranscribe}
                disabled={!selectedFile || !selectedCaseId || isUploading}
                className="w-full"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('audio:processing')}
                  </>
                ) : (
                  <>
                    <Mic className="mr-2 h-4 w-4" />
                    {t('audio:transcribe', 'Transcribe')}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Result */}
          <Card>
            <CardHeader>
              <CardTitle>{t('audio:result', 'Result')}</CardTitle>
            </CardHeader>
            <CardContent>
              {transcriptionResult ? (
                transcriptionResult.success ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-primary">
                      <CheckCircle className="h-5 w-5" />
                      <span className="font-medium">{t('audio:processing_complete')}</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">{t('audio:confidence')}:</span>{' '}
                        <span className="font-medium">
                          {Math.round((transcriptionResult.confidence_score || 0) * 100)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('audio:language')}:</span>{' '}
                        <span className="font-medium">{transcriptionResult.language_detected}</span>
                      </div>
                      {transcriptionResult.duration_seconds && (
                        <div>
                          <span className="text-muted-foreground">{t('audio:duration')}:</span>{' '}
                          <span className="font-medium">
                            {Math.floor(transcriptionResult.duration_seconds / 60)}:
                            {String(Math.floor(transcriptionResult.duration_seconds % 60)).padStart(2, '0')}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border bg-muted/50 p-4">
                      <p className="whitespace-pre-wrap text-sm">
                        {transcriptionResult.transcription}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          const text = [
                            `Язык: ${transcriptionResult.language_detected || '—'}`,
                            `Точность: ${Math.round((transcriptionResult.confidence_score || 0) * 100)}%`,
                            transcriptionResult.duration_seconds
                              ? `Длительность: ${Math.floor(transcriptionResult.duration_seconds / 60)}:${String(Math.floor(transcriptionResult.duration_seconds % 60)).padStart(2, '0')}`
                              : '',
                            '',
                            transcriptionResult.transcription || '',
                          ].filter(Boolean).join('\n');

                          const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `transcription_${new Date().toISOString().slice(0, 10)}.txt`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        {t('audio:save_transcription', 'Сохранить транскрипцию')}
                      </Button>

                      <Button
                        variant="outline"
                        onClick={() => navigate(`/cases/${selectedCaseId}/transcriptions`)}
                      >
                        {t('audio:view_all_transcriptions', 'View All Transcriptions')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-5 w-5" />
                    <span>{transcriptionResult.error}</span>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <Mic className="h-12 w-12 mb-4 opacity-50" />
                  <p>{t('audio:no_result', 'Upload an audio file to see the transcription result')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default AudioTranscriptions;
