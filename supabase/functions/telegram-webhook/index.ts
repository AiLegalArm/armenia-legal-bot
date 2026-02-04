import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    from?: { id: number; first_name?: string; username?: string };
    text?: string;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!TELEGRAM_BOT_TOKEN) {
      throw new Error("TELEGRAM_BOT_TOKEN is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const update: TelegramUpdate = await req.json();
    const message = update.message;

    if (!message?.text) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();

    // Handle /start command
    if (text === "/start") {
      const welcomeMessage = `🔔 <b>Legal Assistant Bot</b>

Добро пожаловать! Этот бот отправляет уведомления о судебных заседаниях и важных событиях.

<b>Ваш Chat ID:</b> <code>${chatId}</code>

Скопируйте этот ID и вставьте его в настройках профиля в приложении, чтобы получать уведомления.

<b>Команды:</b>
/start - Показать Chat ID
/status - Проверить статус уведомлений`;

      await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId, welcomeMessage);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle /status command
    if (text === "/status") {
      // Find user by telegram_chat_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, email, notification_preferences")
        .eq("telegram_chat_id", chatId.toString())
        .single();

      let statusMessage: string;
      if (profile) {
        const prefs = profile.notification_preferences as { telegram?: boolean } | null;
        const isEnabled = prefs?.telegram !== false;
        statusMessage = `✅ <b>Аккаунт подключен</b>

👤 ${profile.full_name || profile.email}
🔔 Уведомления: ${isEnabled ? "включены" : "выключены"}`;
      } else {
        statusMessage = `❌ <b>Аккаунт не подключен</b>

Ваш Chat ID: <code>${chatId}</code>

Добавьте этот ID в настройках профиля в приложении.`;
      }

      await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId, statusMessage);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle /link command with email
    if (text.startsWith("/link ")) {
      const email = text.slice(6).trim().toLowerCase();
      
      if (!email.includes("@")) {
        await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId, "❌ Неверный формат email. Используйте: /link your@email.com");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find and update profile
      const { data: profile, error: updateError } = await supabase
        .from("profiles")
        .update({ telegram_chat_id: chatId.toString() })
        .eq("email", email)
        .select("id, full_name")
        .single();

      if (updateError || !profile) {
        await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId, `❌ Пользователь с email ${email} не найден в системе.`);
      } else {
        await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId, `✅ Аккаунт успешно привязан!\n\nТеперь вы будете получать уведомления о судебных заседаниях и дедлайнах.`);
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Unknown command
    await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId, 
      "Используйте /start для получения Chat ID или /link email@example.com для привязки аккаунта."
    );

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("telegram-webhook error:", error);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function sendTelegramMessage(token: string, chatId: number, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  });
}
