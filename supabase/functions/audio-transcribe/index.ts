import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const CONFIDENCE_THRESHOLD = 0.50;
const MAX_FILE_SIZE_MB = 100;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TRANSCRIPTION_SYSTEM_PROMPT = `You are an expert transcription AI specializing in Armenian, Russian, and other languages.
Transcribe the provided audio/video accurately.
Return a JSON object with:
- transcription: the full text transcription
- language_detected: language code (hy, ru, en, etc.)
- speakers_count: number of distinct speakers (integer)
- confidence_score: float 0-1 representing transcription confidence
- confidence_reason: brief explanation of confidence level
- duration_seconds: estimated duration in seconds
- warnings: array of any issues encountered
- word_count: number of words
Focus on Armenian legal terminology accuracy if applicable.`;

function getMimeType(fileName: string): string {
  const ext = fileName?.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4",
    ogg: "audio/ogg", flac: "audio/flac", webm: "audio/webm",
    mp4: "video/mp4", avi: "video/x-msvideo", mov: "video/quicktime",
    mkv: "video/x-matroska",
  };
  return map[ext || ""] || "audio/mpeg";
}

function isVideoFile(fileName: string): boolean {
  const ext = fileName?.split(".").pop()?.toLowerCase();
  return ["mp4", "avi", "mov", "mkv", "webm"].includes(ext || "");
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: authUser }, error: authError } = await sb.auth.getUser();
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { audioUrl, fileName, caseId, fileId } = await req.json();

    if (!audioUrl) {
      return new Response(JSON.stringify({ error: "Audio URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log(`Processing audio transcription for: ${fileName}`);

    const headResponse = await fetch(audioUrl, { method: "HEAD" });
    const contentLength = headResponse.headers.get("content-length");
    const fileSize = contentLength ? parseInt(contentLength, 10) : 0;
    console.log(`File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

    if (fileSize > MAX_FILE_SIZE_BYTES) {
      const errorMsg = `File size (${(fileSize / 1024 / 1024).toFixed(1)} MB) exceeds maximum allowed (${MAX_FILE_SIZE_MB} MB).`;
      return new Response(JSON.stringify({
        error: errorMsg,
        error_code: "file_too_large",
        error_ru: `Размер файла превышает лимит ${MAX_FILE_SIZE_MB} MB. Сожмите видео или извлеките только аудиодорожку.`
      }), { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const isVideo = isVideoFile(fileName);
    const ext = fileName?.split(".").pop()?.toLowerCase() || "mp3";

    console.log("Downloading audio/video file...");
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) throw new Error(`Failed to fetch audio: ${audioResponse.status}`);

    const audioBuffer = await audioResponse.arrayBuffer();
    console.log(`Downloaded ${(audioBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

    const audioBase64 = arrayBufferToBase64(audioBuffer);
    console.log(`Base64 length: ${(audioBase64.length / 1024 / 1024).toFixed(2)} MB`);

    const { callTranscription } = await import("../_shared/openai-router.ts");

    const transcribeMessages = [
      { role: "system" as const, content: TRANSCRIPTION_SYSTEM_PROMPT },
      {
        role: "user" as const,
        content: [
          {
            type: "text",
            text: `Please transcribe this ${isVideo ? "video" : "audio"} file. File name: ${fileName}. Focus on accurate Armenian legal terminology if applicable.`
          },
          {
            type: isVideo ? "input_video" : "input_audio",
            [isVideo ? "input_video" : "input_audio"]: {
              data: audioBase64,
              format: isVideo ? ext : (ext === "wav" ? "wav" : "mp3")
            }
          }
        ]
      }
    ];

    console.log("Sending to OpenAI router for transcription...");
    let rawContent: string;
    try {
      const transcResult = await callTranscription(
        "audio-transcribe",
        transcribeMessages as import("../_shared/openai-router.ts").RouterMessage[]
      );
      rawContent = transcResult.text;
    } catch (transcErr) {
      const errStatus = (transcErr as { status?: number })?.status;
      if (errStatus === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later.", error_code: "rate_limit" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (errStatus === 402) {
        return new Response(JSON.stringify({
          error: "AI credits exhausted. Please top up your Cloud & AI balance.",
          error_code: "payment_required",
          error_ru: "Кредиты AI исчерпаны. Пополните баланс Cloud & AI."
        }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw transcErr;
    }

    console.log("Raw transcription response:", rawContent.substring(0, 500));

    let transcriptionResult;
    try {
      let jsonStr = rawContent;
      const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1].trim();
      transcriptionResult = JSON.parse(jsonStr);
    } catch {
      transcriptionResult = {
        transcription: rawContent,
        language_detected: "unknown",
        speakers_count: 1,
        confidence_score: 0.4,
        confidence_reason: "Failed to parse structured response",
        duration_seconds: 0,
        warnings: ["Response format was unexpected"],
        word_count: rawContent.split(/\s+/).length
      };
    }

    const {
      transcription,
      language_detected,
      speakers_count,
      confidence_score,
      confidence_reason,
      duration_seconds,
      warnings,
      word_count
    } = transcriptionResult;

    const needsReview = confidence_score < CONFIDENCE_THRESHOLD;

    const { data: transcriptionRecord, error: insertError } = await supabase
      .from("audio_transcriptions")
      .insert({
        file_id: fileId,
        transcription_text: transcription,
        confidence: confidence_score,
        language: language_detected || "unknown",
        duration_seconds: duration_seconds || 0,
        needs_review: needsReview,
        reviewed_by: null,
        speaker_labels: speakers_count > 1 ? { count: speakers_count } : null
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to save transcription:", insertError);
    }

    await supabase.rpc("log_api_usage", {
      _service_type: "audio",
      _model_name: "openai/gpt-5-mini",
      _tokens_used: 0,
      _estimated_cost: 0,
      _metadata: { fileName, fileId: fileId || null, duration_seconds, fileSizeMB: (fileSize / 1024 / 1024).toFixed(2) }
    });

    return new Response(JSON.stringify({
      success: true,
      transcription_id: transcriptionRecord?.id,
      transcription,
      language_detected,
      speakers_count,
      confidence_score,
      confidence_reason,
      duration_seconds,
      warnings: warnings || [],
      word_count,
      needs_review: needsReview,
      tokens_used: 0
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("audio-transcribe error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Transcription failed",
      error_code: "internal_error"
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
