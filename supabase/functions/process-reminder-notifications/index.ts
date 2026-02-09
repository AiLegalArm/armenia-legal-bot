import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Language-specific templates
const templates = {
  hy: {
    courtHearing: "\u2696\ufe0f <b>\u0534\u0561\u057f\u0561\u056f\u0561\u0576 \u0576\u056b\u057d\u057f</b>\n\n\ud83d\udccb {title}\n\ud83d\udcc5 {datetime}\n\u23f0 {timeLeft}\n\n{description}",
    deadline: "\u23f0 <b>\u0544\u0578\u057f\u0565\u0576\u0578\u0582\u0574 \u0567 \u057e\u0565\u0580\u057b\u0576\u0561\u056a\u0561\u0574\u056f\u0565\u057f\u0568</b>\n\n\ud83d\udccb {title}\n\ud83d\udcc5 {datetime}\n\u23f0 {timeLeft}\n\n{description}",
    task: "\u2705 <b>\u0531\u057c\u0561\u057b\u0561\u0564\u0580\u0561\u0576\u0584\u056b \u0570\u056b\u0577\u0565\u0581\u0578\u0582\u0574</b>\n\n\ud83d\udccb {title}\n\ud83d\udcc5 {datetime}\n\u23f0 {timeLeft}\n\n{description}",
    meeting: "\ud83d\udcc5 <b>\u0540\u0561\u0576\u0564\u056b\u057a\u0578\u0582\u0574</b>\n\n\ud83d\udccb {title}\n\ud83d\udcc5 {datetime}\n\u23f0 {timeLeft}\n\n{description}",
    other: "\ud83d\udd14 <b>\u0540\u056b\u0577\u0565\u0581\u0578\u0582\u0574</b>\n\n\ud83d\udccb {title}\n\ud83d\udcc5 {datetime}\n\u23f0 {timeLeft}\n\n{description}",
  },
  ru: {
    courtHearing: "⚖️ <b>Судебное заседание</b>\n\n📋 {title}\n📅 {datetime}\n⏰ {timeLeft}\n\n{description}",
    deadline: "⏰ <b>Приближается дедлайн</b>\n\n📋 {title}\n📅 {datetime}\n⏰ {timeLeft}\n\n{description}",
    task: "✅ <b>Напоминание о задаче</b>\n\n📋 {title}\n📅 {datetime}\n⏰ {timeLeft}\n\n{description}",
    meeting: "📅 <b>Встреча</b>\n\n📋 {title}\n📅 {datetime}\n⏰ {timeLeft}\n\n{description}",
    other: "🔔 <b>Напоминание</b>\n\n📋 {title}\n📅 {datetime}\n⏰ {timeLeft}\n\n{description}",
  },
  en: {
    courtHearing: "⚖️ <b>Court Hearing</b>\n\n📋 {title}\n📅 {datetime}\n⏰ {timeLeft}\n\n{description}",
    deadline: "⏰ <b>Deadline Approaching</b>\n\n📋 {title}\n📅 {datetime}\n⏰ {timeLeft}\n\n{description}",
    task: "✅ <b>Task Reminder</b>\n\n📋 {title}\n📅 {datetime}\n⏰ {timeLeft}\n\n{description}",
    meeting: "📅 <b>Meeting</b>\n\n📋 {title}\n📅 {datetime}\n⏰ {timeLeft}\n\n{description}",
    other: "🔔 <b>Reminder</b>\n\n📋 {title}\n📅 {datetime}\n⏰ {timeLeft}\n\n{description}",
  },
};

const typeToKey: Record<string, keyof typeof templates.en> = {
  court_hearing: "courtHearing",
  deadline: "deadline",
  task: "task",
  meeting: "meeting",
  other: "other",
};

function formatTimeLeft(minutes: number, lang: string): string {
  if (minutes < 60) {
    const labels = { hy: "\u0580\u0578\u057a\u0565", ru: "минут", en: "minutes" };
    return `${minutes} ${labels[lang as keyof typeof labels] || labels.en}`;
  }
  const hours = Math.floor(minutes / 60);
  const labels = { hy: "\u056a\u0561\u0574", ru: "часов", en: "hours" };
  return `${hours} ${labels[lang as keyof typeof labels] || labels.en}`;
}

function formatDateTime(isoDate: string, lang: string): string {
  const date = new Date(isoDate);
  const options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  const locale = lang === "hy" ? "hy-AM" : lang === "ru" ? "ru-RU" : "en-US";
  return date.toLocaleDateString(locale, options);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const checkWindows = [5, 15, 30, 60, 120, 1440]; // minutes before event

    let totalSent = 0;
    let totalErrors = 0;

    for (const minutesBefore of checkWindows) {
      const windowStart = new Date(now.getTime() + (minutesBefore - 1) * 60000);
      const windowEnd = new Date(now.getTime() + (minutesBefore + 1) * 60000);

      // Find reminders where event_datetime is within window AND notify_before includes this value
      const { data: reminders, error: remindersError } = await supabase
        .from("reminders")
        .select(`
          id,
          title,
          description,
          event_datetime,
          reminder_type,
          notify_before,
          user_id,
          case_id,
          profiles!reminders_user_id_fkey (
            telegram_chat_id,
            notification_preferences
          )
        `)
        .eq("status", "active")
        .gte("event_datetime", windowStart.toISOString())
        .lte("event_datetime", windowEnd.toISOString())
        .contains("notify_before", [minutesBefore]);

      if (remindersError) {
        console.error("Error fetching reminders:", remindersError);
        continue;
      }

      if (!reminders || reminders.length === 0) continue;

      console.log(`Found ${reminders.length} reminders for ${minutesBefore}min window`);

      for (const reminder of reminders) {
        const profile = reminder.profiles as any;
        if (!profile?.telegram_chat_id) continue;

        const prefs = profile.notification_preferences as { telegram?: boolean } | null;
        if (prefs && prefs.telegram === false) continue;

        // Default to Russian for this legal app
        const lang = "ru";
        const templateKey = typeToKey[reminder.reminder_type] || "other";
        const template = templates[lang][templateKey];

        const message = template
          .replace("{title}", reminder.title)
          .replace("{datetime}", formatDateTime(reminder.event_datetime, lang))
          .replace("{timeLeft}", formatTimeLeft(minutesBefore, lang))
          .replace("{description}", reminder.description || "");

        // Send notification
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/send-telegram-notification`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              chatId: profile.telegram_chat_id,
              message,
              parseMode: "HTML",
            }),
          });

          if (response.ok) {
            totalSent++;
            
            // Create in-app notification too
            await supabase.from("notifications").insert({
              user_id: reminder.user_id,
              reminder_id: reminder.id,
              title: reminder.title,
              message: `${formatTimeLeft(minutesBefore, lang)} до события`,
              notification_type: "reminder",
            });
          } else {
            totalErrors++;
            const errData = await response.json();
            console.error(`Failed to send notification for reminder ${reminder.id}:`, errData);
          }
        } catch (sendError) {
          totalErrors++;
          console.error(`Error sending notification for reminder ${reminder.id}:`, sendError);
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      sent: totalSent,
      errors: totalErrors,
      processed_at: now.toISOString()
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("process-reminder-notifications error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
