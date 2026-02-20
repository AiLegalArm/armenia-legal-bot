import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const CONFIDENCE_THRESHOLD = 0.50;
const MAX_FILE_SIZE_MB = 25; // Whisper API limit is 25MB
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_RETRIES = 4;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

function buildFormData(
  audioBuffer: ArrayBuffer,
  mimeType: string,
  fileName: string,
  ext: string
): FormData {
  const form = new FormData();
  const blob = new Blob([audioBuffer], { type: mimeType });
  form.append("file", blob, fileName || `audio.${ext}`);
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("prompt", "Armenian, Russian, legal terminology, court hearing");
  return form;
}

async function callWhisperWithRetry(
  apiKey: string,
  audioBuffer: ArrayBuffer,
  mimeType: string,
  fileName: string,
  ext: string
): Promise<Record<string, unknown>> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Rebuild FormData each attempt (consumed after fetch)
    const formData = buildFormData(audioBuffer, mimeType, fileName, ext);

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (response.ok) {
      return await response.json() as Record<string, unknown>;
    }

    const errText = await response.text();
    console.error(
      `Whisper API attempt ${attempt + 1}/${MAX_RETRIES + 1} failed (${response.status}): ${errText.substring(0, 200)}`
    );

    if (response.status === 429) {
      if (attempt < MAX_RETRIES) {
        const retryAfter = response.headers.get("retry-after");
        const waitMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.pow(2, attempt) * 2000 + Math.random() * 1000;
        console.log(`Rate limited. Waiting ${Math.round(waitMs / 1000)}s before retry...`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      // Exhausted retries on rate limit
      const err = new Error("OpenAI rate limit exceeded after retries. Please wait a moment and try again.");
      (err as { status?: number }).status = 429;
      throw err;
    }

    lastError = new Error(`Whisper API error ${response.status}: ${errText.substring(0, 300)}`);
    throw lastError;
  }

  throw lastError ?? new Error("Whisper API failed after all retries");
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

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log(`Processing audio transcription for: ${fileName}`);

    // Check file size
    const headResponse = await fetch(audioUrl, { method: "HEAD" });
    const contentLength = headResponse.headers.get("content-length");
    const fileSize = contentLength ? parseInt(contentLength, 10) : 0;
    console.log(`File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

    if (fileSize > MAX_FILE_SIZE_BYTES) {
      return new Response(JSON.stringify({
        error: `File size (${(fileSize / 1024 / 1024).toFixed(1)} MB) exceeds Whisper API limit (${MAX_FILE_SIZE_MB} MB). Please compress the audio or extract just the audio track.`,
        error_code: "file_too_large",
        error_ru: `Размер файла превышает лимит Whisper API ${MAX_FILE_SIZE_MB} MB. Сожмите аудио или извлеките только аудиодорожку.`
      }), { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Download the audio
    console.log("Downloading audio file...");
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) throw new Error(`Failed to fetch audio: ${audioResponse.status}`);

    const audioBuffer = await audioResponse.arrayBuffer();
    console.log(`Downloaded ${(audioBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

    const ext = fileName?.split(".").pop()?.toLowerCase() || "mp3";
    const mimeType = getMimeType(fileName);

    // Call Whisper with retry logic
    console.log("Sending to OpenAI Whisper API...");
    let whisperResult: Record<string, unknown>;
    try {
      whisperResult = await callWhisperWithRetry(apiKey, audioBuffer, mimeType, fileName, ext);
    } catch (transcErr) {
      const errStatus = (transcErr as { status?: number })?.status;
      if (errStatus === 429) {
        return new Response(JSON.stringify({
          error: "OpenAI rate limit exceeded. Please wait a moment and try again.",
          error_code: "rate_limit"
        }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw transcErr;
    }

    console.log("Whisper response received, language:", whisperResult.language);

    const transcription = (whisperResult.text as string) || "";
    const language_detected = (whisperResult.language as string) || "unknown";
    const duration_seconds = (whisperResult.duration as number) || 0;
    const word_count = transcription.split(/\s+/).filter(Boolean).length;

    // Estimate confidence from segment avg_logprob
    let confidence_score = 0.8;
    const segments = whisperResult.segments as Array<{ avg_logprob?: number }> | undefined;
    if (segments && segments.length > 0) {
      const avgLogprob = segments.reduce(
        (sum, seg) => sum + (seg.avg_logprob ?? -0.5), 0
      ) / segments.length;
      confidence_score = Math.min(1, Math.max(0, Math.exp(avgLogprob)));
    }

    const confidence_reason = confidence_score >= 0.8
      ? "High confidence transcription"
      : confidence_score >= 0.5
      ? "Medium confidence — review recommended"
      : "Low confidence — manual review required";

    const needsReview = confidence_score < CONFIDENCE_THRESHOLD;

    const { data: transcriptionRecord, error: insertError } = await supabase
      .from("audio_transcriptions")
      .insert({
        file_id: fileId,
        transcription_text: transcription,
        confidence: confidence_score,
        language: language_detected,
        duration_seconds: Math.round(duration_seconds),
        needs_review: needsReview,
        reviewed_by: null,
        speaker_labels: null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to save transcription:", insertError);
    }

    try {
      await supabase.rpc("log_api_usage", {
        _service_type: "audio",
        _model_name: "openai/whisper-1",
        _tokens_used: 0,
        _estimated_cost: 0,
        _metadata: { fileName, fileId: fileId || null, duration_seconds: Math.round(duration_seconds), fileSizeMB: (fileSize / 1024 / 1024).toFixed(2) }
      });
    } catch (_) { /* non-critical */ }

    return new Response(JSON.stringify({
      success: true,
      transcription_id: transcriptionRecord?.id,
      transcription,
      language_detected,
      speakers_count: 1,
      confidence_score,
      confidence_reason,
      duration_seconds,
      warnings: [],
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
