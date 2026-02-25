/**
 * eval-runner — Evaluation Framework Runner (v2.1)
 *
 * Executes eval cases from a suite, calls target edge functions,
 * validates invariants using structured citation contracts.
 *
 * v2.1 changes:
 *   - isEffectiveOn() helper with [effective_from, effective_to) semantics
 *   - citations_present parameterizable: mode structured_only|hybrid
 *   - cited_ids_exist: fail-fast on >50 cited IDs (no silent partial)
 *   - extractCitations: dedupe by (source_type, doc_id), skip sources_used for vector-search
 *   - temporal_metadata_source persisted in eval_run_results
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { handleCors, validateBrowserRequest, callInternalFunction } from "../_shared/edge-security.ts";
import { log, err } from "../_shared/safe-logger.ts";

// ── Types ────────────────────────────────────────────────────────────────────

interface InvariantDef {
  type: string;
  params?: Record<string, unknown>;
}

interface InvariantResult {
  type: string;
  passed: boolean;
  message: string;
  details?: unknown;
}

interface CitedItem {
  id: string;
  doc_id: string;
  title: string;
  source_type: "kb" | "practice";
  effective_from?: string | null;
  effective_to?: string | null;
}

// ── Temporal helper ──────────────────────────────────────────────────────────

/**
 * Half-open interval: [effective_from, effective_to)
 * - If effective_from is null, treated as -∞
 * - If effective_to is null, treated as +∞
 */
function isEffectiveOn(
  effectiveFrom: string | null | undefined,
  effectiveTo: string | null | undefined,
  referenceDate: Date,
): { valid: boolean; reason?: string } {
  if (effectiveFrom) {
    const from = new Date(effectiveFrom);
    if (from > referenceDate) {
      return { valid: false, reason: `effective_from (${effectiveFrom}) is after reference_date` };
    }
  }
  if (effectiveTo) {
    const to = new Date(effectiveTo);
    // Half-open: effective_to is exclusive
    if (to <= referenceDate) {
      return { valid: false, reason: `effective_to (${effectiveTo}) is on or before reference_date (exclusive upper bound)` };
    }
  }
  return { valid: true };
}

// ── Citation extractor (v2.1: dedupe + mode-aware) ───────────────────────────

function extractCitations(
  response: Record<string, unknown>,
  targetFunction?: string,
): CitedItem[] {
  const seen = new Map<string, CitedItem>(); // key: "source_type:doc_id"

  const addItem = (item: CitedItem) => {
    const key = `${item.source_type}:${item.doc_id}`;
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  };

  // From vector-search: kb[] and practice[]
  for (const key of ["kb", "practice"] as const) {
    const arr = response[key];
    if (!Array.isArray(arr)) continue;
    for (const r of arr) {
      if (r && typeof r === "object" && r.id) {
        addItem({
          id: r.id,
          doc_id: r.doc_id || r.id,
          title: r.title || "",
          source_type: r.source_type || key,
          effective_from: r.effective_from ?? null,
          effective_to: r.effective_to ?? null,
        });
      }
    }
  }

  // From analysis responses: sources_used[]
  // Skip for vector-search to avoid mixing structured results with sources_used
  if (targetFunction !== "vector-search") {
    const sourcesUsed = response.sources_used;
    if (Array.isArray(sourcesUsed)) {
      for (const s of sourcesUsed) {
        if (s && typeof s === "object" && (s.id || s.doc_id)) {
          addItem({
            id: s.id || s.doc_id,
            doc_id: s.doc_id || s.id,
            title: s.title || "",
            source_type: s.source_type || "kb",
            effective_from: s.effective_from ?? null,
            effective_to: s.effective_to ?? null,
          });
        }
      }
    }
  }

  return [...seen.values()];
}

// ── Invariant validators ─────────────────────────────────────────────────────

/**
 * citations_present (v2.1): parameterizable mode
 *   - structured_only: only checks structural citations (doc_id/title)
 *   - hybrid (default): also checks Armenian format + text references
 */
function checkCitationsPresent(
  response: Record<string, unknown>,
  targetFunction?: string,
  params?: Record<string, unknown>,
): InvariantResult {
  const mode = (params?.mode as string) || "hybrid";
  const citations = extractCitations(response, targetFunction);
  const hasStructural = citations.length > 0;

  if (mode === "structured_only") {
    return {
      type: "citations_present",
      passed: hasStructural,
      message: hasStructural
        ? `${citations.length} structural citation(s) found (structured_only mode)`
        : "No structural citations found (structured_only mode)",
      details: { structural_count: citations.length, mode },
    };
  }

  // hybrid mode: also check text patterns
  const text = extractText(response);
  const hasArmenianFormat = /Տե՛ս՝/.test(text);
  const refPatterns = [
    /\b(Article|Art\.?)\s*\.?\s*\d+/i,
    /\bECHR\b/i,
    /ՀՀ\s*(ՔՕ|ՔԴՕ)/,
  ];
  const hasTextRef = refPatterns.some(p => p.test(text));
  const passed = hasStructural || hasArmenianFormat || hasTextRef;

  return {
    type: "citations_present",
    passed,
    message: passed
      ? `Citations found: ${citations.length} structural${hasArmenianFormat ? " + Armenian format (Տե՛ս՝)" : ""}${hasTextRef ? " + text references" : ""}`
      : "No citations detected in any form",
    details: {
      structural_count: citations.length,
      has_armenian_format: hasArmenianFormat,
      has_text_references: hasTextRef,
      mode,
    },
  };
}

/**
 * cited_ids_exist (v2.1): fail-fast if >50 unique IDs (no silent partial)
 */
const MAX_CITED_IDS = 50;

async function checkCitedIdsExist(
  response: Record<string, unknown>,
  supabase: SupabaseClient,
  targetFunction?: string,
): Promise<InvariantResult> {
  const citations = extractCitations(response, targetFunction);
  if (citations.length === 0) {
    return { type: "cited_ids_exist", passed: true, message: "No cited IDs to verify" };
  }

  const kbIds = [...new Set(citations.filter(c => c.source_type === "kb").map(c => c.doc_id))];
  const practiceIds = [...new Set(citations.filter(c => c.source_type === "practice").map(c => c.doc_id))];
  const totalUnique = kbIds.length + practiceIds.length;

  if (totalUnique > MAX_CITED_IDS) {
    return {
      type: "cited_ids_exist",
      passed: false,
      message: `Too many unique cited IDs (${totalUnique} > ${MAX_CITED_IDS}). Fail-fast to prevent silent partial validation.`,
      details: { total_unique: totalUnique, limit: MAX_CITED_IDS },
    };
  }

  const missing: Array<{ doc_id: string; source_type: string }> = [];

  if (kbIds.length > 0) {
    const { data: kbDocs, error: kbError } = await supabase
      .from("knowledge_base")
      .select("id")
      .in("id", kbIds);
    if (kbError) {
      return {
        type: "cited_ids_exist",
        passed: false,
        message: `DB error checking KB IDs: ${kbError.message}`,
        details: { error_source: "knowledge_base", error: kbError.message },
      };
    }
    const foundKb = new Set((kbDocs || []).map(d => d.id));
    for (const id of kbIds) {
      if (!foundKb.has(id)) missing.push({ doc_id: id, source_type: "kb" });
    }
  }

  if (practiceIds.length > 0) {
    const { data: practiceDocs, error: practiceError } = await supabase
      .from("legal_practice_kb")
      .select("id")
      .in("id", practiceIds);
    if (practiceError) {
      return {
        type: "cited_ids_exist",
        passed: false,
        message: `DB error checking Practice IDs: ${practiceError.message}`,
        details: { error_source: "legal_practice_kb", error: practiceError.message },
      };
    }
    const foundPractice = new Set((practiceDocs || []).map(d => d.id));
    for (const id of practiceIds) {
      if (!foundPractice.has(id)) missing.push({ doc_id: id, source_type: "practice" });
    }
  }

  return {
    type: "cited_ids_exist",
    passed: missing.length === 0,
    message: missing.length === 0
      ? `All ${totalUnique} cited IDs verified in DB`
      : `${missing.length} cited ID(s) not found in DB`,
    details: missing.length > 0 ? { missing } : undefined,
  };
}

/**
 * no_fabricated_sources
 */
function checkNoFabricatedSources(response: Record<string, unknown>): InvariantResult {
  const text = extractText(response);
  const fabricatedPattern = /(?:Article|Art\.?)\s*\.?\s*(\d{4,})/gi;
  const matches = [...text.matchAll(fabricatedPattern)];
  const fabricated = matches.filter(m => parseInt(m[1]) > 999);
  return {
    type: "no_fabricated_sources",
    passed: fabricated.length === 0,
    message: fabricated.length === 0
      ? "No fabricated sources detected"
      : `Potentially fabricated article numbers: ${fabricated.map(m => m[0]).join(", ")}`,
    details: fabricated.length > 0 ? fabricated.map(m => m[0]) : undefined,
  };
}

/**
 * language_match
 */
function checkLanguageMatch(response: Record<string, unknown>, expectedLang?: string): InvariantResult {
  if (!expectedLang) {
    return { type: "language_match", passed: true, message: "No expected language specified, skipped" };
  }
  const text = extractText(response);
  const sample = text.substring(0, 500);

  let detected: string;
  if (/[\u0531-\u058F]/.test(sample)) detected = "hy";
  else if (/[\u0400-\u04FF]/.test(sample)) detected = "ru";
  else detected = "en";

  const passed = detected === expectedLang;
  return {
    type: "language_match",
    passed,
    message: passed ? `Language matches: ${expectedLang}` : `Expected ${expectedLang}, detected ${detected}`,
    details: { expected: expectedLang, detected },
  };
}

/**
 * temporal_in_range (v2.1): uses isEffectiveOn() with [from, to) semantics.
 * Returns temporal_metadata_source for analytics.
 */
async function checkTemporalInRange(
  response: Record<string, unknown>,
  referenceDate: string,
  supabase: SupabaseClient,
  targetFunction?: string,
): Promise<InvariantResult & { temporal_metadata_source: "inline" | "db_fallback" | "none" }> {
  if (!referenceDate) {
    return { type: "temporal_in_range", passed: true, message: "No reference_date, skipped", temporal_metadata_source: "none" };
  }

  const citations = extractCitations(response, targetFunction);
  const kbCitations = citations.filter(c => c.source_type === "kb");

  if (kbCitations.length === 0) {
    return {
      type: "temporal_in_range",
      passed: true,
      message: "No KB citations to validate temporally",
      temporal_metadata_source: "none",
    };
  }

  // Split: citations with inline metadata vs those without
  const withMeta = kbCitations.filter(c => c.effective_from != null || c.effective_to != null);
  const withoutMeta = kbCitations.filter(c => c.effective_from == null && c.effective_to == null);

  let metadataSource: "inline" | "db_fallback";
  let citationsToCheck: Array<{
    doc_id: string;
    title: string;
    effective_from: string | null;
    effective_to: string | null;
  }>;

  if (withoutMeta.length === 0) {
    // All have inline metadata — pure inline
    metadataSource = "inline";
    citationsToCheck = withMeta.map(c => ({
      doc_id: c.doc_id,
      title: c.title,
      effective_from: c.effective_from ?? null,
      effective_to: c.effective_to ?? null,
    }));
  } else {
    // Some or all missing — fetch from DB for the missing ones, use inline for the rest
    metadataSource = withMeta.length > 0 ? "inline" : "db_fallback";
    const inlinePart = withMeta.map(c => ({
      doc_id: c.doc_id,
      title: c.title,
      effective_from: c.effective_from ?? null,
      effective_to: c.effective_to ?? null,
    }));

    const missingDocIds = [...new Set(withoutMeta.map(c => c.doc_id))];
    const { data: docs, error } = await supabase
      .from("knowledge_base")
      .select("id, title, effective_from, effective_to")
      .in("id", missingDocIds);

    if (error) {
      return {
        type: "temporal_in_range",
        passed: false,
        message: `DB error checking temporal range: ${error.message}`,
        temporal_metadata_source: "db_fallback",
      };
    }

    const dbPart = (docs || []).map(d => ({
      doc_id: d.id,
      title: d.title,
      effective_from: d.effective_from,
      effective_to: d.effective_to,
    }));

    citationsToCheck = [...inlinePart, ...dbPart];
    if (inlinePart.length > 0 && dbPart.length > 0) {
      metadataSource = "inline"; // hybrid, but predominantly inline
    }
  }

  const refDate = new Date(referenceDate);
  const violations: Array<{
    doc_id: string;
    title: string;
    effective_from: string | null;
    effective_to: string | null;
    reason: string;
  }> = [];

  for (const doc of citationsToCheck) {
    const check = isEffectiveOn(doc.effective_from, doc.effective_to, refDate);
    if (!check.valid) {
      violations.push({ ...doc, reason: check.reason! });
    }
  }

  return {
    type: "temporal_in_range",
    passed: violations.length === 0,
    message: violations.length === 0
      ? `All ${citationsToCheck.length} KB docs temporally valid for ${referenceDate} (${metadataSource})`
      : `${violations.length} temporal violation(s) among ${citationsToCheck.length} KB docs`,
    details: violations.length > 0
      ? { violations, metadata_source: metadataSource }
      : { metadata_source: metadataSource },
    temporal_metadata_source: metadataSource,
  };
}

/**
 * agent_schema_valid
 */
function checkAgentSchemaValid(response: Record<string, unknown>, targetFunction: string): InvariantResult {
  if (targetFunction === "vector-search") {
    const hasKb = Array.isArray(response.kb);
    const hasPractice = Array.isArray(response.practice);
    const kbItems = (response.kb || []) as Array<Record<string, unknown>>;
    const allHaveDocId = kbItems.length === 0 || kbItems.every(r => r.doc_id);
    return {
      type: "agent_schema_valid",
      passed: hasKb && hasPractice,
      message: hasKb && hasPractice
        ? `Valid schema (kb[${kbItems.length}], practice[${(response.practice as unknown[]).length}])${allHaveDocId ? ", all have doc_id" : ", MISSING doc_id"}`
        : `Missing fields: ${!hasKb ? "kb" : ""} ${!hasPractice ? "practice" : ""}`.trim(),
      details: { has_kb: hasKb, has_practice: hasPractice, all_have_doc_id: allHaveDocId },
    };
  }

  if (targetFunction === "ai-analyze") {
    const hasResult = typeof response.analysis_result === "string" || typeof response.result === "string";
    return {
      type: "agent_schema_valid",
      passed: hasResult,
      message: hasResult ? "Response has analysis result" : "Missing analysis_result/result field",
    };
  }

  const hasContent = Object.keys(response).length > 0;
  return {
    type: "agent_schema_valid",
    passed: hasContent,
    message: hasContent ? "Response is non-empty" : "Empty response",
  };
}

// ── Helper ───────────────────────────────────────────────────────────────────

function extractText(response: Record<string, unknown>): string {
  for (const key of ["analysis_result", "result", "text", "content", "translated", "response_text", "full_report"]) {
    if (typeof response[key] === "string") return response[key] as string;
  }
  if (Array.isArray(response.kb)) {
    return (response.kb as Array<{ title?: string; content_text?: string }>)
      .map(r => `${r.title || ""} ${r.content_text || ""}`)
      .join(" ");
  }
  return JSON.stringify(response);
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const authErr = validateBrowserRequest(req, corsHeaders);
  if (authErr) return authErr;

  try {
    const { suite_id } = await req.json();
    if (!suite_id) return json({ error: "suite_id is required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: cases, error: casesErr } = await supabase
      .from("eval_cases")
      .select("*")
      .eq("suite_id", suite_id)
      .eq("is_active", true)
      .order("created_at");

    if (casesErr) return json({ error: `Failed to fetch cases: ${casesErr.message}` }, 500);
    if (!cases || cases.length === 0) return json({ error: "No active eval cases in suite" }, 404);

    const { data: run, error: runErr } = await supabase
      .from("eval_runs")
      .insert({
        suite_id,
        status: "running",
        total_cases: cases.length,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (runErr) return json({ error: `Failed to create run: ${runErr.message}` }, 500);

    log("eval-runner", "Starting eval run v2.1", { run_id: run.id, total_cases: cases.length });

    let passed = 0;
    let failed = 0;
    let skipped = 0;
    const results: Array<{
      case_name: string;
      status: string;
      invariants: InvariantResult[];
      latency_ms: number;
      temporal_metadata_source?: string;
    }> = [];

    for (const evalCase of cases) {
      const t0 = Date.now();
      try {
        const targetUrl = `${supabaseUrl}/functions/v1/${evalCase.target_function}`;
        const response = await callInternalFunction(targetUrl, evalCase.input_payload, {
          timeoutMs: 60_000,
        });

        const latencyMs = Date.now() - t0;
        const responseBody = await response.json() as Record<string, unknown>;

        if (!response.ok) {
          failed++;
          const result = {
            case_name: evalCase.name,
            status: "fail" as const,
            invariants: [{
              type: "function_call",
              passed: false,
              message: `Edge function returned ${response.status}: ${JSON.stringify(responseBody).substring(0, 500)}`,
            }],
            latency_ms: latencyMs,
          };
          results.push(result);

          await supabase.from("eval_run_results").insert({
            run_id: run.id,
            case_id: evalCase.id,
            status: "fail",
            raw_response: responseBody,
            invariant_results: result.invariants,
            latency_ms: latencyMs,
            error_message: `HTTP ${response.status}`,
            temporal_metadata_source: null,
          });
          continue;
        }

        // Run invariant checks
        const invariants: InvariantResult[] = [];
        const invariantDefs = (evalCase.invariants || []) as InvariantDef[];
        let temporalMetadataSource: string | undefined;

        for (const inv of invariantDefs) {
          switch (inv.type) {
            case "citations_present":
              invariants.push(checkCitationsPresent(responseBody, evalCase.target_function, inv.params));
              break;
            case "cited_ids_exist":
              invariants.push(await checkCitedIdsExist(responseBody, supabase, evalCase.target_function));
              break;
            case "no_fabricated_sources":
              invariants.push(checkNoFabricatedSources(responseBody));
              break;
            case "language_match":
              invariants.push(checkLanguageMatch(responseBody, evalCase.expected_language || undefined));
              break;
            case "temporal_in_range": {
              const temporalResult = await checkTemporalInRange(
                responseBody,
                evalCase.reference_date || "",
                supabase,
                evalCase.target_function,
              );
              temporalMetadataSource = temporalResult.temporal_metadata_source;
              invariants.push(temporalResult);
              break;
            }
            case "agent_schema_valid":
              invariants.push(checkAgentSchemaValid(responseBody, evalCase.target_function));
              break;
            default:
              invariants.push({ type: inv.type, passed: true, message: `Unknown invariant '${inv.type}', skipped` });
          }
        }

        const allPassed = invariants.every(i => i.passed);
        const caseStatus = allPassed ? "pass" : "fail";
        if (allPassed) passed++;
        else failed++;

        const temporalViolations = invariants
          .filter(i => i.type === "temporal_in_range" && !i.passed)
          .map(i => i.details);

        results.push({
          case_name: evalCase.name,
          status: caseStatus,
          invariants,
          latency_ms: latencyMs,
          temporal_metadata_source: temporalMetadataSource,
        });

        await supabase.from("eval_run_results").insert({
          run_id: run.id,
          case_id: evalCase.id,
          status: caseStatus,
          raw_response: responseBody,
          invariant_results: invariants,
          temporal_violations: temporalViolations.length > 0 ? temporalViolations : null,
          temporal_metadata_source: temporalMetadataSource || null,
          latency_ms: latencyMs,
        });
      } catch (caseErr) {
        const latencyMs = Date.now() - t0;
        skipped++;
        const errorMsg = caseErr instanceof Error ? caseErr.message : String(caseErr);
        results.push({
          case_name: evalCase.name,
          status: "skipped",
          invariants: [{ type: "execution", passed: false, message: `Error: ${errorMsg}` }],
          latency_ms: latencyMs,
        });

        await supabase.from("eval_run_results").insert({
          run_id: run.id,
          case_id: evalCase.id,
          status: "skipped",
          error_message: errorMsg,
          latency_ms: latencyMs,
          temporal_metadata_source: null,
        });
      }
    }

    await supabase.from("eval_runs").update({
      status: failed > 0 ? "failed" : "passed",
      passed,
      failed,
      skipped,
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);

    log("eval-runner", "Eval run v2.1 complete", { run_id: run.id, passed, failed, skipped });

    return json({ run_id: run.id, passed, failed, skipped, total: cases.length, results });
  } catch (error) {
    err("eval-runner", "Runner error", { error });
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
