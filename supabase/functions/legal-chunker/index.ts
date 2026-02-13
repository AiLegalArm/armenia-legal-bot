/**
 * legal-chunker
 *
 * Thin HTTP wrapper around the shared chunker logic.
 * All business logic lives in _shared/chunker.ts.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, checkInternalAuth, checkInputSize } from "../_shared/edge-security.ts";
import { chunkDocument } from "../_shared/chunker.ts";

// Re-export for tests
export { chunkDocument } from "../_shared/chunker.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth guard
  const authErr = checkInternalAuth(req, corsHeaders);
  if (authErr) return authErr;

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { document } = body;

    if (!document || !document.content_text) {
      return new Response(
        JSON.stringify({ error: "document with content_text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!document.doc_type) {
      return new Response(
        JSON.stringify({ error: "document.doc_type is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Input size limit
    const sizeErr = checkInputSize(document.content_text, corsHeaders);
    if (sizeErr) return sizeErr;

    const chunks = chunkDocument(document);

    return new Response(
      JSON.stringify({
        chunks,
        total_chunks: chunks.length,
        doc_type: document.doc_type,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("legal-chunker error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
