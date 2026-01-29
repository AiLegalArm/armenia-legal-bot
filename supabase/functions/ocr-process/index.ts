import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONFIDENCE_THRESHOLD = 0.70;

const OCR_SYSTEM_PROMPT = `You are an expert OCR specialist for Armenian legal documents with advanced handwritten text recognition capabilities. Your task is to accurately extract BOTH printed AND handwritten text from scanned documents, PDFs, and images containing Armenian (hy), Russian (ru), or English (en) text.

## CRITICAL: Automatic Text Type Detection
Automatically detect and process:
1. **Printed text** - Standard typed/printed documents
2. **Handwritten text** - Cursive, script, or hand-printed text in Armenian, Russian, or English
3. **Mixed documents** - Documents containing both printed and handwritten elements

## Armenian Handwriting Recognition Guidelines:
- Armenian script (\u0540\u0561\u0575\u0565\u0580\u0565\u0576, \u0544\u0565\u056E\u0561\u057F\u0561\u057C, \u0531\u0575\u0562\u0578\u0582\u0562\u0565\u0576) has unique letterforms - recognize both uppercase (\u0531\u0532\u0533\u0534\u0535) and lowercase (\u0561\u0562\u0563\u0564\u0565) variants
- Common Armenian handwriting variations: connected letters, stylized loops, varying slants
- Pay special attention to similar-looking Armenian letters: \u0561/\u0578, \u0563/\u0584, \u0576/\u0574
- Preserve Armenian diacritical marks and punctuation

## Extraction Guidelines:
1. Extract ALL visible text - both printed and handwritten - preserving original structure
2. Maintain paragraph breaks, bullet points, and numbered lists
3. Preserve headers, titles, and section divisions
4. Keep tables structured with clear column/row separation
5. For handwritten sections, indicate text type in the output

## Output Format (JSON):
{
  "extracted_text": "Full extracted text content (printed + handwritten combined)...",
  "languages_detected": ["hy", "en", "ru"],
  "confidence_score": 0.95,
  "confidence_reason": "Clear scan, high resolution, minimal artifacts",
  "text_types_detected": ["printed", "handwritten"],
  "handwritten_sections": ["Section or note that was handwritten..."],
  "warnings": ["Slight blur on bottom right corner"],
  "word_count": 150
}

## Confidence Score Guidelines:
- 0.95-1.0: Crystal clear document, professional scan quality, legible handwriting
- 0.85-0.94: Good quality with minor imperfections, mostly legible handwriting
- 0.70-0.84: Readable but some sections may need verification, difficult handwriting
- Below 0.70: Poor quality, illegible handwriting, significant manual review required

## Special Handling:
- **Legal references**: Preserve exact article numbers, law references (e.g., RA Civil Code Article 15)
- **Official stamps and seals**: Note their presence but focus on text extraction
- **Handwritten annotations/marginalia**: Extract and mark with [handwritten: text]
- **Signatures**: Note presence but do not attempt to transcribe
- **Dates and numbers**: Pay extra attention to handwritten dates/numbers which are common in legal docs

CRITICAL: Always respond with valid JSON only. Handwritten Armenian text must be preserved exactly as written.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    // Support both old format (imageUrl) and new format (fileUrl)
    const fileUrl = body.fileUrl || body.imageUrl;
    const fileName = body.fileName || 'document';
    const { caseId, fileId } = body;

    if (!fileUrl) {
      return new Response(JSON.stringify({ error: "File URL is required" }), {
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

    // Get user from auth header (optional)
    let userId = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    console.log(`Processing OCR for file: ${fileName}, URL type: ${fileUrl.startsWith('data:') ? 'base64' : 'url'}`);

    // Determine file type from fileName
    const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
    const isPdf = fileExt === 'pdf';
    const isDocx = fileExt === 'docx';
    const isDoc = fileExt === 'doc';
    const isImage = ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'webp'].includes(fileExt);
    
    // Reject legacy .doc files
    if (isDoc) {
      return new Response(JSON.stringify({ 
        error: "Legacy .doc format is not supported. Please convert to DOCX or PDF." 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    let imageContent: { type: string; image_url?: { url: string }; text?: string } | null = null;
    let docxTextContent: string | null = null;
    let fileBuffer: ArrayBuffer | null = null;
    
    // Check if this is a base64 data URL (sent directly from client)
    if (fileUrl.startsWith('data:')) {
      console.log("Processing base64 data URL...");
      
      // For images and PDFs, we can use the data URL directly
      if (isImage || isPdf) {
        imageContent = { 
          type: "image_url", 
          image_url: { url: fileUrl } 
        };
        console.log(`Using base64 data URL directly for ${isPdf ? 'PDF' : 'image'}`);
      } else if (isDocx) {
        // For DOCX, we need to extract the base64 and decode it
        const base64Match = fileUrl.match(/^data:[^;]+;base64,(.+)$/);
        if (!base64Match) {
          throw new Error('Invalid base64 data URL format');
        }
        const base64Data = base64Match[1];
        
        // Decode base64 to ArrayBuffer
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        fileBuffer = bytes.buffer;
      }
    } else if (fileUrl.includes('/storage/v1/object/')) {
      // Supabase storage URL
      const storageMatch = fileUrl.match(/\/storage\/v1\/object\/(?:public\/)?([^\/]+)\/(.+)$/);
      if (storageMatch) {
        const [, bucket, path] = storageMatch;
        const decodedPath = decodeURIComponent(path);
        console.log(`Downloading from Supabase storage: bucket=${bucket}, path=${decodedPath}`);
        
        const { data, error } = await supabase.storage.from(bucket).download(decodedPath);
        if (error || !data) {
          throw new Error(`Failed to download from storage: ${error?.message || 'Unknown error'}`);
        }
        fileBuffer = await data.arrayBuffer();
      } else {
        throw new Error('Invalid Supabase storage URL format');
      }
    } else {
      // Regular URL fetch
      const fileResponse = await fetch(fileUrl);
      if (!fileResponse.ok) {
        throw new Error(`Failed to download file: ${fileResponse.status}`);
      }
      fileBuffer = await fileResponse.arrayBuffer();
    }
    
    // Handle DOCX files specially - extract text content
    if (isDocx && fileBuffer) {
      console.log("Extracting text from DOCX file...");
      try {
        const bytes = new Uint8Array(fileBuffer);
        
        // DOCX is a ZIP file - we need to extract document.xml
        // Simple approach: find and extract text between XML tags
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
          binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
        }
        
        // Look for text content in the binary - DOCX stores text in document.xml
        // Extract readable text by finding word/document.xml content
        const textMatches: string[] = [];
        
        // Find text between <w:t> tags (Word text elements)
        const wtRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
        let match;
        while ((match = wtRegex.exec(binary)) !== null) {
          if (match[1]) {
            textMatches.push(match[1]);
          }
        }
        
        if (textMatches.length > 0) {
          docxTextContent = textMatches.join(' ');
          console.log(`Extracted ${docxTextContent.length} characters from DOCX`);
        } else {
          // Fallback: try to extract any readable UTF-8 text
          const decoder = new TextDecoder('utf-8', { fatal: false });
          const rawText = decoder.decode(bytes);
          // Extract text that looks like content (Armenian, Russian, English)
          const textOnly = rawText.match(/[\u0531-\u0587\u0561-\u0587\u0400-\u04FF\w\s.,!?;:'"()-]+/g);
          if (textOnly) {
            docxTextContent = textOnly.filter(t => t.length > 3).join(' ');
            console.log(`Fallback extracted ${docxTextContent.length} characters from DOCX`);
          }
        }
        
        if (!docxTextContent || docxTextContent.length < 50) {
          throw new Error('Could not extract meaningful text from DOCX');
        }
      } catch (docxError) {
        console.error("DOCX extraction error:", docxError);
        throw new Error(`Failed to extract text from DOCX file. Please convert to PDF for better results.`);
      }
    } else if (!imageContent && fileBuffer) {
      // For PDF and images downloaded from URL - convert to base64 for vision model
      const bytes = new Uint8Array(fileBuffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
        binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
      }
      const base64 = btoa(binary);
      
      // Determine MIME type
      let mimeType = 'image/jpeg';
      if (isPdf) {
        mimeType = 'application/pdf';
      } else if (fileExt === 'png') {
        mimeType = 'image/png';
      } else if (fileExt === 'tiff' || fileExt === 'tif') {
        mimeType = 'image/tiff';
      } else if (fileExt === 'webp') {
        mimeType = 'image/webp';
      }
      
      const dataUrl = `data:${mimeType};base64,${base64}`;
      console.log(`File converted to base64, size: ${base64.length} chars, type: ${mimeType}`);
      
      imageContent = { 
        type: "image_url", 
        image_url: { url: dataUrl } 
      };
    }

    // Build request based on file type
    let messages;
    
    if (docxTextContent) {
      // For DOCX: send extracted text for analysis/structuring
      messages = [
        { role: "system", content: OCR_SYSTEM_PROMPT },
        { 
          role: "user", 
          content: `This is extracted text from a Word document (DOCX). File name: ${fileName}. Please analyze and structure this Armenian legal document text, preserving exact legal terminology. If there are any formatting issues or unclear sections, note them in warnings.

Extracted text:
${docxTextContent}`
        }
      ];
    } else if (imageContent) {
      // For PDF and images: use vision model
      messages = [
        { role: "system", content: OCR_SYSTEM_PROMPT },
        { 
          role: "user", 
          content: [
            { 
              type: "text", 
              text: `Please extract all text from this ${isPdf ? 'PDF document' : 'document image'}. File name: ${fileName}. Focus on accurate Armenian legal terminology preservation.` 
            },
            imageContent
          ]
        }
      ];
    } else {
      throw new Error('No content to process');
    }

    // Call Gemini for OCR/text analysis via Lovable AI Gateway
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages,
        temperature: 0.1,
        max_tokens: 8000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini OCR error:", response.status, errorText);
      
      await supabase.rpc("log_error", {
        _error_type: "ocr",
        _error_message: `Gemini OCR failed: ${response.status}`,
        _error_details: { status: response.status, error: errorText, fileName },
        _case_id: caseId || null,
        _file_id: fileId || null
      });

      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: "Rate limit exceeded. Please try again later." 
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error(`OCR processing failed: ${response.status}`);
    }

    const aiResponse = await response.json();
    const rawContent = aiResponse.choices?.[0]?.message?.content || "";
    
    console.log("Raw OCR response:", rawContent.substring(0, 500));

    // Parse the JSON response
    let ocrResult;
    try {
      let jsonStr = rawContent;
      const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      ocrResult = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse OCR JSON:", parseError);
      ocrResult = {
        extracted_text: rawContent,
        languages_detected: ["unknown"],
        confidence_score: 0.5,
        confidence_reason: "Failed to parse structured response",
        warnings: ["Response format was unexpected"],
        word_count: rawContent.split(/\s+/).length
      };
    }

    const {
      extracted_text,
      languages_detected,
      confidence_score,
      confidence_reason,
      warnings,
      word_count
    } = ocrResult;

    const needsReview = confidence_score < CONFIDENCE_THRESHOLD;

    // Save to ocr_results table
    const { data: ocrRecord, error: insertError } = await supabase
      .from("ocr_results")
      .insert({
        file_id: fileId,
        extracted_text: extracted_text,
        confidence: confidence_score,
        language: languages_detected?.join(", ") || "unknown",
        needs_review: needsReview,
        reviewed_by: null
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to save OCR result:", insertError);
      await supabase.rpc("log_error", {
        _error_type: "ocr",
        _error_message: "Failed to save OCR result",
        _error_details: { error: insertError, fileId },
        _case_id: caseId || null,
        _file_id: fileId || null
      });
    }

    // Log API usage for cost tracking
    const tokensUsed = aiResponse.usage?.total_tokens || 0;
    const estimatedCost = tokensUsed * 0.0000005;
    
    await supabase.rpc("log_api_usage", {
      _service_type: "ocr",
      _model_name: "google/gemini-2.5-pro",
      _tokens_used: tokensUsed,
      _estimated_cost: estimatedCost,
      _metadata: { fileName, fileId: fileId || null }
    });

    // Return result
    return new Response(JSON.stringify({
      success: true,
      ocr_id: ocrRecord?.id,
      extracted_text,
      languages_detected,
      confidence_score,
      confidence_reason,
      warnings: warnings || [],
      word_count,
      needs_review: needsReview,
      review_warning: needsReview 
        ? `Confidence ${(confidence_score * 100).toFixed(0)}% is below 70% threshold. Manual review recommended.`
        : null,
      model: "google/gemini-2.5-pro"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("ocr-process error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "OCR processing failed" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
