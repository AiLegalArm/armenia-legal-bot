// -*- coding: utf-8 -*-
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CourtType = 'first_instance' | 'appeal' | 'cassation' | 'constitutional' | 'echr';
type PracticeCategory = 'criminal' | 'civil' | 'administrative' | 'echr';
type CaseOutcome = 'granted' | 'rejected' | 'partial' | 'remanded' | 'discontinued';

interface ExtractedData {
  title: string;
  practice_category: PracticeCategory;
  court_type: CourtType;
  outcome: CaseOutcome;
  court_name: string | null;
  case_number_anonymized: string | null;
  decision_date: string | null;
  applied_articles: Array<{ code: string; articles: string[] }>;
  key_violations: string[];
  legal_reasoning_summary: string;
  content_text: string;
}

async function extractWithAI(textContent: string, apiKey: string): Promise<ExtractedData> {
  // Optimization: Only analyze first 10K chars - metadata is usually at the beginning
  const textForAnalysis = textContent.substring(0, 10000);
  
  const systemPrompt = `You are a legal document analyzer specializing in Armenian court decisions.
Extract the following information from the provided court decision text:

1. title - A concise title describing the case (in Armenian if the text is Armenian)
2. practice_category - One of: "criminal", "civil", "administrative", "echr"
3. court_type - One of: "first_instance", "appeal", "cassation", "constitutional", "echr"
4. outcome - One of: "granted" (complaint satisfied), "rejected", "partial", "remanded", "discontinued"
5. court_name - Name of the court (e.g., "ՀՀ վdelays delays delays delays delays")
6. case_number_anonymized - Case number with personal data redacted (e.g., "Ade/0000/00/00")
7. decision_date - Date in YYYY-MM-DD format
8. applied_articles - Array of objects like [{"code": "criminal_code", "articles": ["104", "105"]}]
   Possible codes: criminal_code, civil_code, administrative_code, criminal_procedure_code, civil_procedure_code
9. key_violations - Array of key legal violations or issues identified
10. legal_reasoning_summary - Brief summary of the court's legal reasoning (2-3 sentences)

Respond ONLY with a valid JSON object containing these fields. Do not include any explanation.`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite", // Optimized: faster & cheaper model
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Analyze this legal document and extract the required fields:\n\n${textForAnalysis}` }
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  
  if (!content) {
    throw new Error("No content in AI response");
  }

  // Parse JSON from response (handle markdown code blocks)
  let jsonStr = content.trim();
  if (jsonStr.startsWith("```json")) {
    jsonStr = jsonStr.slice(7);
  }
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith("```")) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  const extracted = JSON.parse(jsonStr);
  
  // Validate and normalize fields
  const validCategories: PracticeCategory[] = ['criminal', 'civil', 'administrative', 'echr'];
  const validCourtTypes: CourtType[] = ['first_instance', 'appeal', 'cassation', 'constitutional', 'echr'];
  const validOutcomes: CaseOutcome[] = ['granted', 'rejected', 'partial', 'remanded', 'discontinued'];

  return {
    title: extracted.title || 'Untitled',
    practice_category: validCategories.includes(extracted.practice_category) 
      ? extracted.practice_category 
      : 'criminal',
    court_type: validCourtTypes.includes(extracted.court_type) 
      ? extracted.court_type 
      : 'cassation',
    outcome: validOutcomes.includes(extracted.outcome) 
      ? extracted.outcome 
      : 'granted',
    court_name: extracted.court_name || null,
    case_number_anonymized: extracted.case_number_anonymized || null,
    decision_date: extracted.decision_date || null,
    applied_articles: Array.isArray(extracted.applied_articles) 
      ? extracted.applied_articles 
      : [],
    key_violations: Array.isArray(extracted.key_violations) 
      ? extracted.key_violations 
      : [],
    legal_reasoning_summary: extracted.legal_reasoning_summary || '',
    content_text: extracted.content_text || textContent,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { textContent, fileName } = await req.json();

    if (!textContent) {
      return new Response(JSON.stringify({ 
        error: "textContent is required" 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Extract data using AI
    console.log(`Processing file: ${fileName}, length: ${textContent.length}`);
    const extractedData = await extractWithAI(textContent, lovableApiKey);
    console.log(`Extracted title: ${extractedData.title}`);

    // Insert into database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: insertedDoc, error: insertError } = await supabase
      .from("legal_practice_kb")
      .insert({
        title: extractedData.title,
        content_text: extractedData.content_text,
        practice_category: extractedData.practice_category,
        court_type: extractedData.court_type,
        outcome: extractedData.outcome,
        court_name: extractedData.court_name,
        case_number_anonymized: extractedData.case_number_anonymized,
        decision_date: extractedData.decision_date,
        applied_articles: extractedData.applied_articles,
        key_violations: extractedData.key_violations.length > 0 ? extractedData.key_violations : null,
        legal_reasoning_summary: extractedData.legal_reasoning_summary,
        is_active: true,
        is_anonymized: true,
        visibility: 'ai_only',
        source_name: fileName || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      throw insertError;
    }

    return new Response(JSON.stringify({
      success: true,
      document: insertedDoc,
      extracted: extractedData,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("legal-practice-import error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Import failed" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
