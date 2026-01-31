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
  
  // Armenian prompt for accurate extraction
  const systemPrompt = `\u0534\u0578\u0582 \u0570\u0561\u0575\u056F\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u056F\u0561\u0576 \u0578\u0580\u0578\u0577\u0578\u0582\u0574\u0576\u0565\u0580\u056B \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0561\u0562\u0561\u0576 \u0565\u057D\u0589
\u053F\u0531\u0550\u0535\u0548\u0550 \u0537 \u0562\u0578\u056C\u0578\u0580 \u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u0576\u0565\u0580\u0568 \u0570\u0561\u0575\u0565\u0580\u0565\u0576 \u0563\u0580\u0565\u056C!

\u0540\u0561\u0576\u0565\u056C \u0570\u0565\u057F\u0587\u0575\u0561\u056C \u057F\u0565\u0572\u0565\u056F\u0561\u057F\u057E\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568\u055D

1. title - \u0533\u0578\u0580\u056E\u056B \u0570\u0561\u056F\u056B\u0580\u0573 \u057E\u0565\u0580\u0576\u0561\u0563\u056B\u0580 (\u0540\u0531\u0545\u0535\u054A\u0535\u0546)
2. practice_category - \u0544\u0565\u056F\u0568\u055D "criminal" (\u0584\u0580\u0565\u0561\u056A\u0561\u057F\u0561\u056A\u056B), "civil" (\u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576), "administrative" (\u057E\u0561\u0580\u0579\u0561\u056F\u0561\u0576), "echr"
3. court_type - \u0534\u0561\u057F\u0561\u0580\u0561\u0576\u056B \u057F\u0565\u057D\u0561\u056F\u0568\u055D "first_instance" (\u0561\u057C\u0561\u057B\u056B\u0576 \u0561\u057F\u0575\u0561\u0576), "appeal" (\u057E\u0565\u0580\u0561\u0584\u0576\u0576\u0578\u0582\u0569\u0575\u0561\u0576), "cassation" (\u057E\u0573\u057C\u0561\u0584\u0578\u0582\u0569\u0575\u0561\u0576), "constitutional", "echr"
4. outcome - \u0533\u0578\u0580\u056E\u056B \u0565\u056C\u0584\u0568 (\u0555\u0533\u054F \u053F\u0531\u0550\u0535\u0548\u0550)\u055D
   - "granted" = \u0562\u0578\u0572\u0578\u0584\u0568/\u0570\u0561\u0575\u0581\u0568 \u0532\u0531\u054E\u0531\u054A\u0531\u054D\u054E\u0535\u053C \u0537, \u0562\u0578\u0572\u0578\u0584\u0568 \u0570\u0561\u0574\u0561\u0580\u057E\u0565\u0581 \u0570\u056B\u0574\u0576\u0561\u057E\u0578\u0580
   - "rejected" = \u0562\u0578\u0572\u0578\u0584\u0568/\u0570\u0561\u0575\u0581\u0568 \u0544\u0535\u0550\u054A\u054E\u0535\u053C/\u0544\u0535\u054A\u053F\u054E\u0535\u053C \u0537, \u0561\u0576\u0570\u056B\u0574\u0576 \u0569\u0578\u0572\u0576\u057E\u0565\u0581 \u0578\u0582\u056A\u056B \u0574\u0565\u057B
   - "partial" = \u0574\u0561\u057D\u0576\u0561\u056F\u056B \u0562\u0561\u057E\u0561\u0580\u0561\u0580\u0578\u0582\u0574
   - "remanded" = \u0563\u0578\u0580\u056E\u0568 \u0548\u0552\u0531\u0550\u053F\u054E\u0535\u053C/\u054E\u0535\u054A\u0531\u0534\u0531\u0550\u0541\u054E\u0535\u053C \u0537 \u0576\u0578\u0580 \u0584\u0576\u0576\u0578\u0582\u0569\u0575\u0561\u0576
   - "discontinued" = \u057E\u0561\u0580\u0578\u0582\u0575\u0569\u0568 \u056F\u0561\u0580\u0573\u057E\u0565\u0581
5. court_name - \u0534\u0561\u057F\u0561\u0580\u0561\u0576\u056B \u0561\u0576\u0578\u0582\u0576\u0568 (\u0585\u0580\u055D "\u0540\u0540 \u057E\u0573\u057C\u0561\u0584\u0578\u0582\u0569\u0575\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576")
6. case_number_anonymized - \u0533\u0578\u0580\u056E\u056B \u0570\u0561\u0574\u0561\u0580\u0568 (\u0561\u0576\u0578\u0576\u056B\u0574\u0561\u0581\u057E\u0561\u056E)
7. decision_date - \u0548\u0580\u0578\u0577\u0574\u0561\u0576 \u0561\u0574\u057D\u0561\u0569\u056B\u057E\u0568 YYYY-MM-DD \u0571\u0587\u0561\u0579\u0561\u0583\u0578\u057E
8. applied_articles - \u053F\u056B\u0580\u0561\u057C\u057E\u0561\u056E \u0570\u0578\u0564\u057E\u0561\u056E\u0576\u0565\u0580\u0568 JSON \u0571\u0587\u0561\u0579\u0561\u0583\u0578\u057E\u055D [{"code": "criminal_code", "articles": ["273", "34"]}]
   \u053F\u0578\u0564\u0565\u0580\u0568\u055D criminal_code, civil_code, administrative_code, criminal_procedure_code, civil_procedure_code
9. key_violations - \u0540\u056B\u0574\u0576\u0561\u056F\u0561\u0576 \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580\u0568 \u0540\u0531\u0545\u0535\u054A\u0535\u0546 (\u0585\u0580\u055D "\u0540\u0578\u0564\u057E\u0561\u056E 273-\u056B \u057D\u056D\u0561\u056C \u0574\u0565\u056F\u0576\u0561\u0562\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576")
10. legal_reasoning_summary - \u0534\u0561\u057F\u0561\u0580\u0561\u0576\u056B \u0570\u056B\u0574\u0576\u0561\u057E\u0578\u0580\u0578\u0582\u0574\u0568 \u0540\u0531\u0545\u0535\u054A\u0535\u0546 (2-3 \u0576\u0561\u056D\u0561\u0564\u0561\u057D\u0578\u0582\u0569\u0575\u0578\u0582\u0576)

\u054A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u056B\u0580 \u0544\u053B\u0531\u0545\u0546 JSON \u0585\u0562\u0575\u0565\u056F\u057F\u0578\u057E\u0589 \u0548\u0579 \u0574\u056B \u0562\u0561\u0581\u0561\u057F\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0589`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `\u054E\u0565\u0580\u056C\u0578\u0582\u056E\u056B\u0580 \u0561\u0575\u057D \u056B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0583\u0561\u057D\u057F\u0561\u0569\u0578\u0582\u0572\u0569\u0568\u055D\n\n${textForAnalysis}` }
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
    title: extracted.title || '\u0531\u0576\u057E\u0565\u0580\u0576\u0561\u0563\u056B\u0580',
    practice_category: validCategories.includes(extracted.practice_category) 
      ? extracted.practice_category 
      : 'criminal',
    court_type: validCourtTypes.includes(extracted.court_type) 
      ? extracted.court_type 
      : 'cassation',
    outcome: validOutcomes.includes(extracted.outcome) 
      ? extracted.outcome 
      : 'rejected',
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
    content_text: textContent, // Store full text, not truncated
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
