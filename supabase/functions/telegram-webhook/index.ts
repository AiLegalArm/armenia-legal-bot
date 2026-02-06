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
    photo?: Array<{ file_id: string; file_size?: number; width: number; height: number }>;
    document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
    caption?: string;
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

    if (!message) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chatId = message.chat.id;

    // Handle file uploads (photo or document)
    if (message.photo || message.document) {
      await handleFileUpload(
        supabase as any, 
        TELEGRAM_BOT_TOKEN, 
        chatId, 
        message.photo, 
        message.document, 
        message.caption
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = message.text?.trim();

    if (!text) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle /start command
    if (text === "/start") {
      const welcomeMessage = `🔔 <b>Legal Assistant Bot</b>

Добро пожаловать! Этот бот отправляет уведомления о судебных заседаниях и позволяет загружать файлы.

<b>Ваш Chat ID:</b> <code>${chatId}</code>

Для привязки аккаунта:
1. Получите код в настройках профиля приложения
2. Отправьте: /verify XXXXXX

<b>Команды:</b>
/start - Показать Chat ID
/verify XXXXXX - Привязать аккаунт (код из приложения)
/status - Проверить статус
/help - Помощь по загрузке файлов`;

      await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId, welcomeMessage);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle /help command
    if (text === "/help") {
      const helpMessage = `📁 <b>Загрузка файлов</b>

Чтобы загрузить файл в систему:
1. Привяжите аккаунт через /verify XXXXXX (код из приложения)
2. Отправьте фото или документ в этот чат
3. Файл автоматически сохранится в вашей папке

<b>Поддерживаемые форматы:</b>
📷 Фотографии (JPG, PNG)
📄 Документы (PDF, DOCX, и др.)

Максимальный размер: 20 МБ`;

      await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId, helpMessage);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle /status command
    if (text === "/status") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, email, notification_preferences")
        .eq("telegram_chat_id", chatId.toString())
        .single();

      let statusMessage: string;
      if (profile) {
        const prefs = profile.notification_preferences as { telegram?: boolean } | null;
        const isEnabled = prefs?.telegram !== false;
        
        // Count uploaded files
        const { count } = await supabase
          .from("telegram_uploads")
          .select("*", { count: "exact", head: true })
          .eq("user_id", profile.id);
        
        statusMessage = `✅ <b>Аккаунт подключен</b>

👤 ${profile.full_name || profile.email}
🔔 Уведомления: ${isEnabled ? "включены" : "выключены"}
📁 Загружено файлов: ${count || 0}`;
      } else {
        statusMessage = `❌ <b>Аккаунт не подключен</b>

Ваш Chat ID: <code>${chatId}</code>

Для привязки:
1. Получите код в настройках профиля приложения
2. Отправьте: /verify XXXXXX`;
      }

      await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId, statusMessage);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle /verify command with verification code (SECURE method)
    if (text.startsWith("/verify ")) {
      const code = text.slice(8).trim().toUpperCase();
      
      if (!code || code.length !== 6) {
        await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId, 
          "❌ Неверный формат кода. Используйте: /verify XXXXXX (6 символов)");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find valid verification code
      const { data: verificationCode, error: findError } = await supabase
        .from("telegram_verification_codes")
        .select("id, user_id, expires_at")
        .eq("code", code)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .single();

      if (findError || !verificationCode) {
        await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId, 
          `❌ Неверный или просроченный код.

Получите новый код в настройках профиля приложения.`);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mark code as used
      await supabase
        .from("telegram_verification_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("id", verificationCode.id);

      // Link Telegram account to user profile
      const { data: profile, error: updateError } = await supabase
        .from("profiles")
        .update({ telegram_chat_id: chatId.toString() })
        .eq("id", verificationCode.user_id)
        .select("id, full_name, email")
        .single();

      if (updateError || !profile) {
        await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId, 
          "❌ Ошибка при привязке аккаунта. Попробуйте позже.");
      } else {
        await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId, 
          `✅ <b>Аккаунт успешно привязан!</b>

👤 ${profile.full_name || profile.email}

Теперь вы можете:
• Получать уведомления о судебных заседаниях
• Загружать файлы, отправляя их в этот чат

Используйте /help для подробной информации.`);
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle legacy /link command - inform about new secure method
    if (text.startsWith("/link ")) {
      await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId, 
        `⚠️ <b>Метод привязки изменен</b>

Для безопасности теперь используется код подтверждения:
1. Откройте настройки профиля в приложении
2. Нажмите "Получить код"
3. Отправьте сюда: /verify XXXXXX`);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Unknown command
    await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId, 
      "Используйте /start для начала, /help для помощи, или отправьте файл для загрузки."
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

async function handleFileUpload(
  supabase: any,
  botToken: string,
  chatId: number,
  photo: Array<{ file_id: string; file_size?: number; width: number; height: number }> | undefined,
  document: { file_id: string; file_name?: string; mime_type?: string; file_size?: number } | undefined,
  caption: string | undefined
): Promise<void> {
  // Find user by telegram_chat_id
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("telegram_chat_id", chatId.toString())
    .single();

  if (profileError || !profile) {
    await sendTelegramMessage(botToken, chatId, 
      `❌ Аккаунт не привязан.

Для привязки:
1. Получите код в настройках профиля приложения
2. Отправьте: /verify XXXXXX`
    );
    return;
  }

  let fileId: string;
  let originalFilename: string;
  let mimeType: string;
  let fileSize: number | undefined;

  if (photo && photo.length > 0) {
    // Get the largest photo (last in array)
    const largestPhoto = photo[photo.length - 1];
    fileId = largestPhoto.file_id;
    originalFilename = `photo_${Date.now()}.jpg`;
    mimeType = "image/jpeg";
    fileSize = largestPhoto.file_size;
  } else if (document) {
    fileId = document.file_id;
    originalFilename = document.file_name || `document_${Date.now()}`;
    mimeType = document.mime_type || "application/octet-stream";
    fileSize = document.file_size;
  } else {
    return;
  }

  // Check file size (max 20MB)
  if (fileSize && fileSize > 20 * 1024 * 1024) {
    await sendTelegramMessage(botToken, chatId, "❌ Файл слишком большой. Максимальный размер: 20 МБ.");
    return;
  }

  try {
    // Get file path from Telegram
    const fileInfoResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
    );
    const fileInfo = await fileInfoResponse.json();

    if (!fileInfo.ok || !fileInfo.result?.file_path) {
      throw new Error("Failed to get file info from Telegram");
    }

    const telegramFilePath: string = fileInfo.result.file_path;

    // Download file from Telegram
    const fileResponse = await fetch(
      `https://api.telegram.org/file/bot${botToken}/${telegramFilePath}`
    );
    
    if (!fileResponse.ok) {
      throw new Error("Failed to download file from Telegram");
    }

    const fileBuffer = await fileResponse.arrayBuffer();

    // Generate storage path
    const fileExt = originalFilename.split('.').pop() || 'bin';
    const storagePath = `${profile.id}/${crypto.randomUUID()}.${fileExt}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("telegram-uploads")
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    // Save record to database
    const { error: dbError } = await supabase
      .from("telegram_uploads")
      .insert({
        user_id: profile.id,
        telegram_chat_id: chatId.toString(),
        filename: `${crypto.randomUUID()}.${fileExt}`,
        original_filename: originalFilename,
        storage_path: storagePath,
        file_type: mimeType,
        file_size: fileSize,
        caption: caption,
      });

    if (dbError) {
      // Rollback storage upload
      await supabase.storage.from("telegram-uploads").remove([storagePath]);
      throw dbError;
    }

    await sendTelegramMessage(botToken, chatId, 
      `✅ <b>Файл загружен</b>

📄 ${originalFilename}
${caption ? `📝 ${caption}` : ""}

Файл доступен в вашем личном кабинете.`
    );

  } catch (error) {
    console.error("File upload error:", error);
    await sendTelegramMessage(botToken, chatId, 
      "❌ Ошибка при загрузке файла. Попробуйте позже."
    );
  }
}

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