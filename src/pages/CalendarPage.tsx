import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Calendar, dateFnsLocalizer, Event as BigCalendarEvent, View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { hy, enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useAuth } from '@/hooks/useAuth';
import { useCourtCases } from '@/hooks/useCourtCases';
import { CaseForm } from '@/components/cases/CaseForm';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';
import { Loader2, LogOut, Scale, Plus, Calendar as CalendarIcon, ArrowLeft } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { useCases } from '@/hooks/useCases';

type Case = Database['public']['Tables']['cases']['Row'];
type CaseStatus = Database['public']['Enums']['case_status'];

interface CalendarEvent extends BigCalendarEvent {
  id: string;
  caseData: Case;
}

const CalendarPage = () => {
  const { t, i18n } = useTranslation(['calendar', 'cases', 'common']);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { cases, isLoading } = useCourtCases();
  const { createCase } = useCases();
  
  const [formOpen, setFormOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [currentView, setCurrentView] = useState<View>('month');

  // Setup localizer with appropriate locale
  const locale = i18n.language === 'hy' ? hy : enUS;
  const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: () => startOfWeek(new Date(), { locale }),
    getDay,
    locales: {
      'hy': hy,
      'en': enUS,
    },
  });

  // Custom messages for calendar in Armenian
  const messages = useMemo(() => ({
    allDay: t('all_day'),
    previous: t('previous'),
    next: t('next'),
    today: t('today'),
    month: t('month'),
    week: t('week'),
    day: t('day'),
    agenda: t('agenda'),
    date: t('date'),
    time: t('time'),
    event: t('event'),
    noEventsInRange: t('no_events'),
    showMore: (total: number) => `+${total} ${t('show_more')}`,
  }), [t]);

  // Convert cases to calendar events
  const events: CalendarEvent[] = useMemo(() => {
    return cases
      .filter(c => c.court_date)
      .map(c => ({
        id: c.id,
        title: c.title || c.case_number || '',
        start: new Date(c.court_date!),
        end: new Date(c.court_date!),
        caseData: c,
      }));
  }, [cases]);

  // Get color based on case status
  const getEventStyle = useCallback((event: CalendarEvent) => {
    const statusColors: Record<CaseStatus, string> = {
      open: '#3b82f6', // blue
      in_progress: '#f59e0b', // amber
      pending: '#8b5cf6', // purple
      closed: '#10b981', // green
      archived: '#6b7280', // gray
    };

    const backgroundColor = statusColors[event.caseData.status] || '#3b82f6';
    
    return {
      style: {
        backgroundColor,
        borderRadius: '4px',
        opacity: 0.9,
        color: 'white',
        border: 'none',
        display: 'block',
      },
    };
  }, []);

  // Handle event click - navigate to case detail
  const handleSelectEvent = useCallback((event: CalendarEvent) => {
    navigate(`/cases/${event.id}`);
  }, [navigate]);

  // Handle slot selection - open form with selected date
  const handleSelectSlot = useCallback((slotInfo: { start: Date; end: Date }) => {
    setSelectedDate(slotInfo.start);
    setFormOpen(true);
  }, []);

  // Handle case creation
  const handleCreateCase = (data: Database['public']['Tables']['cases']['Insert']) => {
    createCase.mutate(data, {
      onSuccess: () => setFormOpen(false),
    });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="container mx-auto flex h-14 sm:h-16 items-center justify-between px-3 sm:px-4">
          <div className="flex items-center gap-2 sm:gap-4">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => navigate('/dashboard')}
              aria-label={t('common:back')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              <h1 className="text-lg sm:text-xl font-bold hidden sm:block">{t('common:app_name')}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden sm:inline text-sm text-muted-foreground truncate max-w-[120px]">
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
        <div className="mb-4 sm:mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold">{t('court_sessions')}</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {t('calendar:calendar')}
            </p>
          </div>
          <Button onClick={() => setFormOpen(true)} size="sm" className="sm:h-9">
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('add_session')}</span>
          </Button>
        </div>

        {/* Calendar */}
        <div className="rounded-lg border bg-card p-4">
          <div className="calendar-wrapper" style={{ height: 'calc(100vh - 280px)', minHeight: '500px' }}>
            <Calendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              culture={i18n.language}
              messages={messages}
              onSelectEvent={handleSelectEvent}
              onSelectSlot={handleSelectSlot}
              selectable
              view={currentView}
              onView={setCurrentView}
              eventPropGetter={getEventStyle}
              popup
              className="h-full"
            />
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-4 rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded" style={{ backgroundColor: '#3b82f6' }} />
            <span className="text-sm">{t('cases:status_open')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded" style={{ backgroundColor: '#f59e0b' }} />
            <span className="text-sm">{t('cases:status_in_progress')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded" style={{ backgroundColor: '#8b5cf6' }} />
            <span className="text-sm">{t('cases:status_pending')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded" style={{ backgroundColor: '#10b981' }} />
            <span className="text-sm">{t('cases:status_closed')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded" style={{ backgroundColor: '#6b7280' }} />
            <span className="text-sm">{t('cases:status_archived')}</span>
          </div>
        </div>
      </main>

      {/* Case Form Dialog */}
      <CaseForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleCreateCase}
        initialData={selectedDate ? {
          id: '',
          case_number: '',
          title: '',
          status: 'open',
          priority: 'medium',
          court_date: format(selectedDate, 'yyyy-MM-dd'),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          description: null,
          court_name: null,
          notes: null,
          lawyer_id: null,
          client_id: null,
          case_type: 'civil',
          current_stage: 'preliminary',
          court: null,
          facts: null,
          legal_question: null,
        } as Case : null}
        isLoading={createCase.isPending}
      />

      {/* Custom Calendar Styles */}
      <style>{`
        .calendar-wrapper .rbc-calendar {
          font-family: inherit;
        }
        
        .calendar-wrapper .rbc-header {
          padding: 0.5rem;
          font-weight: 600;
          border-bottom: 2px solid hsl(var(--border));
        }
        
        .calendar-wrapper .rbc-today {
          background-color: hsl(var(--accent));
        }
        
        .calendar-wrapper .rbc-off-range-bg {
          background-color: hsl(var(--muted) / 0.5);
        }
        
        .calendar-wrapper .rbc-event {
          padding: 2px 5px;
          font-size: 0.875rem;
        }
        
        .calendar-wrapper .rbc-event:hover {
          opacity: 1 !important;
          cursor: pointer;
        }
        
        .calendar-wrapper .rbc-toolbar {
          padding: 0.5rem 0 1rem;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        
        .calendar-wrapper .rbc-toolbar button {
          color: hsl(var(--foreground));
          border: 1px solid hsl(var(--border));
          background-color: hsl(var(--background));
          padding: 0.5rem 1rem;
          border-radius: 0.375rem;
          font-size: 0.875rem;
        }
        
        .calendar-wrapper .rbc-toolbar button:hover {
          background-color: hsl(var(--accent));
        }
        
        .calendar-wrapper .rbc-toolbar button.rbc-active {
          background-color: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
          border-color: hsl(var(--primary));
        }
        
        .calendar-wrapper .rbc-month-view,
        .calendar-wrapper .rbc-time-view,
        .calendar-wrapper .rbc-agenda-view {
          border: 1px solid hsl(var(--border));
          border-radius: 0.5rem;
        }
        
        @media (max-width: 640px) {
          .calendar-wrapper {
            height: calc(100vh - 320px) !important;
            min-height: 400px !important;
          }
          
          .calendar-wrapper .rbc-toolbar {
            font-size: 0.75rem;
          }
          
          .calendar-wrapper .rbc-toolbar button {
            padding: 0.375rem 0.75rem;
            font-size: 0.75rem;
          }
          
          .calendar-wrapper .rbc-header {
            padding: 0.25rem;
            font-size: 0.75rem;
          }
          
          .calendar-wrapper .rbc-event {
            font-size: 0.75rem;
            padding: 1px 3px;
          }
        }
      `}</style>
    </div>
  );
};

export default CalendarPage;
