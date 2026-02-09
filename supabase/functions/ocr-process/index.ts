import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONFIDENCE_THRESHOLD = 0.70;

export const OCR_SYSTEM_PROMPT = `You are an expert OCR specialist for Armenian legal documents with advanced handwritten text recognition capabilities. Your task is to accurately extract BOTH printed AND handwritten text from scanned documents, PDFs, and images containing Armenian (hy), Russian (ru), or English (en) text.

## CRITICAL: Automatic Text Type Detection

Automatically detect and process:

1. **Printed text** - Standard typed/printed documents

2. **Handwritten text** - Cursive, script, or hand-printed text in Armenian, Russian, or English

3. **Mixed documents** - Documents containing both printed and handwritten elements

4. **Stamps/Seals** - Official stamps and seals (note presence and extract readable text)

5. **Signatures** - Note presence only (do NOT attempt to transcribe)

## Armenian Handwriting Recognition Guidelines:

- Armenian script (\u0540\u0561\u0575\u0565\u0580\u0565\u0576, \u0544\u0565\u056e\u0561\u057f\u0561\u057c, \u0531\u0575\u0562\u0578\u0582\u0562\u0565\u0576) has unique letterforms - recognize both uppercase (\u0531\u0532\u0533\u0534\u0535) and lowercase (\u0561\u0562\u0563\u0564\u0565) variants

- Common Armenian handwriting variations: connected letters, stylized loops, varying slants

- Pay special attention to similar-looking Armenian letters: \u0561/\u0585, \u0563/\u0584, \u0576/\u0574

- Preserve Armenian diacritical marks and punctuation

## Extraction Guidelines (NON-NEGOTIABLE):

1. Extract ALL visible text - both printed and handwritten - preserving original structure

2. Maintain paragraph breaks, bullet points, and numbered lists

3. Preserve headers, titles, and section divisions

4. Keep tables structured with clear column/row separation

5. Preserve page order; add page markers into the combined text as: "=== PAGE X ==="

6. For handwritten sections, tag inline as: [handwritten: ...] and also store them in handwritten_only

7. Do NOT translate, do NOT rewrite, do NOT summarize \u2014 only extract

8. Legal references: preserve exact article numbers, law references, and formatting as written

9. Dates and numbers: pay extra attention to handwritten dates/numbers common in legal docs

## RA LEGAL ENTITY EXTRACTION (OPTIONAL, NON-DESTRUCTIVE)

After extracting raw text, you MAY populate structured fields ONLY if the values are explicitly visible in the document.

DO NOT infer, guess, or "reconstruct" missing values. If uncertain -> set null/empty and add warnings.

Extractable entity types (Republic of Armenia):

- case_number (\u0563\u0578\u0580\u056e \u0569\u056b\u057e / \u0563\u0578\u0580\u056e N / \u2116 \u0563\u0578\u0580\u056e / Case No.)

- court_name (\u0534\u0561\u057f\u0561\u0580\u0561\u0576 / Court)

- court_instance (first_instance / appeal / cassation / constitutional / administrative) ONLY if explicitly stated

- judge_name (\u0534\u0561\u057f\u0561\u057e\u0578\u0580)

- parties: claimant/plaintiff (\u0570\u0561\u0575\u0581\u057e\u0578\u0580), defendant/respondent (\u057a\u0561\u057f\u0561\u057d\u056d\u0561\u0576\u0578\u0572), applicant (\u0564\u056b\u0574\u0578\u0572), accused (\u0574\u0565\u0572\u0561\u0564\u0580\u0575\u0561\u056c), victim (\u057f\u0578\u0582\u056a\u0578\u0572) \u2014 only when labels exist

- representative/lawyer (\u0576\u0565\u0580\u056f\u0561\u0575\u0561\u0581\u0578\u0582\u0581\u056b\u0579 / \u0583\u0561\u057d\u057f\u0561\u0562\u0561\u0576)

- dates: decision_date, hearing_date(s), submission_date (only if labeled or clearly tied to an act)

- legal_references: articles, laws, codes, conventions (capture as written)

- monetary_amounts (AMD/USD/EUR) with surrounding context line

Rules for structured extraction:

- Structured extraction must NEVER modify extracted_text fields.

- If a structured value is extracted, it must be directly traceable to a substring of the extracted text.

- For each structured value, provide a short source_quote (<= 20 words) when possible.

- If a field is not explicitly supported -> null/empty; add a warning explaining what's missing or why uncertain.

## Output Format (JSON ONLY \u2014 MUST BE VALID JSON)

Return ONLY valid JSON. No markdown. No extra commentary.

Use this exact schema (keys must exist; values can be null/empty where allowed):

{

  "extracted_text": {

    "full": "Combined text in reading order with page markers",

    "printed_only": "Only printed text in reading order",

    "handwritten_only": "Only handwritten text in reading order (with [handwritten] tags preserved)"

  },

  "languages_detected": ["hy", "ru", "en"],

  "text_types_detected": ["printed", "handwritten", "stamp", "signature"],

  "case_metadata": {

    "jurisdiction": "RA",

    "case_number": null,

    "court_name": null,

    "court_instance": null,

    "judge_name": null,

    "decision_date": null,

    "submission_date": null,

    "hearing_dates": [],

    "document_type": null,

    "warnings": []

  },

  "entities": {

    "parties": [

      {

        "role": null,

        "name": null,

        "source_quote": null,

        "confidence_score": 0.0,

        "warnings": []

      }

    ],

    "representatives": [

      {

        "role": null,

        "name": null,

        "source_quote": null,

        "confidence_score": 0.0,

        "warnings": []

      }

    ],

    "legal_references": [

      {

        "type": null,

        "reference": null,

        "source_quote": null,

        "confidence_score": 0.0

      }

    ],

    "monetary_amounts": [

      {

        "amount": null,

        "currency": null,

        "context": null,

        "source_quote": null,

        "confidence_score": 0.0

      }

    ]

  },

  "pages": [

    {

      "page_number": 1,

      "content": "Page text with original line breaks",

      "printed": "Printed text on this page",

      "handwritten": "Handwritten text on this page (use [handwritten] tags)",

      "warnings": [],

      "confidence_score": 0.0

    }

  ],

  "handwritten_sections": ["Section or note that was handwritten..."],

  "stamps_and_seals": ["Describe stamp presence; include readable stamp text if any"],

  "signatures": ["Signature present: yes/no; location if known"],

  "confidence_score": 0.95,

  "confidence_reason": "Clear scan, high resolution, minimal artifacts",

  "warnings": ["Slight blur on bottom right corner"],

  "word_count": 150

}

## Confidence Score Guidelines:

- 0.95-1.0: Crystal clear document, professional scan quality, legible handwriting

- 0.85-0.94: Good quality with minor imperfections, mostly legible handwriting

- 0.70-0.84: Readable but some sections may need verification, difficult handwriting

- Below 0.70: Poor quality, illegible handwriting, significant manual review required

## ABSOLUTE ANTI-HALLUCINATION RULES (HARD):

1) Always respond with valid JSON only.

2) Do not invent text that is not visible.

3) Do not invent legal norms, articles, or case numbers.

4) Do not "fix" or normalize names/numbers beyond what is visible.

5) If text is unreadable -> mark it as [illegible] and add warnings.

6) Signatures: note presence only; never transcribe.

7) Structured fields (case_metadata/entities) are OPTIONAL and must be null/empty unless explicitly supported by visible text.

8) Never assume court instance, party roles, or document type without explicit labels in the document.

9) Preserve handwritten Armenian text exactly as written (no spelling correction).`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
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
    // Handle DOCX files - extract both text AND embedded images
    if (isDocx && fileBuffer) {
      console.log("Extracting text and images from DOCX file...");
      try {
        const bytes = new Uint8Array(fileBuffer);
        
        // DOCX is a ZIP file containing XML. We'll extract text and images.
        const decoder = new TextDecoder('utf-8', { fatal: false });
        const rawContent = decoder.decode(bytes);
        
        const textMatches: string[] = [];
        
        // Method 1: Extract text from <w:t> tags (Word text runs)
        const wtRegex = /<w:t[^>]*>([^<]+)<\/w:t>/g;
        let match;
        while ((match = wtRegex.exec(rawContent)) !== null) {
          if (match[1] && match[1].trim()) {
            textMatches.push(match[1]);
          }
        }
        
        // Method 2: Also check for paragraph breaks to preserve structure
        let structuredText = textMatches.join('');
        
        const paragraphBoundaries = rawContent.match(/<\/w:p>/g);
        if (paragraphBoundaries && paragraphBoundaries.length > 1) {
          const paragraphRegex = /<w:p[^>]*>([\s\S]*?)<\/w:p>/g;
          const paragraphs: string[] = [];
          
          while ((match = paragraphRegex.exec(rawContent)) !== null) {
            const paragraphContent = match[1];
            const paraTextMatches: string[] = [];
            const innerWtRegex = /<w:t[^>]*>([^<]+)<\/w:t>/g;
            let innerMatch;
            while ((innerMatch = innerWtRegex.exec(paragraphContent)) !== null) {
              if (innerMatch[1]) {
                paraTextMatches.push(innerMatch[1]);
              }
            }
            if (paraTextMatches.length > 0) {
              paragraphs.push(paraTextMatches.join(''));
            }
          }
          
          if (paragraphs.length > 0) {
            structuredText = paragraphs.join('\n\n');
          }
        }
        
        // Method 3: Fallback - extract any readable text
        if (!structuredText || structuredText.length < 20) {
          console.log("Primary extraction failed, using fallback...");
          const readableRegex = /[\u0531-\u058F\u0400-\u04FF\u0041-\u007Aa-z0-9\s.,!?;:'"()\-\u2013\u2014\u00AB\u00BB\u201E\u201C]+/g;
          const readableMatches = rawContent.match(readableRegex);
          if (readableMatches) {
            const cleanMatches = readableMatches
              .filter(t => t.length > 5 && !/^[\s\d.,]+$/.test(t))
              .filter(t => !t.includes('xml') && !t.includes('schemas') && !t.includes('microsoft'));
            if (cleanMatches.length > 0) {
              structuredText = cleanMatches.join(' ');
            }
          }
        }
        
        // Extract embedded images from DOCX (they are in word/media/ folder)
        // Look for image signatures in the binary data
        const imageSignatures = [
          { sig: [0x89, 0x50, 0x4E, 0x47], mime: 'image/png' },    // PNG
          { sig: [0xFF, 0xD8, 0xFF], mime: 'image/jpeg' },          // JPEG
        ];
        
        for (let i = 0; i < bytes.length - 4; i++) {
          for (const { sig, mime } of imageSignatures) {
            let match = true;
            for (let j = 0; j < sig.length; j++) {
              if (bytes[i + j] !== sig[j]) {
                match = false;
                break;
              }
            }
            if (match) {
              // Found image start, now find the end
              let endIndex = i + 1000; // Minimum chunk
              
              if (mime === 'image/png') {
                // PNG ends with IEND chunk
                for (let k = i + sig.length; k < bytes.length - 8; k++) {
                  if (bytes[k] === 0x49 && bytes[k+1] === 0x45 && bytes[k+2] === 0x4E && bytes[k+3] === 0x44) {
                    endIndex = k + 8; // Include IEND and CRC
                    break;
                  }
                }
              } else if (mime === 'image/jpeg') {
                // JPEG ends with FFD9
                for (let k = i + sig.length; k < bytes.length - 1; k++) {
                  if (bytes[k] === 0xFF && bytes[k+1] === 0xD9) {
                    endIndex = k + 2;
                    break;
                  }
                }
              }
              
              if (endIndex > i + 100 && endIndex - i < 5000000) { // Reasonable image size
                const imgBytes = bytes.slice(i, endIndex);
                let binary = '';
                const chunkSize = 8192;
                for (let c = 0; c < imgBytes.length; c += chunkSize) {
                  const chunk = imgBytes.subarray(c, Math.min(c + chunkSize, imgBytes.length));
                  binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
                }
                const base64Img = btoa(binary);
                if (base64Img.length > 1000) { // Valid image size
                  docxImages.push("data:" + mime + ";base64," + base64Img);
                  console.log("Extracted embedded image: " + mime + ", size: " + base64Img.length + " chars");
                }
                i = endIndex - 1; // Skip past this image
              }
            }
          }
        }
        
        console.log("Found " + docxImages.length + " embedded images in DOCX");
        
        // Final check for text
        if (structuredText && structuredText.length >= 20) {
          docxTextContent = structuredText
            .replace(/\s+/g, ' ')
            .replace(/\n\s+\n/g, '\n\n')
            .trim();
          console.log("Successfully extracted " + docxTextContent.length + " characters from DOCX");
        } else if (docxImages.length === 0) {
          throw new Error('Could not extract meaningful text or images from DOCX');
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

    // Call Gemini for OCR/text analysis via Lovable AI Gateway
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
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
