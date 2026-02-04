import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are an expert legal analyst for Armenian (RA) law cases. Your task is to extract key pieces of information from case materials:

1. CASE NUMBER (\u0533\u0578\u0580\u056E\u056B \u0570\u0561\u0574\u0561\u0580):
   - Look for patterns like: \u053F\u0534/1718/02/24, \u0535\u0531\u0534/1234/01/25, \u053F\u0534-1234-2024, etc.
   - Court case numbers often follow format: XX/NNNN/NN/NN or XX-NNNN-NNNN
   - Also look for: "\u0563\u0578\u0580\u056E N", "\u0563\u0578\u0580\u056E \u0569\u056B\u057E", "case N", "\u0564\u0565\u056C\u0578 N"
   - Extract the EXACT case number as written in the document

2. FACTS (\u0553\u0561\u057D\u057F\u0565\u0580): 
   - Concrete facts of what happened
   - When and where it occurred
   - Involved parties: victim, defendant, plaintiff, body
   - Amounts, damages involved

3. LEGAL QUESTION (\u053B\u0580\u0561\u057E\u0561\u0562\u0561\u0576\u0561\u056F\u0561\u0576 \u0570\u0561\u0580\u0581):
   - What legal issue needs to be resolved
   - Which articles or laws may apply
   - What documents to collect, what questions to answer for lawyers

Extract from case materials (description, OCR results, audio transcriptions).

IMPORTANT: 
- Always respond in Armenian (\u0540\u0561\u0575\u0565\u0580\u0565\u0576). 
- Extract specific, concrete information from the provided documents.
- For case_number, return the EXACT number found in documents (e.g., "\u053F\u0534/1718/02/24"), or empty string if not found.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { caseId } = await req.json();
    
    if (!caseId) {
      throw new Error("caseId is required");
    }

    console.log("Processing extraction for case:", caseId);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase configuration");
    }

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

    // Get OCR results from case files
    const { data: ocrResults } = await supabase
      .from("ocr_results")
      .select(`
        extracted_text,
        case_files!inner(case_id)
      `)
      .eq("case_files.case_id", caseId)
      .limit(5);

    // Get audio transcriptions from case files
    const { data: transcriptions } = await supabase
      .from("audio_transcriptions")
      .select(`
        transcription_text,
        case_files!inner(case_id)
      `)
      .eq("case_files.case_id", caseId)
      .limit(5);

    // Build context from all sources
    let context = "";
    
    if (caseData.description) {
      context += `\n\n=== CASE DESCRIPTION ===\n${caseData.description}`;
    }

    if (ocrResults && ocrResults.length > 0) {
      context += "\n\n=== OCR EXTRACTED TEXT ===";
      ocrResults.forEach((ocr, idx) => {
        // Limit each OCR result to 2000 chars
        const text = ocr.extracted_text?.substring(0, 2000) || "";
        context += `\n\n[Document ${idx + 1}]:\n${text}`;
      });
    }

    if (transcriptions && transcriptions.length > 0) {
      context += "\n\n=== AUDIO TRANSCRIPTIONS ===";
      transcriptions.forEach((trans, idx) => {
        // Limit each transcription to 2000 chars
        const text = trans.transcription_text?.substring(0, 2000) || "";
        context += `\n\n[Transcription ${idx + 1}]:\n${text}`;
      });
    }

    if (!context.trim()) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No data available: no description, OCR or audio transcriptions found. Please add description or upload documents first."
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Call Lovable AI Gateway
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Calling AI for extraction...");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Extract facts and legal question from this case:\n\n${context}` }
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
                    description: "Case number found in documents (e.g., \u053F\u0534/1718/02/24, \u0535\u0531\u0534/1234/01/25). Return empty string if not found."
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
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: "Payment required or premium account needed." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log("AI response received");

    // Extract tool call result
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "extract_case_fields") {
      throw new Error("Unexpected AI response format");
    }

    const extractedFields = JSON.parse(toolCall.function.arguments);
    console.log("Extracted fields:", extractedFields);

    // Build update object - only update case_number if found
    const updateData: Record<string, unknown> = {
      facts: extractedFields.facts,
      legal_question: extractedFields.legal_question,
      updated_at: new Date().toISOString()
    };

    // Only update case_number if AI found one in documents
    if (extractedFields.case_number && extractedFields.case_number.trim()) {
      updateData.case_number = extractedFields.case_number.trim();
    }

    // Update case with extracted fields
    const { error: updateError } = await supabase
      .from("cases")
      .update(updateData)
      .eq("id", caseId);

    if (updateError) {
      throw new Error(`Failed to update case: ${updateError.message}`);
    }

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
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
