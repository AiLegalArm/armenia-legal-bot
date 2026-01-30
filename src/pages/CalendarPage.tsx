import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Calendar, dateFnsLocalizer, Event as BigCalendarEvent, View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, startOfMonth, endOfMonth } from 'date-fns';
import { hy, enUS, ru } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useAuth } from '@/hooks/useAuth';
import { useCourtCases } from '@/hooks/useCourtCases';
import { useReminders, type Reminder, type CreateReminderInput } from '@/hooks/useReminders';
import { CaseForm } from '@/components/cases/CaseForm';
import { ReminderForm } from '@/components/reminders/ReminderForm';
import { DateRemindersSheet } from '@/components/reminders/DateRemindersSheet';
import { NotificationBell } from '@/components/reminders/NotificationBell';
import { useReminderNotificationChecker } from '@/components/reminders/useReminderNotificationChecker';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';
import { Loader2, LogOut, Scale, Plus, ArrowLeft, Bell, Gavel, Clock, Target, Users, HelpCircle } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { useCases } from '@/hooks/useCases';

type Case = Database['public']['Tables']['cases']['Row'];
type CaseStatus = Database['public']['Enums']['case_status'];
type ReminderType = 'court_hearing' | 'deadline' | 'task' | 'meeting' | 'other';

interface CalendarEvent extends BigCalendarEvent {
  id: string;
  type: 'case' | 'reminder';
  caseData?: Case;
  reminderData?: Reminder;
}

const reminderTypeColors: Record<ReminderType, string> = {
  court_hearing: '#ef4444', // red
  deadline: '#f97316', // orange  
  task: '#3b82f6', // blue
  meeting: '#22c55e', // green
  other: '#6b7280', // gray
};

const CalendarPage = () => {
  const { t, i18n } = useTranslation(['calendar', 'cases', 'common', 'reminders']);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { cases, isLoading: casesLoading } = useCourtCases();
  const { createCase } = useCases();
  const { 
    reminders, 
    isLoading: remindersLoading,
    createReminder,
    updateReminder,
  } = useReminders();
  
  const [caseFormOpen, setCaseFormOpen] = useState(false);
  const [reminderFormOpen, setReminderFormOpen] = useState(false);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [currentView, setCurrentView] = useState<View>('month');
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);

  // Initialize notification checker
  useReminderNotificationChecker();

  const isLoading = casesLoading || remindersLoading;

  // Setup localizer with appropriate locale
  const getLocale = () => {
    switch (i18n.language) {
      case 'hy': return hy;
      case 'ru': return ru;
      default: return enUS;
    }
  };

  const locale = getLocale();
  const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: () => startOfWeek(new Date(), { locale }),
    getDay,
    locales: {
      'hy': hy,
      'en': enUS,
      'ru': ru,
    },
  });

  // Custom messages for calendar
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

  // Convert cases and reminders to calendar events
  const events: CalendarEvent[] = useMemo(() => {
    const caseEvents: CalendarEvent[] = cases
      .filter(c => c.court_date)
      .map(c => ({
        id: c.id,
        type: 'case' as const,
        title: c.title || c.case_number || '',
        start: new Date(c.court_date!),
        end: new Date(c.court_date!),
        caseData: c,
      }));

    const reminderEvents: CalendarEvent[] = reminders
      .filter(r => r.status === 'active')
      .map(r => ({
        id: r.id,
        type: 'reminder' as const,
        title: r.title,
        start: new Date(r.event_datetime),
        end: new Date(r.event_datetime),
        reminderData: r,
      }));

    return [...caseEvents, ...reminderEvents];
  }, [cases, reminders]);

  // Get color based on event type
  const getEventStyle = useCallback((event: CalendarEvent) => {
    if (event.type === 'case' && event.caseData) {
      const statusColors: Record<CaseStatus, string> = {
        open: '#3b82f6',
        in_progress: '#f59e0b',
        pending: '#8b5cf6',
        closed: '#10b981',
        archived: '#6b7280',
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
    }

    if (event.type === 'reminder' && event.reminderData) {
      const backgroundColor = reminderTypeColors[event.reminderData.reminder_type] || '#6b7280';
      
      return {
        style: {
          backgroundColor,
          borderRadius: '4px',
          opacity: 0.85,
          color: 'white',
          border: '2px dashed rgba(255,255,255,0.4)',
          display: 'block',
        },
      };
    }

    return {};
  }, []);

  // Handle event click
  const handleSelectEvent = useCallback((event: CalendarEvent) => {
    if (event.type === 'case') {
      navigate(`/cases/${event.id}`);
    } else if (event.type === 'reminder' && event.reminderData) {
      setEditingReminder(event.reminderData);
      setReminderFormOpen(true);
    }
  }, [navigate]);

  // Handle slot selection - show date reminders sheet
  const handleSelectSlot = useCallback((slotInfo: { start: Date; end: Date }) => {
    setSelectedDate(slotInfo.start);
    setDateSheetOpen(true);
  }, []);

  // Handle case creation
  const handleCreateCase = (data: Database['public']['Tables']['cases']['Insert']) => {
    createCase.mutate(data, {
      onSuccess: () => setCaseFormOpen(false),
    });
  };

  // Handle reminder creation/update
  const handleReminderSubmit = (data: CreateReminderInput) => {
    if (editingReminder) {
      updateReminder.mutate({ id: editingReminder.id, ...data }, {
        onSuccess: () => {
          setReminderFormOpen(false);
          setEditingReminder(null);
        },
      });
    } else {
      createReminder.mutate(data, {
        onSuccess: () => setReminderFormOpen(false),
      });
    }
  };

  const handleAddReminder = () => {
    setEditingReminder(null);
    setSelectedDate(new Date());
    setReminderFormOpen(true);
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
            <NotificationBell />
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
        <div className="mb-4 sm:mb-6 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold">{t('court_sessions')}</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {t('calendar:calendar')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleAddReminder} variant="outline" size="sm" className="sm:h-9">
              <Bell className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('reminders:add_reminder')}</span>
            </Button>
            <Button onClick={() => setCaseFormOpen(true)} size="sm" className="sm:h-9">
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('add_session')}</span>
            </Button>
          </div>
        </div>

        {/* Calendar */}
        <div className="rounded-lg border bg-card p-4">
          <div className="calendar-wrapper" style={{ height: 'calc(100vh - 320px)', minHeight: '500px' }}>
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
        <div className="mt-4 rounded-lg border bg-card p-4">
          <div className="mb-2 text-sm font-medium text-muted-foreground">{t('cases:cases')}</div>
          <div className="flex flex-wrap gap-4 mb-4">
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
          
          <div className="mb-2 text-sm font-medium text-muted-foreground">{t('reminders:reminders')}</div>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded border-2 border-dashed border-red-300" style={{ backgroundColor: '#ef4444' }} />
              <Gavel className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm">{t('reminders:type_court_hearing')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded border-2 border-dashed border-orange-300" style={{ backgroundColor: '#f97316' }} />
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm">{t('reminders:type_deadline')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded border-2 border-dashed border-blue-300" style={{ backgroundColor: '#3b82f6' }} />
              <Target className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm">{t('reminders:type_task')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded border-2 border-dashed border-green-300" style={{ backgroundColor: '#22c55e' }} />
              <Users className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm">{t('reminders:type_meeting')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded border-2 border-dashed border-gray-300" style={{ backgroundColor: '#6b7280' }} />
              <HelpCircle className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm">{t('reminders:type_other')}</span>
            </div>
          </div>
        </div>
      </main>

      {/* Case Form Dialog */}
      <CaseForm
        open={caseFormOpen}
        onOpenChange={setCaseFormOpen}
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

      {/* Reminder Form Dialog */}
      <ReminderForm
        open={reminderFormOpen}
        onOpenChange={(open) => {
          setReminderFormOpen(open);
          if (!open) setEditingReminder(null);
        }}
        onSubmit={handleReminderSubmit}
        initialData={editingReminder}
        initialDate={selectedDate}
        isLoading={createReminder.isPending || updateReminder.isPending}
      />

      {/* Date Reminders Sheet */}
      {selectedDate && (
        <DateRemindersSheet
          open={dateSheetOpen}
          onOpenChange={setDateSheetOpen}
          selectedDate={selectedDate}
        />
      )}

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
            height: calc(100vh - 360px) !important;
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
