import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OCR_PROMPT = `You are an expert OCR specialist for Armenian legal documents (Republic of Armenia). Your task is to extract ALL visible text from the provided PDF/images with maximum fidelity, preserving evidentiary integrity.

SCOPE
- Input formats: PDF files, scanned documents, photographs of documents (single-page or multi-page).
- Languages: Armenian (hy), Russian (ru), English (en).
- Content types: printed text, handwriting, stamps/seals, marginalia, headers/footers, page numbers, tables, form fields, watermarks (only if readable).

HARD RULES (NON-NEGOTIABLE)
1) Extract ALL visible text. Do NOT summarize, paraphrase, reorder, interpret, or "clean up" content.
2) Do NOT invent missing words, article numbers, dates, names, case numbers, or any other details.
3) Do NOT correct spelling, typos, grammar, or orthography\u2014preserve exactly as visible, even if erroneous.
4) Do NOT translate or normalize language; preserve HY/RU/EN exactly as written.
5) Preserve document structure and reading order as closely as possible.
6) If any fragment is illegible or uncertain, mark it explicitly as [ILLEGIBLE] or [UNCERTAIN: ...] without guessing.
7) Output MUST be raw text only (no JSON, no markdown, no explanations, no extra metadata beyond the inline tags defined here).
8) Do NOT anonymize or redact anything. OCR is a faithful transcription step only.

EXTRACTION INSTRUCTIONS

A) PAGE ORDER & DELIMITERS
- Process pages sequentially as they appear.
- Before each page, output exactly:
  === PAGE {N} ===
  (N starts at 1.)

B) LAYOUT & STRUCTURE
- Preserve headings, paragraphs, numbered lists, bullet points, and indentation where evident.
- Preserve line breaks where meaningful (addresses, headings, form fields, legal clauses).
- Preserve section labels and field labels exactly.
- Form fields: If a field is clearly present (label + blank line/box/cell) but not filled, output [EMPTY FIELD] ONLY for that field.

C) TABLES
- Represent tables in plain text with stable separators:
  - Use " | " between columns when columns are clear.
  - Preserve row order, column order, and cell contents exactly.
- Wrap each table as:
  TABLE START:
  (table text)
  TABLE END:
- If table structure is unclear, output row-by-row without inventing columns.

D) HANDWRITTEN / ANNOTATIONS
- If handwriting is present, include it at the exact position where it appears:
  [HANDWRITTEN: ...]
- If partially unclear:
  [HANDWRITTEN: [UNCERTAIN: ...]]
- Do NOT interpret or standardize handwriting\u2014transcribe as-is.

E) STAMPS / SEALS / SIGNATURES
- If a stamp/seal contains readable text, extract it inline:
  [STAMP/SEAL: ...]
- If a stamp/seal is present but unreadable:
  [STAMP/SEAL PRESENT: ILLEGIBLE]
- If a signature is present, do NOT transcribe it; output:
  [SIGNATURE PRESENT]

F) DATES / NUMBERS / LEGAL REFERENCES
- Preserve all numbers exactly (case numbers, article numbers, dates, sums), including original formatting (e.g., DD.MM.YYYY).
- Preserve legal references exactly as written (e.g., "\u0570\u0578\u0564.", "\u0570\u0578\u0564\u057e\u0561\u056e", "Article", "\u0554\u0580\u0534\u0555", "\u0554\u053F", etc.).
- Preserve punctuation, quotation marks, and special characters.

G) WATERMARKS / OVERLAPS
- If a watermark text is readable, extract it once per page where visible as:
  [WATERMARK: ...]
- If overlapped text becomes unclear, use [UNCERTAIN: ...] rather than guessing.

H) QUALITY FLAGS (INLINE ONLY)
- Use only when quality directly impacts accuracy:
  [BLUR], [LOW CONTRAST], [CUT OFF], [SKEWED], [OVERLAPPED], [DAMAGED]
- Place flags near the affected fragment.

OUTPUT REQUIREMENT
Return ONLY the extracted raw document text with the page delimiters and inline tags above. No preambles, no postscript, no commentary.`;

interface FetchRequest {
  kbIds: string[];
  batchSize?: number;
  delayMs?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
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
    const { data: { user }, error: authError } = await sb.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // === END AUTH GUARD ===

    const { kbIds, batchSize = 5, delayMs = 2000 } = await req.json() as FetchRequest;

    if (!kbIds || !Array.isArray(kbIds) || kbIds.length === 0) {
      return new Response(JSON.stringify({ 
        error: "kbIds array is required" 
      }), {
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

    // Get KB records with PDF links
    const { data: kbRecords, error: fetchError } = await supabase
      .from("knowledge_base")
      .select("id, title, source_url, content_text")
      .in("id", kbIds)
      .not("source_url", "is", null);

    if (fetchError) {
      throw new Error(`Failed to fetch KB records: ${fetchError.message}`);
    }

    if (!kbRecords || kbRecords.length === 0) {
      return new Response(JSON.stringify({ 
        success: true,
        message: "No records with PDF links found",
        processed: 0,
        errors: 0
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing ${kbRecords.length} KB records with PDF links`);

    let processed = 0;
    let errors = 0;
    const results: Array<{ id: string; success: boolean; error?: string; wordCount?: number }> = [];

    // Process in batches
    for (let i = 0; i < kbRecords.length; i += batchSize) {
      const batch = kbRecords.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (record) => {
        try {
          const pdfUrl = record.source_url;
          if (!pdfUrl || !pdfUrl.includes('pdf')) {
            return { id: record.id, success: false, error: "No valid PDF URL" };
          }

          console.log(`Fetching PDF: ${pdfUrl}`);

          // Download PDF
          const pdfResponse = await fetch(pdfUrl);
          if (!pdfResponse.ok) {
            throw new Error(`Failed to download PDF: ${pdfResponse.status}`);
          }

          const pdfBuffer = await pdfResponse.arrayBuffer();
          const bytes = new Uint8Array(pdfBuffer);
          
          // Check PDF size (limit to 10MB for processing)
          if (bytes.length > 10 * 1024 * 1024) {
            throw new Error("PDF too large (>10MB)");
          }

          // Convert to base64 in chunks
          let binary = '';
          const chunkSize = 8192;
          for (let j = 0; j < bytes.length; j += chunkSize) {
            const chunk = bytes.subarray(j, Math.min(j + chunkSize, bytes.length));
            binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
          }
          const base64 = btoa(binary);
          const dataUrl = `data:application/pdf;base64,${base64}`;

          console.log(`PDF ${record.id} converted, size: ${Math.round(base64.length / 1024)}KB`);

          // Call Gemini Vision for OCR
          const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: OCR_PROMPT },
                { 
                  role: "user", 
                  content: [
                    { 
                      type: "text", 
                      text: `Extract ALL text from this Armenian legal PDF document titled: "${record.title}"` 
                    },
                    { 
                      type: "image_url", 
                      image_url: { url: dataUrl } 
                    }
                  ]
                }
              ],
              temperature: 0.1,
              max_tokens: 16000,
            }),
          });

          if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            throw new Error(`AI processing failed: ${aiResponse.status} - ${errorText.substring(0, 200)}`);
          }

          const aiResult = await aiResponse.json();
          const extractedText = aiResult.choices?.[0]?.message?.content || "";
          
          if (!extractedText || extractedText.length < 100) {
            throw new Error("Insufficient text extracted");
          }

          // Update KB record with extracted content
          const { error: updateError } = await supabase
            .from("knowledge_base")
            .update({ 
              content_text: extractedText.substring(0, 200000),
              updated_at: new Date().toISOString()
            })
            .eq("id", record.id);

          if (updateError) {
            throw new Error(`Failed to update record: ${updateError.message}`);
          }

          const wordCount = extractedText.split(/\s+/).length;
          console.log(`Updated KB ${record.id}: ${wordCount} words extracted`);

          // Log API usage
          const tokensUsed = aiResult.usage?.total_tokens || 0;
          await supabase.rpc("log_api_usage", {
            _service_type: "kb_pdf_extraction",
            _model_name: "google/gemini-2.5-flash",
            _tokens_used: tokensUsed,
            _estimated_cost: tokensUsed * 0.0000005,
            _metadata: { kb_id: record.id, word_count: wordCount }
          });

          return { id: record.id, success: true, wordCount };

        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Unknown error";
          console.error(`Error processing ${record.id}:`, errorMsg);
          return { id: record.id, success: false, error: errorMsg };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      for (const result of batchResults) {
        results.push(result);
        if (result.success) {
          processed++;
        } else {
          errors++;
        }
      }

      // Delay between batches to avoid rate limits
      if (i + batchSize < kbRecords.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed,
      errors,
      total: kbRecords.length,
      results
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("kb-fetch-pdf-content error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Processing failed" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
