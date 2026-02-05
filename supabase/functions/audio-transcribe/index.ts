import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONFIDENCE_THRESHOLD = 0.50;

const TRANSCRIPTION_SYSTEM_PROMPT = `You are a professional audio transcription specialist for Armenian legal proceedings. Your task is to accurately transcribe audio recordings in Armenian (hy-AM), Russian (ru-RU), or English (en-US).

## Transcription Guidelines:
1. Transcribe every spoken word accurately, preserving the original language
2. Identify different speakers if multiple voices are present (Speaker 1:, Speaker 2:, etc.)
3. Include timestamps for significant segments in format [MM:SS]
4. Preserve legal terminology exactly as spoken
5. Note any unclear or inaudible sections with [inaudible] or [unclear]

## Output Format (JSON):
{
  "transcription": "Full transcription text...",
  "language_detected": "hy-AM",
  "speakers_count": 1,
  "confidence_score": 0.85,
  "confidence_reason": "Clear audio quality, minimal background noise",
  "duration_seconds": 45,
  "warnings": ["Background noise at 0:30-0:45"],
  "word_count": 120
}

## Confidence Score Guidelines:
- 0.85-1.0: Clear audio, high accuracy, professional recording quality
- 0.70-0.84: Good audio with minor issues, reliable transcription
- 0.50-0.69: Moderate quality, some sections may need review
- Below 0.50: Poor quality, significant manual review required

## Special Handling:
- **Legal terms**: Preserve exact terminology for court proceedings, laws, articles
- **Names and places**: Transcribe proper nouns carefully with correct spelling
- **Numbers and dates**: Format consistently (e.g., Article 15, January 5, 2024)
- **Quotations**: Mark direct quotes clearly with quotation marks

CRITICAL: Always respond with valid JSON only.`;

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

    // Fetch audio and convert to base64 for Gemini
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
    }
    
    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBase64 = btoa(
      new Uint8Array(audioBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    
    // Determine MIME type from file extension
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
    const mimeType = mimeTypes[ext] || 'audio/mpeg';
 
     // Determine if this is a video file
     const isVideo = ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext) && mimeType.startsWith('video');

    // Call Gemini for audio transcription via Lovable AI Gateway
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
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
        max_tokens: 8000,
      }),
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
          error_hy: "\u0531\u0580\u0570\u0565\u057D\u057F\u0561\u056F\u0561\u0576 \u056B\u0576\u057F\u0565\u056C\u0565\u056F\u057F\u056B \u056F\u0580\u0565\u0564\u056B\u057F\u0576\u0565\u0580\u0568 \u057D\u057A\u0561\u057C\u057E\u0565\u056C \u0565\u0576\u0589 \u053D\u0576\u0564\u0580\u0578\u0582\u0574 \u0565\u0576\u0584 \u056C\u056B\u0581\u0584\u0561\u057E\u0578\u0580\u0565\u056C \u0571\u0565\u0580 Cloud & AI \u0570\u0561\u0577\u056B\u057E\u0568\u0589",
          error_ru: "\u041A\u0440\u0435\u0434\u0438\u0442\u044B AI \u0438\u0441\u0447\u0435\u0440\u043F\u0430\u043D\u044B. \u041F\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u0431\u0430\u043B\u0430\u043D\u0441 Cloud & AI \u0434\u043B\u044F \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0435\u043D\u0438\u044F \u0440\u0430\u0431\u043E\u0442\u044B."
        }), {
          status: 402,
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
    const isError = confidence_score < CONFIDENCE_THRESHOLD;

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
      _metadata: { fileName, fileId: fileId || null, duration_seconds }
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
      is_error: isError,
      error_warning: isError 
        ? `⚠️ Confidence ${(confidence_score * 100).toFixed(0)}% is below 50% threshold. Manual review required.`
        : null,
      review_warning: needsReview && !isError
        ? `Confidence ${(confidence_score * 100).toFixed(0)}% - review recommended.`
        : null,
      model: "google/gemini-2.5-flash"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("audio-transcribe error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Transcription failed" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});