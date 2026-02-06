import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONFIDENCE_THRESHOLD = 0.50;
// Lovable AI Gateway supports large inline files - setting limit to 100MB
// Beyond this, video compression is recommended
const MAX_FILE_SIZE_MB = 100;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const TRANSCRIPTION_SYSTEM_PROMPT = `You are a professional audio transcription specialist. Your ONLY task is to accurately transcribe EXACTLY what is spoken in the audio/video file.

## CRITICAL RULES:
1. **TRANSCRIBE ONLY WHAT YOU HEAR** - Do NOT invent, assume, or add any content
2. If audio is silent or unintelligible, say so explicitly
3. If you cannot understand a word, mark it as [inaudible] or [unclear]
4. Do NOT add content that was not spoken in the recording
5. Do NOT assume context or fill in gaps with plausible text

## Transcription Guidelines:
1. Transcribe every spoken word accurately, preserving the original language
2. Auto-detect language (Armenian hy-AM, Russian ru-RU, English en-US, or other)
3. Identify different speakers if multiple voices are present (Speaker 1:, Speaker 2:, etc.)
4. Include timestamps for significant segments in format [MM:SS]
5. Preserve terminology exactly as spoken

## Output Format (JSON):
{
  "transcription": "Exact transcription of spoken content...",
  "language_detected": "hy-AM",
  "speakers_count": 1,
  "confidence_score": 0.85,
  "confidence_reason": "Reason for confidence level",
  "duration_seconds": 45,
  "warnings": ["Any issues encountered"],
  "word_count": 120
}

## Confidence Score Guidelines:
- 0.85-1.0: Clear audio, high accuracy
- 0.70-0.84: Good audio with minor issues
- 0.50-0.69: Moderate quality, some sections unclear
- Below 0.50: Poor quality, significant portions unclear

## If Audio Has No Speech:
If the audio file contains no speech (only music, silence, or noise), return:
{
  "transcription": "[No speech detected in this recording]",
  "language_detected": "unknown",
  "speakers_count": 0,
  "confidence_score": 1.0,
  "confidence_reason": "No speech content to transcribe",
  "duration_seconds": X,
  "warnings": ["Audio contains no speech"],
  "word_count": 0
}

CRITICAL: Always respond with valid JSON only. NEVER fabricate content that was not in the audio.`;

// Get MIME type from file extension
function getMimeType(fileName: string): string {
  const ext = fileName?.split('.').pop()?.toLowerCase() || 'mp3';
  const mimeTypes: Record<string, string> = {
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'm4a': 'audio/mp4',
    'ogg': 'audio/ogg',
    'webm': 'audio/webm',
    'flac': 'audio/flac',
    'mp4': 'video/mp4',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'mkv': 'video/x-matroska'
  };
  return mimeTypes[ext] || 'audio/mpeg';
}

// Check if file is video
function isVideoFile(fileName: string): boolean {
  const ext = fileName?.split('.').pop()?.toLowerCase() || '';
  return ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext);
}

// Convert ArrayBuffer to base64 in chunks to avoid memory issues
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const uint8Array = new Uint8Array(buffer);
  const chunkSize = 32768; // 32KB chunks
  let base64 = "";
  
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.slice(i, Math.min(i + chunkSize, uint8Array.length));
    base64 += btoa(String.fromCharCode.apply(null, Array.from(chunk)));
  }
  
  return base64;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audioUrl, fileName, caseId, fileId } = await req.json();

    if (!audioUrl) {
      return new Response(JSON.stringify({ error: "Audio URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    let userId = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    console.log(`Processing audio transcription for: ${fileName}`);

    // Fetch audio with HEAD request first to check size
    const headResponse = await fetch(audioUrl, { method: "HEAD" });
    const contentLength = headResponse.headers.get("content-length");
    const fileSize = contentLength ? parseInt(contentLength, 10) : 0;
    
    console.log(`File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

    if (fileSize > MAX_FILE_SIZE_BYTES) {
      const errorMsg = `File size (${(fileSize / 1024 / 1024).toFixed(1)} MB) exceeds maximum allowed (${MAX_FILE_SIZE_MB} MB). Please compress your video or extract only the audio track.`;
      
      await supabase.rpc("log_error", {
        _error_type: "audio",
        _error_message: errorMsg,
        _error_details: { fileSize, maxSize: MAX_FILE_SIZE_BYTES, fileName },
        _case_id: caseId || null,
        _file_id: fileId || null
      });

      return new Response(JSON.stringify({ 
        error: errorMsg,
        error_code: "file_too_large",
        error_hy: ` Delays\u0576\u056B \u0579\u0561\u0583\u0568 (${(fileSize / 1024 / 1024).toFixed(1)} MB) \u0563\u0565\u0580\u0561\u0566\u0561\u0576\u0581\u0578\u0582\u0574 \u0567 \u0569\u0578\u0582\u0575\u056C\u0561\u057F\u0580\u0565\u056C\u056B \u0561\u057C\u0561\u057E\u0565\u056C\u0561\u0563\u0578\u0582\u0575\u0576\u0568 (${MAX_FILE_SIZE_MB} MB): \u053D\u0576\u0564\u0580\u0578\u0582\u0574 \u0565\u0576\u0584 \u057D\u0565\u0572\u0574\u0565\u056C \u057F\u0565\u057D\u0561\u0576\u0575\u0578\u0582\u0569\u0568 \u056F\u0561\u0574 \u0570\u0561\u0576\u0565\u056C \u0574\u056B\u0561\u0575\u0576 \u0561\u0578\u0582\u0564\u056B\u0578 \u0570\u0565\u057F\u0584\u0568\u0589`,
        error_ru: `\u0420\u0430\u0437\u043C\u0435\u0440 \u0444\u0430\u0439\u043B\u0430 (${(fileSize / 1024 / 1024).toFixed(1)} MB) \u043F\u0440\u0435\u0432\u044B\u0448\u0430\u0435\u0442 \u043B\u0438\u043C\u0438\u0442 (${MAX_FILE_SIZE_MB} MB). \u0421\u0436\u043C\u0438\u0442\u0435 \u0432\u0438\u0434\u0435\u043E \u0438\u043B\u0438 \u0438\u0437\u0432\u043B\u0435\u043A\u0438\u0442\u0435 \u0442\u043E\u043B\u044C\u043A\u043E \u0430\u0443\u0434\u0438\u043E\u0434\u043E\u0440\u043E\u0436\u043A\u0443.`
      }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mimeType = getMimeType(fileName);
    const isVideo = isVideoFile(fileName);
    const ext = fileName?.split('.').pop()?.toLowerCase() || 'mp3';

    // Fetch audio file
    console.log("Downloading audio/video file...");
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
    }
    
    const audioBuffer = await audioResponse.arrayBuffer();
    console.log(`Downloaded ${(audioBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
    
    // Convert to base64
    console.log("Converting to base64...");
    const audioBase64 = arrayBufferToBase64(audioBuffer);
    console.log(`Base64 length: ${(audioBase64.length / 1024 / 1024).toFixed(2)} MB`);

    // Build request - use inline data for all files
    // Lovable AI Gateway handles large inline content well
    const requestBody = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: TRANSCRIPTION_SYSTEM_PROMPT },
        { 
          role: "user", 
          content: [
            { 
              type: "text", 
              text: `Please transcribe this ${isVideo ? 'video' : 'audio'} file. File name: ${fileName}. Focus on accurate Armenian legal terminology if applicable. Extract and transcribe all spoken content.` 
            },
            { 
              type: isVideo ? "input_video" : "input_audio",
              [isVideo ? "input_video" : "input_audio"]: {
                data: audioBase64,
                format: isVideo ? ext : (ext === 'wav' ? 'wav' : 'mp3')
              }
            }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 16000,
    };

    // Call Gemini via Lovable AI Gateway
    console.log("Sending to Lovable AI Gateway for transcription...");
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini transcription error:", response.status, errorText);
      
      await supabase.rpc("log_error", {
        _error_type: "audio",
        _error_message: `Gemini transcription failed: ${response.status}`,
        _error_details: { status: response.status, error: errorText, fileName },
        _case_id: caseId || null,
        _file_id: fileId || null
      });

      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: "Rate limit exceeded. Please try again later.",
          error_code: "rate_limit"
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: "AI credits exhausted. Please top up your Cloud & AI balance to continue using audio transcription.",
          error_code: "payment_required",
          error_hy: "Արdelays\u0565\u057D\u057F\u0561\u056F\u0561\u0576 \u056B\u0576\u057F\u0565\u056C\u0565\u056F\u057F\u056B \u056F\u0580\u0565\u0564\u056B\u057F\u0576\u0565\u0580\u0568 \u057D\u057A\u0561\u057C\u057E\u0565\u056C \u0565\u0576\u0589 \u053D\u0576\u0564\u0580\u0578\u0582\u0574 \u0565\u0576\u0584 \u056C\u056B\u0581\u0584\u0561\u057E\u0578\u0580\u0565\u056C \u0571\u0565\u0580 Cloud & AI \u0570\u0561\u0577\u056B\u057E\u0568\u0589",
          error_ru: "Кредиты AI исчерпаны. Пополните баланс Cloud & AI для продолжения работы."
        }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if it's a payload too large error
      if (response.status === 413 || errorText.includes("payload") || errorText.includes("too large")) {
        return new Response(JSON.stringify({ 
          error: `File is too large for processing. Please compress your ${isVideo ? 'video' : 'audio'} file or extract only the audio track.`,
          error_code: "payload_too_large",
          error_hy: `\u0556\u0561\u0575\u056C\u0568 \u0579\u0561\u0583\u0561\u0566\u0561\u0576\u0581 \u0574\u0565\u056E \u0567 \u0574\u0577\u0561\u056F\u0574\u0561\u0576 \u0570\u0561\u0574\u0561\u0580\u0589 \u053D\u0576\u0564\u0580\u0578\u0582\u0574 \u0565\u0576\u0584 \u057D\u0565\u0572\u0574\u0565\u056C \u0571\u0565\u0580 ${isVideo ? '\u057F\u0565\u057D\u0561\u0576\u0575\u0578\u0582\u0569\u0568' : '\u0561\u0578\u0582\u0564\u056B\u0578\u0576'}\u0589`,
          error_ru: `\u0424\u0430\u0439\u043B \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0439 \u0434\u043B\u044F \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0438. \u0421\u0436\u043C\u0438\u0442\u0435 ${isVideo ? '\u0432\u0438\u0434\u0435\u043E' : '\u0430\u0443\u0434\u0438\u043E'} \u0438\u043B\u0438 \u0438\u0437\u0432\u043B\u0435\u043A\u0438\u0442\u0435 \u0430\u0443\u0434\u0438\u043E\u0434\u043E\u0440\u043E\u0436\u043A\u0443.`
        }), {
          status: 413,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error(`Transcription failed: ${response.status}`);
    }

    const aiResponse = await response.json();
    const rawContent = aiResponse.choices?.[0]?.message?.content || "";
    
    console.log("Raw transcription response:", rawContent.substring(0, 500));

    // Parse JSON response
    let transcriptionResult;
    try {
      let jsonStr = rawContent;
      const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      transcriptionResult = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse transcription JSON:", parseError);
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

    // Save to audio_transcriptions table
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
      await supabase.rpc("log_error", {
        _error_type: "audio",
        _error_message: "Failed to save transcription result",
        _error_details: { error: insertError, fileId },
        _case_id: caseId || null,
        _file_id: fileId || null
      });
    }

    // Log API usage for cost tracking
    const tokensUsed = aiResponse.usage?.total_tokens || 0;
    const estimatedCost = tokensUsed * 0.0000005;
    
    await supabase.rpc("log_api_usage", {
      _service_type: "audio",
      _model_name: "google/gemini-2.5-flash",
      _tokens_used: tokensUsed,
      _estimated_cost: estimatedCost,
      _metadata: { fileName, fileId: fileId || null, duration_seconds, fileSizeMB: (fileSize / 1024 / 1024).toFixed(2) }
    });

    // Return result
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
      tokens_used: tokensUsed
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("audio-transcribe error:", error);

    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Transcription failed",
      error_code: "internal_error"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
