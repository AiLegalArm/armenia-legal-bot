import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { OCR_EXTRACTION, buildModelParams } from "../_shared/model-config.ts";
import { redactForLog } from "../_shared/pii-redactor.ts";
import { parseDocx } from "../_shared/docx-parser.ts";

const CONFIDENCE_THRESHOLD = 0.70;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const OCR_SYSTEM_PROMPT = `You are an expert OCR specialist for Armenian legal documents with advanced handwritten text recognition capabilities. Your task is to accurately extract BOTH printed AND handwritten text from scanned documents, PDFs, and images containing Armenian (hy), Russian (ru), or English (en) text.

// ... keep existing code (entire OCR_SYSTEM_PROMPT constant body)

9) Preserve handwritten Armenian text exactly as written (no spelling correction).`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // === AUTH GUARD (Prevent Anonymous Access) ===
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

    // Reuse user from auth guard above
    const userId = user.id;

    console.log(`Processing OCR for file: ${fileName}, URL type: ${fileUrl.startsWith('data:') ? 'base64' : 'url'}`);

    // Determine file type from fileName
    const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
    const isPdf = fileExt === 'pdf';
    const isDocx = fileExt === 'docx';
    const isDoc = fileExt === 'doc';
    const isTxt = fileExt === 'txt';
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
    let docxImages: string[] = []; // Base64 images extracted from DOCX
    let txtContent: string | null = null; // Direct text content for TXT files
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
      } else if (isTxt) {
        // For TXT, decode the base64 to text directly
        const base64Match = fileUrl.match(/^data:[^;]+;base64,(.+)$/);
        if (base64Match) {
          const base64Data = base64Match[1];
          try {
            txtContent = decodeURIComponent(escape(atob(base64Data)));
          } catch {
            txtContent = atob(base64Data);
          }
        } else {
          // Try to extract text directly from data URL
          const textMatch = fileUrl.match(/^data:text\/plain[^,]*,(.+)$/);
          if (textMatch) {
            txtContent = decodeURIComponent(textMatch[1]);
          }
        }
        console.log(`Extracted TXT content directly, length: ${txtContent?.length || 0} chars`);
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
    
    // Handle TXT files - read directly as text without AI processing
    if (isTxt && fileBuffer && !txtContent) {
      const decoder = new TextDecoder('utf-8');
      txtContent = decoder.decode(fileBuffer);
      console.log(`Read TXT file from storage, length: ${txtContent.length} chars`);
    }
    // Handle DOCX files - extract both text AND embedded images via ZIP-based parser
    if (isDocx && fileBuffer) {
      console.log("Extracting text and images from DOCX file via ZIP parser...");
      try {
        const parsed = await parseDocx(fileBuffer);

        if (parsed.text && parsed.text.length >= 20) {
          docxTextContent = parsed.text;
          console.log("Successfully extracted " + docxTextContent.length + " characters from DOCX (" + parsed.paragraphs.length + " paragraphs)");
        }

        if (parsed.images.length > 0) {
          docxImages = parsed.images;
          console.log("Found " + docxImages.length + " embedded images in DOCX");
        }

        if (parsed.warnings.length > 0) {
          console.warn("DOCX parse warnings:", parsed.warnings);
        }

        if ((!docxTextContent || docxTextContent.length < 20) && docxImages.length === 0) {
          throw new Error("Could not extract meaningful text or images from DOCX");
        }
      } catch (docxError) {
        console.error("DOCX extraction error:", docxError);
        throw new Error("Failed to extract content from DOCX file: " + (docxError instanceof Error ? docxError.message : 'Unknown error') + ". Try converting to PDF.");
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
    
    // Handle TXT files directly without AI processing
    if (txtContent) {
      console.log(`TXT file processed directly, saving ${txtContent.length} chars`);
      
      // For TXT files, we have the text directly - save without AI call
      const result = {
        extracted_text: txtContent,
        languages_detected: ["hy", "ru", "en"],
        confidence_score: 1.0,
        confidence_reason: "Direct text file - no OCR required",
        text_types_detected: ["plain_text"],
        handwritten_sections: [],
        warnings: [],
        word_count: txtContent.split(/\s+/).length
      };
      
      const needsReview = false; // TXT files are always readable
      
      // Log API usage
      await supabase.rpc("log_api_usage", {
        _service_type: "ocr",
        _model_name: "direct_text",
        _tokens_used: 0,
        _estimated_cost: 0,
        _metadata: { file_name: fileName, file_type: "txt", chars_count: txtContent.length }
      });
      
      // Save OCR result if fileId provided
      if (fileId) {
        // Check if result already exists
        const { data: existingOcr } = await supabase
          .from("ocr_results")
          .select("id")
          .eq("file_id", fileId)
          .maybeSingle();
          
        if (existingOcr) {
          await supabase
            .from("ocr_results")
            .update({
              extracted_text: txtContent,
              confidence: result.confidence_score,
              language: result.languages_detected?.join(", ") || null,
              needs_review: needsReview
            })
            .eq("id", existingOcr.id);
        } else {
          await supabase
            .from("ocr_results")
            .insert({
              file_id: fileId,
              extracted_text: txtContent,
              confidence: result.confidence_score,
              language: result.languages_detected?.join(", ") || null,
              needs_review: needsReview
            });
        }
      }
      
      return new Response(JSON.stringify({
        success: true,
        text: txtContent,
        confidence: result.confidence_score,
        needsReview,
        languages: result.languages_detected,
        warnings: result.warnings,
        wordCount: result.word_count,
        model: "direct_text"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    if (docxTextContent || docxImages.length > 0) {
      // For DOCX: send extracted text and/or images for analysis
      if (docxImages.length > 0) {
        // DOCX has embedded images - use vision model
        const contentParts: Array<{type: string; text?: string; image_url?: {url: string}}> = [];
        
        // Add text instruction
        let instructionText = "This is content extracted from a Word document (DOCX). File name: " + fileName + ". ";
        if (docxTextContent) {
          instructionText += "The document contains both text and embedded images/screenshots. Please:\n1. First, extract and transcribe ALL text from the embedded images (especially screenshots of documents)\n2. Then combine with the extracted text below\n3. Preserve all Armenian legal terminology\n\nExtracted text from DOCX:\n" + docxTextContent;
        } else {
          instructionText += "The document appears to contain only images/screenshots. Please extract ALL text from these images, focusing on Armenian legal terminology.";
        }
        
        contentParts.push({ type: "text", text: instructionText });
        
        // Add all extracted images (limit to first 5 to avoid token limits)
        const imagesToProcess = docxImages.slice(0, 5);
        for (const imgData of imagesToProcess) {
          contentParts.push({
            type: "image_url",
            image_url: { url: imgData }
          });
        }
        
        messages = [
          { role: "system", content: OCR_SYSTEM_PROMPT },
          { role: "user", content: contentParts }
        ];
        console.log("Using vision model for DOCX with " + imagesToProcess.length + " embedded images");
      } else {
        // Text-only DOCX
        messages = [
          { role: "system", content: OCR_SYSTEM_PROMPT },
          { 
            role: "user", 
            content: "This is extracted text from a Word document (DOCX). File name: " + fileName + ". Please analyze and structure this Armenian legal document text, preserving exact legal terminology. If there are any formatting issues or unclear sections, note them in warnings.\n\nExtracted text:\n" + docxTextContent
          }
        ];
      }
    } else if (imageContent) {
      // For PDF and images: use vision model
      messages = [
        { role: "system", content: OCR_SYSTEM_PROMPT },
        { 
          role: "user", 
          content: [
            { 
              type: "text", 
              text: "Please extract all text from this " + (isPdf ? 'PDF document' : 'document image') + ". File name: " + fileName + ". Focus on accurate Armenian legal terminology preservation."
            },
            imageContent
          ]
        }
      ];
    } else {
      throw new Error('No content to process');
    }

    // Call AI via centralized gateway-bypass (multimodal requires bypass)
    const { callGatewayBypass } = await import("../_shared/gateway-bypass.ts");
    const bypassResult = await callGatewayBypass(messages, {
      functionName: "ocr-process",
      bypassReason: "multimodal",
      timeoutMs: 90000,
    });
    const response = { ok: true, status: 200 } as const;
    const ocrData = bypassResult.data;

    const rawContent = (ocrData.choices as Array<{ message?: { content?: string } }>)?.[0]?.message?.content || "";
    
    console.log("Raw OCR response:", redactForLog(rawContent, 500));

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
      languages_detected,
      confidence_score,
      confidence_reason,
      warnings,
      word_count
    } = ocrResult;
    
    // Handle both new format (object with full/printed_only/handwritten_only) and old format (string)
    const extracted_text = typeof ocrResult.extracted_text === 'object' && ocrResult.extracted_text?.full
      ? ocrResult.extracted_text.full
      : ocrResult.extracted_text;

    const needsReview = confidence_score < CONFIDENCE_THRESHOLD;

    // Save to ocr_results table (only if fileId is provided)
    let ocrRecord = null;
    if (fileId) {
      // Check if result already exists for this file
      const { data: existingOcr } = await supabase
        .from("ocr_results")
        .select("id")
        .eq("file_id", fileId)
        .maybeSingle();

      if (existingOcr) {
        const { data: updated, error: updateError } = await supabase
          .from("ocr_results")
          .update({
            extracted_text: extracted_text,
            confidence: confidence_score,
            language: languages_detected?.join(", ") || "unknown",
            needs_review: needsReview,
          })
          .eq("id", existingOcr.id)
          .select()
          .single();
        if (updateError) {
          console.error("Failed to update OCR result:", updateError);
        } else {
          ocrRecord = updated;
        }
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("ocr_results")
          .insert({
            file_id: fileId,
            extracted_text: extracted_text,
            confidence: confidence_score,
            language: languages_detected?.join(", ") || "unknown",
            needs_review: needsReview,
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
        } else {
          ocrRecord = inserted;
        }
      }
    } else {
      console.warn("No fileId provided, skipping OCR result save to database");
    }

    // Log API usage for cost tracking
    const tokensUsed = aiResponse.usage?.total_tokens || 0;
    const estimatedCost = tokensUsed * 0.0000005;
    
    await supabase.rpc("log_api_usage", {
      _service_type: "ocr",
      _model_name: "google/gemini-2.5-flash",
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
      model: "google/gemini-2.5-flash"
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
