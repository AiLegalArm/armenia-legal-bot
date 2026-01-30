import { useEffect, useRef } from 'react';
import { useReminders } from '@/hooks/useReminders';
import { useNotifications } from '@/hooks/useNotifications';

// Check for due reminders every minute
const CHECK_INTERVAL = 60 * 1000;

export function useReminderNotificationChecker() {
  const { reminders } = useReminders();
  const { createNotification, notifications } = useNotifications();
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      
      reminders
        .filter((r) => r.status === 'active')
        .forEach((reminder) => {
          const eventTime = new Date(reminder.event_datetime);
          
          reminder.notify_before.forEach((minutesBefore) => {
            const notifyTime = new Date(eventTime.getTime() - minutesBefore * 60 * 1000);
            const notifyKey = `${reminder.id}-${minutesBefore}`;
            
            // Check if we should notify
            // Notify if current time is past notify time but before event time
            // and we haven't notified for this specific reminder/time combination
            if (
              now >= notifyTime &&
              now < eventTime &&
              !notifiedRef.current.has(notifyKey) &&
              !notifications.some(n => n.reminder_id === reminder.id && n.message?.includes(String(minutesBefore)))
            ) {
              notifiedRef.current.add(notifyKey);
              
              const timeLabel = getTimeLabel(minutesBefore);
              createNotification(
                reminder.title,
                `${timeLabel} until ${reminder.title}`,
                reminder.id
              );
            }
          });
        });
    };

    // Initial check
    checkReminders();

    // Set up interval
    const interval = setInterval(checkReminders, CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [reminders, createNotification, notifications]);
}

function getTimeLabel(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} minutes`;
  } else if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  } else if (minutes < 10080) {
    const days = Math.floor(minutes / 1440);
    return `${days} day${days > 1 ? 's' : ''}`;
  } else {
    const weeks = Math.floor(minutes / 10080);
    return `${weeks} week${weeks > 1 ? 's' : ''}`;
  }
}
