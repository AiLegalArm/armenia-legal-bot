import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { 
  FileText, 
  MessageSquare, 
  Edit, 
  Plus,
  Loader2,
  Brain,
  Mic,
  FileSearch,
  Filter
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface TimelineEvent {
  id: string;
  type: 'file' | 'analysis' | 'note' | 'status_change' | 'created' | 'ocr' | 'audio';
  title: string;
  description?: string;
  timestamp: string;
  icon: React.ReactNode;
}

interface CaseTimelineProps {
  caseId: string;
}

// Default filter types
const DEFAULT_FILTER_TYPES = new Set(['file', 'analysis', 'note', 'created', 'ocr', 'audio']);

export function CaseTimeline({ caseId }: CaseTimelineProps) {
  const { t } = useTranslation(['cases', 'common', 'ai']);
  
  // Filter state
  const [filterTypes, setFilterTypes] = useState<Set<string>>(DEFAULT_FILTER_TYPES);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [showFilters, setShowFilters] = useState(false);

  // Fetch case files (shared for OCR and audio queries)
  const { data: caseFiles } = useQuery({
    queryKey: ['timeline-case-files', caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_files')
        .select('id')
        .eq('case_id', caseId)
        .is('deleted_at', null);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch case files for timeline
  const { data: files } = useQuery({
    queryKey: ['timeline-files', caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_files')
        .select('id, original_filename, created_at')
        .eq('case_id', caseId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch AI analyses
  const { data: analyses } = useQuery({
    queryKey: ['timeline-analyses', caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_analysis')
        .select('id, role, created_at')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  
  // Fetch OCR results
  const { data: ocrResults } = useQuery({
    queryKey: ['timeline-ocr', caseId],
    queryFn: async () => {
      // First get file IDs for this case
      const { data: caseFiles, error: filesError } = await supabase
        .from('case_files')
        .select('id')
        .eq('case_id', caseId)
        .is('deleted_at', null);
      
      if (filesError) throw filesError;
      if (!caseFiles || caseFiles.length === 0) return [];
      
      const fileIds = caseFiles.map(f => f.id);
      
      const { data, error } = await supabase
        .from('ocr_results')
        .select('id, created_at, file_id, case_files(original_filename)')
        .in('file_id', fileIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  
  // Fetch audio transcriptions
  const { data: audioTranscriptions } = useQuery({
    queryKey: ['timeline-audio', caseId],
    queryFn: async () => {
      // First get file IDs for this case
      const { data: caseFiles, error: filesError } = await supabase
        .from('case_files')
        .select('id')
        .eq('case_id', caseId)
        .is('deleted_at', null);
      
      if (filesError) throw filesError;
      if (!caseFiles || caseFiles.length === 0) return [];
      
      const fileIds = caseFiles.map(f => f.id);
      
      const { data, error } = await supabase
        .from('audio_transcriptions')
        .select('id, created_at, file_id, case_files(original_filename)')
        .in('file_id', fileIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch case data
  const { data: caseData, isLoading } = useQuery({
    queryKey: ['timeline-case', caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cases')
        .select('created_at, updated_at, title')
        .eq('id', caseId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Build timeline events
  const events: TimelineEvent[] = [];

  // Case created
  if (caseData) {
    events.push({
      id: 'created',
      type: 'created',
      title: t('cases:case_created'),
      timestamp: caseData.created_at,
      icon: <Plus className="h-4 w-4" />,
    });
  }

  // Files uploaded
  files?.forEach(file => {
    events.push({
      id: `file-${file.id}`,
      type: 'file',
      title: t('cases:upload_file'),
      description: file.original_filename,
      timestamp: file.created_at,
      icon: <FileText className="h-4 w-4" />,
    });
  });

  // AI analyses
  analyses?.forEach(analysis => {
    const roleLabels: Record<string, string> = {
      advocate: t('ai:advocate'),
      prosecutor: t('ai:prosecutor'),
      judge: t('ai:judge'),
      aggregator: t('ai:aggregator'),
    };
    events.push({
      id: `analysis-${analysis.id}`,
      type: 'analysis',
      title: t('ai:ai_analysis'),
      description: roleLabels[analysis.role] || analysis.role,
      timestamp: analysis.created_at,
      icon: <Brain className="h-4 w-4" />,
    });
  });
  
  // OCR results
  ocrResults?.forEach(ocr => {
    events.push({
      id: `ocr-${ocr.id}`,
      type: 'ocr',
      title: t('cases:ocr_processed'),
      description: ocr.case_files?.original_filename,
      timestamp: ocr.created_at,
      icon: <FileSearch className="h-4 w-4" />,
    });
  });
  
  // Audio transcriptions
  audioTranscriptions?.forEach(audio => {
    events.push({
      id: `audio-${audio.id}`,
      type: 'audio',
      title: t('cases:audio_transcribed'),
      description: audio.case_files?.original_filename,
      timestamp: audio.created_at,
      icon: <Mic className="h-4 w-4" />,
    });
  });

  // Sort by timestamp descending
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  // Apply filters
  const filteredEvents = events.filter(event => {
    // Filter by type
    if (!filterTypes.has(event.type)) {
      return false;
    }
    
    // Filter by date range
    const eventDate = new Date(event.timestamp);
    if (dateFrom && eventDate < dateFrom) {
      return false;
    }
    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      if (eventDate > endOfDay) {
        return false;
      }
    }
    
    return true;
  });
  
  const handleTypeToggle = (type: string) => {
    const newTypes = new Set(filterTypes);
    if (newTypes.has(type)) {
      newTypes.delete(type);
    } else {
      newTypes.add(type);
    }
    setFilterTypes(newTypes);
  };
  
  const resetFilters = () => {
    setFilterTypes(new Set(['file', 'analysis', 'note', 'created', 'ocr', 'audio']));
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  if (filteredEvents.length === 0) {
    return (
      <div>
        {/* Filter UI */}
        <div className="mb-4 space-y-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="w-full"
          >
            <Filter className="mr-2 h-4 w-4" />
            {t('cases:filter_timeline')}
          </Button>
          
          {showFilters && (
            <div className="rounded-lg border p-4 space-y-4">
              {/* Event type filters */}
              <div>
                <h4 className="mb-3 text-sm font-medium">{t('cases:filter_by_type')}</h4>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="filter-analysis"
                      checked={filterTypes.has('analysis')}
                      onCheckedChange={() => handleTypeToggle('analysis')}
                    />
                    <Label htmlFor="filter-analysis" className="text-sm cursor-pointer">
                      {t('cases:filter_ai_analysis')}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="filter-ocr"
                      checked={filterTypes.has('ocr')}
                      onCheckedChange={() => handleTypeToggle('ocr')}
                    />
                    <Label htmlFor="filter-ocr" className="text-sm cursor-pointer">
                      {t('cases:filter_ocr')}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="filter-audio"
                      checked={filterTypes.has('audio')}
                      onCheckedChange={() => handleTypeToggle('audio')}
                    />
                    <Label htmlFor="filter-audio" className="text-sm cursor-pointer">
                      {t('cases:filter_audio')}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="filter-file"
                      checked={filterTypes.has('file')}
                      onCheckedChange={() => handleTypeToggle('file')}
                    />
                    <Label htmlFor="filter-file" className="text-sm cursor-pointer">
                      {t('cases:filter_files')}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="filter-note"
                      checked={filterTypes.has('note')}
                      onCheckedChange={() => handleTypeToggle('note')}
                    />
                    <Label htmlFor="filter-note" className="text-sm cursor-pointer">
                      {t('cases:filter_notes')}
                    </Label>
                  </div>
                </div>
              </div>
              
              {/* Date range filters */}
              <div>
                <h4 className="mb-3 text-sm font-medium">{t('cases:filter_by_date')}</h4>
                <div className="grid grid-cols-2 gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                        {dateFrom ? format(dateFrom, 'dd.MM.yyyy') : t('cases:date_from')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dateFrom}
                        onSelect={setDateFrom}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                        {dateTo ? format(dateTo, 'dd.MM.yyyy') : t('cases:date_to')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dateTo}
                        onSelect={setDateTo}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={resetFilters}
                className="w-full"
              >
                {t('cases:reset_filters')}
              </Button>
            </div>
          )}
        </div>
        
        <div className="py-8 text-center text-sm text-muted-foreground">
          {t('cases:no_timeline_events')}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Filter UI */}
      <div className="mb-4 space-y-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="w-full"
        >
          <Filter className="mr-2 h-4 w-4" />
          {t('cases:filter_timeline')}
        </Button>
        
        {showFilters && (
          <div className="rounded-lg border p-4 space-y-4">
            {/* Event type filters */}
            <div>
              <h4 className="mb-3 text-sm font-medium">{t('cases:filter_by_type')}</h4>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="filter-analysis"
                    checked={filterTypes.has('analysis')}
                    onCheckedChange={() => handleTypeToggle('analysis')}
                  />
                  <Label htmlFor="filter-analysis" className="text-sm cursor-pointer">
                    {t('cases:filter_ai_analysis')}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="filter-ocr"
                    checked={filterTypes.has('ocr')}
                    onCheckedChange={() => handleTypeToggle('ocr')}
                  />
                  <Label htmlFor="filter-ocr" className="text-sm cursor-pointer">
                    {t('cases:filter_ocr')}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="filter-audio"
                    checked={filterTypes.has('audio')}
                    onCheckedChange={() => handleTypeToggle('audio')}
                  />
                  <Label htmlFor="filter-audio" className="text-sm cursor-pointer">
                    {t('cases:filter_audio')}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="filter-file"
                    checked={filterTypes.has('file')}
                    onCheckedChange={() => handleTypeToggle('file')}
                  />
                  <Label htmlFor="filter-file" className="text-sm cursor-pointer">
                    {t('cases:filter_files')}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="filter-note"
                    checked={filterTypes.has('note')}
                    onCheckedChange={() => handleTypeToggle('note')}
                  />
                  <Label htmlFor="filter-note" className="text-sm cursor-pointer">
                    {t('cases:filter_notes')}
                  </Label>
                </div>
              </div>
            </div>
            
            {/* Date range filters */}
            <div>
              <h4 className="mb-3 text-sm font-medium">{t('cases:filter_by_date')}</h4>
              <div className="grid grid-cols-2 gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                      {dateFrom ? format(dateFrom, 'dd.MM.yyyy') : t('cases:date_from')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dateFrom}
                      onSelect={setDateFrom}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                      {dateTo ? format(dateTo, 'dd.MM.yyyy') : t('cases:date_to')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dateTo}
                      onSelect={setDateTo}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={resetFilters}
              className="w-full"
            >
              {t('cases:reset_filters')}
            </Button>
          </div>
        )}
      </div>
      
      <ScrollArea className="h-[400px] pr-4">
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 h-full w-px bg-border" />
          
          <div className="space-y-6">
            {filteredEvents.map((event, index) => (
              <div key={event.id} className="relative flex gap-4 pl-10">
                {/* Icon */}
                <div className="absolute left-0 flex h-8 w-8 items-center justify-center rounded-full border bg-background">
                  {event.icon}
                </div>
                
                {/* Content */}
                <div className="flex-1 pt-1">
                  <p className="text-sm font-medium">{event.title}</p>
                  {event.description && (
                    <p className="text-sm text-muted-foreground">{event.description}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {format(new Date(event.timestamp), 'dd.MM.yyyy HH:mm')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}