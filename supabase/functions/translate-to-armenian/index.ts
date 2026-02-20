/**
 * translate-to-armenian
 * Translates a text chunk to Armenian using OpenAI.
 * Input:  { text: string }
 * Output: { translated: string }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleCors } from "../_shared/edge-security.ts";
import { openAIRequest } from "../_shared/openai-router.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return json({ error: "text is required" }, 400);
    }

    const systemPrompt =
      "You are a professional legal translator specializing in Armenian law. " +
      "Translate the following legal text to Eastern Armenian. " +
      "Preserve all legal terminology, article numbers, case numbers, dates, and proper nouns exactly as-is. " +
      "Output ONLY the translated text, nothing else.";

    const response = await openAIRequest({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      max_tokens: 4096,
      temperature: 0.1,
    });

    const translated =
      response?.choices?.[0]?.message?.content?.trim() ?? text;

    return json({ translated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Translation failed";
    console.error(JSON.stringify({ ts: new Date().toISOString(), lvl: "error", fn: "translate-to-armenian", msg }));
    return json({ error: msg }, 500);
  }
});
