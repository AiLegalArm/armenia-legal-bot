import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { FIELD_EXTRACTION, buildModelParams } from "../_shared/model-config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `You are an expert legal analyst for Armenian (RA) law cases. Your task is to extract key pieces of information from case materials:

1. CASE NUMBER (Գործի համար):
   - Look for patterns like: ԿԴ/1718/02/24, ԵԱԴ/1234/01/25, ԿԴ-1234-2024, etc.
   - Court case numbers often follow format: XX/NNNN/NN/NN or XX-NNNN-NNNN
   - Also look for: "գործ N", "գործ թիվ", "case N", "дело N"
   - Extract the EXACT case number as written in the document

2. FACTS (Փաստեր): 
   - Concrete facts of what happened
   - When and where it occurred
   - Involved parties: victim, defendant, plaintiff, body
   - Amounts, damages involved

3. LEGAL QUESTION (Իրավաբանական հարց):
   - What legal issue needs to be resolved
   - Which articles or laws may apply
   - What documents to collect, what questions to answer for lawyers

Extract from case materials (description, OCR results, audio transcriptions, or uploaded PDF files).

IMPORTANT: 
- Always respond in Armenian (Հայերեն). 
- Extract specific, concrete information from the provided documents.
- For case_number, return the EXACT number found in documents (e.g., "ԿԴ/1718/02/24"), or empty string if not found.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // === AUTH GUARD ===
    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace('Bearer ', '');
    const { data, error: authError } = await sb.auth.getClaims(token);
    if (authError || !data?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // === END AUTH GUARD ===

    const { caseId } = await req.json();
    if (!caseId) throw new Error("caseId is required");

    console.log("Processing extraction for case:", caseId);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get case data
    const { data: caseData, error: caseError } = await supabase
      .from("cases")
      .select("id, title, description, facts, legal_question")
      .eq("id", caseId)
      .single();

    if (caseError || !caseData) {
      throw new Error(`Case not found: ${caseError?.message}`);
    }

    // Get OCR results
    const { data: ocrResults } = await supabase
      .from("ocr_results")
      .select(`extracted_text, case_files!inner(case_id)`)
      .eq("case_files.case_id", caseId)
      .limit(5);

    // Get audio transcriptions
    const { data: transcriptions } = await supabase
      .from("audio_transcriptions")
      .select(`transcription_text, case_files!inner(case_id)`)
      .eq("case_files.case_id", caseId)
      .limit(5);

    // Get uploaded case files (PDFs)
    const { data: caseFiles } = await supabase
      .from("case_files")
      .select("id, original_filename, storage_path, file_type")
      .eq("case_id", caseId)
      .is("deleted_at", null)
      .in("file_type", ["application/pdf", "image/jpeg", "image/png", "image/jpg"])
      .limit(3);

    // Build text context
    let context = "";
    
    if (caseData.description) {
      context += `\n\n=== CASE DESCRIPTION ===\n${caseData.description}`;
    }

    if (ocrResults && ocrResults.length > 0) {
      context += "\n\n=== OCR EXTRACTED TEXT ===";
      ocrResults.forEach((ocr, idx) => {
        context += `\n\n[Document ${idx + 1}]:\n${(ocr.extracted_text || "").substring(0, 2000)}`;
      });
    }

    if (transcriptions && transcriptions.length > 0) {
      context += "\n\n=== AUDIO TRANSCRIPTIONS ===";
      transcriptions.forEach((trans, idx) => {
        context += `\n\n[Transcription ${idx + 1}]:\n${(trans.transcription_text || "").substring(0, 2000)}`;
      });
    }

    // Build multimodal message content
    const userMessageContent: unknown[] = [];

    if (context.trim()) {
      userMessageContent.push({
        type: "text",
        text: `Extract case number, facts and legal question from the following case materials:\n${context}`
      });
    }

    // If we have uploaded PDF/image files and no text context, download and send them
    const hasTextContext = context.trim().length > 0;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    if (caseFiles && caseFiles.length > 0) {
      for (const file of caseFiles) {
        try {
          console.log(`Downloading file from storage: ${file.storage_path}`);
          
          // Download file from Supabase storage
          const { data: fileData, error: downloadError } = await supabase.storage
            .from("case-files")
            .download(file.storage_path);

          if (downloadError || !fileData) {
            console.warn(`Failed to download ${file.storage_path}: ${downloadError?.message}`);
            continue;
          }

          const arrayBuffer = await fileData.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);

          if (bytes.length > 15 * 1024 * 1024) {
            console.warn(`File too large (${bytes.length} bytes), skipping`);
            continue;
          }

          // Convert to base64
          let binary = '';
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
            binary += String.fromCharCode(...chunk);
          }
          const base64 = btoa(binary);
          const mimeType = file.file_type || "application/pdf";
          const dataUrl = `data:${mimeType};base64,${base64}`;

          console.log(`File ${file.original_filename} encoded (${Math.round(base64.length / 1024)}KB)`);

          if (!hasTextContext && userMessageContent.length === 0) {
            userMessageContent.push({
              type: "text",
              text: `Extract case number, facts and legal question from this uploaded document: "${file.original_filename}"`
            });
          } else if (hasTextContext) {
            userMessageContent.push({
              type: "text",
              text: `\nAlso analyze this uploaded document: "${file.original_filename}"`
            });
          }

          userMessageContent.push({
            type: "image_url",
            image_url: { url: dataUrl }
          });

        } catch (fileErr) {
          console.warn(`Error processing file ${file.id}:`, fileErr);
        }
      }
    }

    if (userMessageContent.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No data available for extraction. Please add a case description or upload PDF/image documents first."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Calling AI for extraction with", userMessageContent.length, "content parts...");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...buildModelParams(FIELD_EXTRACTION),
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessageContent }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_case_fields",
              description: "Extract case number, facts and legal question from provided materials",
              parameters: {
                type: "object",
                properties: {
                  case_number: {
                    type: "string",
                    description: "Case number found in documents. Return empty string if not found."
                  },
                  facts: {
                    type: "string",
                    description: "Case facts in Armenian - concrete details of what happened, when, where, involved parties, amounts"
                  },
                  legal_question: {
                    type: "string",
                    description: "Legal question in Armenian - what legal issue needs resolution, which laws apply"
                  }
                },
                required: ["case_number", "facts", "legal_question"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_case_fields" } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errorText);
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI Gateway error: ${aiResponse.status} - ${errorText.substring(0, 300)}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "extract_case_fields") {
      throw new Error("Unexpected AI response format");
    }

    const extractedFields = JSON.parse(toolCall.function.arguments);
    console.log("Extracted fields:", extractedFields);

    const updateData: Record<string, unknown> = {
      facts: extractedFields.facts,
      legal_question: extractedFields.legal_question,
      updated_at: new Date().toISOString()
    };

    if (extractedFields.case_number && extractedFields.case_number.trim()) {
      updateData.case_number = extractedFields.case_number.trim();
    }

    const { error: updateError } = await supabase
      .from("cases")
      .update(updateData)
      .eq("id", caseId);

    if (updateError) throw new Error(`Failed to update case: ${updateError.message}`);

    console.log("Case updated successfully");

    return new Response(
      JSON.stringify({
        success: true,
        case_number: extractedFields.case_number || null,
        facts: extractedFields.facts,
        legal_question: extractedFields.legal_question
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in extract-case-fields:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
