/**
 * echr-import — ECHR cases import with Armenian translation.
 *
 * Accepts: JSON array or JSONL (one object per line).
 * For each case, translates text/summary/facts/judgment to Armenian.
 * Inserts 1 row per case with upsert on echr_case_id.
 * Returns JSONL download of translated cases.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version",
};

// ── SHA-256 hash (hex) ────────────────────────────────────────────
async function sha256hex(text: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Text chunker (≈3000 chars per chunk) ─────────────────────────
function chunkText(text: string, chunkSize = 3000): string[] {
  if (!text || text.length <= chunkSize) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + chunkSize;
    if (end < text.length) {
      // Try to break at paragraph or sentence
      const breakPar = text.lastIndexOf("\n\n", end);
      const breakSent = text.lastIndexOf(". ", end);
      if (breakPar > start + chunkSize / 2) end = breakPar + 2;
      else if (breakSent > start + chunkSize / 2) end = breakSent + 2;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

// ── Single field translator (with retry + cache) ──────────────────
async function translateFieldHY(
  text: string,
  fieldName: string,
  openaiKey: string,
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  if (!text || text.trim().length === 0) return text;

  const chunks = chunkText(text);
  const translated: string[] = [];

  for (const chunk of chunks) {
    const cacheKey = await sha256hex(chunk + fieldName);

    // Check cache
    const { data: cached } = await supabase
      .from("translations_cache")
      .select("translated_text")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (cached?.translated_text) {
      translated.push(cached.translated_text);
      continue;
    }

    // Translate via OpenAI with retries
    let result = "";
    let lastError: string = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 1500));
        }
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(30000),
          body: JSON.stringify({
            model: "openai/gpt-5-mini",
            messages: [
              {
                role: "system",
                content:
                  "Translate to Armenian legal language. Preserve all names, dates, article numbers. Return ONLY the translation.",
              },
              {
                role: "user",
                content: chunk,
              },
            ],
          }),
        });

        if (!resp.ok) {
          const errText = await resp.text();
          lastError = `HTTP ${resp.status}: ${errText}`;
          if (resp.status === 429 || resp.status >= 500) continue;
          break; // Non-retryable
        }

        const json = await resp.json();
        result = json.choices?.[0]?.message?.content?.trim() ?? "";
        break;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }

    if (result) {
      translated.push(result);
      // Store in cache (best effort)
      try {
        await supabase.from("translations_cache").upsert({
          cache_key: cacheKey,
          source_text: chunk.slice(0, 5000),
          translated_text: result,
          field_name: fieldName,
          provider: "openai",
        }, { onConflict: "cache_key" });
      } catch { /* ignore cache write errors */ }
    } else {
      // Translation failed — keep original chunk
      translated.push(chunk);
      console.warn(`Translation failed for chunk [${fieldName}]: ${lastError}`);
    }
  }

  return translated.join("\n\n");
}

// ── Translate all target fields of a case object ──────────────────
async function translateCaseHY(
  caseObj: Record<string, unknown>,
  openaiKey: string,
  supabase: ReturnType<typeof createClient>,
  storeInHyFields: boolean
): Promise<{
  result: Record<string, unknown>;
  status: "translated" | "partial" | "skipped";
  errors: string[];
}> {
  const FIELDS = ["text", "summary", "facts", "judgment"] as const;
  const errors: string[] = [];
  let translatedCount = 0;

  const out: Record<string, unknown> = { ...caseObj };

  // Translate all fields in parallel for speed
  const fieldResults = await Promise.all(
    FIELDS.map(async (field) => {
      const val = caseObj[field];
      if (!val || typeof val !== "string" || val.trim().length === 0) return null;
      try {
        // Translate full text — chunkText() handles splitting into ≤3000 char pieces
        const translated = await translateFieldHY(val, field, openaiKey, supabase);
        return { field, translated, ok: true };
      } catch (e) {
        return { field, error: e instanceof Error ? e.message : String(e), ok: false };
      }
    })
  );

  for (const r of fieldResults) {
    if (!r) continue;
    if (r.ok && r.translated) {
      if (storeInHyFields) {
        out[`${r.field}_hy`] = r.translated;
      } else {
        out[r.field] = r.translated;
      }
      translatedCount++;
    } else if (!r.ok && r.error) {
      errors.push(`${r.field}: ${r.error}`);
    }
  }

  const status =
    translatedCount === 0 ? "skipped"
    : errors.length > 0 ? "partial"
    : "translated";

  return { result: out, status, errors };
}

// ── Parse input into case objects ─────────────────────────────────
function parseInput(body: string): { cases: Record<string, unknown>[]; skipped: number } {
  const trimmed = body.trim();
  let cases: Record<string, unknown>[] = [];
  let skipped = 0;

  if (trimmed.startsWith("[")) {
    // JSON array
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        cases = arr.filter((x) => x && typeof x === "object");
      }
    } catch {
      // Try line-by-line fallback
    }
  }

  if (cases.length === 0) {
    // JSONL (one object per line)
    const lines = trimmed.split("\n");
    for (const line of lines) {
      const l = line.trim();
      if (!l) continue;
      try {
        const parsed = JSON.parse(l);
        if (parsed && typeof parsed === "object") {
          cases.push(parsed);
        }
      } catch {
        skipped++;
      }
    }
  }

  return { cases, skipped };
}

// ── Stable ID for upsert ──────────────────────────────────────────
function getStableId(c: Record<string, unknown>): string | null {
  const val =
    c.itemid || c.application_no || c.appno || c.echr_case_id || c.case_id || c.id;
  return val ? String(val) : null;
}

// ── Main handler ──────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await sb.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Body: { rawContent: string, storeInHyFields: boolean, generateJsonl: boolean, practiceCategory: string }
    const body = await req.json();
    const rawContent: string = body.rawContent ?? "";
    const storeInHyFields: boolean = body.storeInHyFields !== false; // default true
    const generateJsonl: boolean = body.generateJsonl !== false; // default true
    const practiceCategory: string = body.practiceCategory ?? "echr";
    const batchIndex: number = body.batchIndex ?? 0;
    const batchSize: number = body.batchSize ?? 5;

    if (!rawContent.trim()) {
      return new Response(JSON.stringify({ error: "rawContent is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { cases, skipped: parseSkipped } = parseInput(rawContent);
    if (cases.length === 0) {
      return new Response(JSON.stringify({ error: "No valid cases found", parseSkipped }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process only this batch
    const batchCases = cases.slice(batchIndex, batchIndex + batchSize);
    let processed = 0;
    let translated = 0;
    let partial = 0;
    let errors = 0;
    const jsonlLines: string[] = [];
    const insertedIds: string[] = [];

    // Concurrency control: process up to 3 cases in parallel
    const CONCURRENCY = 3;
    for (let i = 0; i < batchCases.length; i += CONCURRENCY) {
      const chunk = batchCases.slice(i, i + CONCURRENCY);

      const results = await Promise.all(chunk.map(async (caseObj) => {
        try {
          const { result, status, errors: fieldErrors } = await translateCaseHY(
            caseObj,
            openaiKey,
            supabaseService,
            storeInHyFields
          );

          // Build DB row
          const stableId = getStableId(caseObj);
          const title = String(
            caseObj.docname || caseObj.title || caseObj.case_name || `ECHR-${stableId ?? "unknown"}`
          ).slice(0, 500);

          // Map ECHR fields to legal_practice_kb schema
          const contentText = String(
            result.text || result.content_text || result.judgment || result.summary || result.facts || ""
          ).replace(/\u0000/g, "").slice(0, 500000);

          if (!contentText) return { status, fieldErrors, skipped: true };

          const row: Record<string, unknown> = {
            title,
            content_text: contentText,
            practice_category: practiceCategory,
            court_type: "echr",
            outcome: mapOutcome(String(caseObj.judgementdate ? "granted" : caseObj.outcome ?? "granted")),
            is_anonymized: false,
            visibility: "ai_only",
            is_active: true,
            source_name: String(caseObj.originatingbody_name || caseObj.source_name || "ECHR HUDOC"),
            translation_status: status,
            translation_provider: "openai",
            translation_ts: new Date().toISOString(),
            translation_errors: fieldErrors.length > 0 ? fieldErrors.join("; ") : null,
          };

          // Add *_hy fields if storing separately
          if (storeInHyFields) {
            for (const f of ["text", "summary", "facts", "judgment"]) {
              const hyVal = result[`${f}_hy`];
              if (hyVal) row[`${f}_hy`] = hyVal;
            }
          }

          if (stableId) row.echr_case_id = stableId;

          // Upsert
          const upsertOptions = stableId
            ? { onConflict: "echr_case_id" }
            : undefined;

          let insertedId: string | null = null;
          if (upsertOptions) {
            const { data: upserted, error: upsertErr } = await supabaseService
              .from("legal_practice_kb")
              .upsert(row, upsertOptions)
              .select("id")
              .single();
            if (upsertErr) throw upsertErr;
            insertedId = upserted?.id ?? null;
          } else {
            const { data: inserted, error: insertErr } = await supabaseService
              .from("legal_practice_kb")
              .insert(row)
              .select("id")
              .single();
            if (insertErr) throw insertErr;
            insertedId = inserted?.id ?? null;
          }

          // Build JSONL line (escape newlines in values)
          const jsonlObj = {
            ...result,
            _db_id: insertedId,
            translation_status: status,
          };
          const jsonlLine = JSON.stringify(jsonlObj).replace(/\r?\n/g, "\\n");

          return { status, fieldErrors, insertedId, jsonlLine };
        } catch (e) {
          console.error("Case processing error:", e);
          return { status: "error", fieldErrors: [String(e)], skipped: false, error: true };
        }
      }));

      for (const r of results) {
        processed++;
        if ((r as { skipped?: boolean }).skipped) { errors++; continue; }
        if ((r as { error?: boolean }).error) { errors++; continue; }
        const res = r as { status: string; insertedId?: string; jsonlLine?: string };
        if (res.status === "translated") translated++;
        else if (res.status === "partial") partial++;
        if (res.insertedId) insertedIds.push(res.insertedId);
        if (res.jsonlLine) jsonlLines.push(res.jsonlLine);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total: cases.length,
      batchProcessed: processed,
      batchIndex,
      batchSize,
      translated,
      partial,
      errors,
      parseSkipped,
      insertedIds,
      jsonlContent: generateJsonl ? jsonlLines.join("\n") : null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("echr-import error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Import failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function mapOutcome(raw: string): string {
  const lower = raw.toLowerCase();
  if (/violation|granted|удовлет|բավ/.test(lower)) return "granted";
  if (/no.violation|rejected|отклон|մերժ/.test(lower)) return "rejected";
  if (/partial|частичн|մաս/.test(lower)) return "partial";
  if (/struck|discontin|прекращ|կարճ/.test(lower)) return "discontinued";
  return "granted";
}
