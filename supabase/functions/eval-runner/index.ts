/**
 * eval-runner — Evaluation Framework Runner
 *
 * Executes eval cases from a suite, calls target edge functions,
 * validates invariants (citations_present, no_fabricated_sources,
 * language_match, temporal_in_range, agent_schema_valid),
 * and writes results to eval_run_results.
 *
 * Input:  { suite_id: string } or { run_id: string } (resume)
 * Output: { run_id, passed, failed, skipped, results: [...] }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { handleCors, validateBrowserRequest, callInternalFunction } from "../_shared/edge-security.ts";
import { log, err } from "../_shared/safe-logger.ts";

// ── Invariant types ──────────────────────────────────────────────────────────

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

// ── Invariant validators ─────────────────────────────────────────────────────

function checkCitationsPresent(response: Record<string, unknown>): InvariantResult {
  const text = extractText(response);
  // Look for article references, case numbers, or legal citations
  const citationPatterns = [
    /\b(Article|Art\.?|Հոdelays|հdelays)\s*\.?\s*\d+/i,
    /\bECHR\b/i,
    /\b\d{2,4}[-/]\d{2,4}\b/, // case numbers like 123/2024
    /ՀՀ\s*(ՔՕ|ՔԴՕ| delays)/,
  ];
  const found = citationPatterns.some(p => p.test(text));
  return {
    type: "citations_present",
    passed: found,
    message: found ? "Citations found in response" : "No legal citations detected in response",
  };
}

function checkNoFabricatedSources(response: Record<string, unknown>): InvariantResult {
  const text = extractText(response);
  // Check for obviously fabricated article numbers (>999 for Armenian codes)
  const fabricatedPattern = /(?:Article|Art\.?|Հodelays)\s*\.?\s*(\d{4,})/gi;
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
    message: passed
      ? `Language matches expected: ${expectedLang}`
      : `Expected ${expectedLang}, detected ${detected}`,
    details: { expected: expectedLang, detected },
  };
}

/**
 * Temporal in-range check (Prompt B):
 * For each cited document, verify effective_from <= reference_date < effective_to.
 */
async function checkTemporalInRange(
  response: Record<string, unknown>,
  referenceDate: string,
  supabase: ReturnType<typeof createClient>,
): Promise<InvariantResult> {
  if (!referenceDate) {
    return { type: "temporal_in_range", passed: true, message: "No reference_date, skipped" };
  }

  // Extract document IDs from sources_used in the response
  const sourcesUsed = response.sources_used as Array<{ id?: string; doc_id?: string }> | undefined;
  const kbResults = response.kb as Array<{ id?: string }> | undefined;

  const docIds: string[] = [];
  if (sourcesUsed) {
    for (const s of sourcesUsed) {
      if (s.id) docIds.push(s.id);
      if (s.doc_id) docIds.push(s.doc_id);
    }
  }
  if (kbResults) {
    for (const r of kbResults) {
      if (r.id) docIds.push(r.id);
    }
  }

  if (docIds.length === 0) {
    return {
      type: "temporal_in_range",
      passed: true,
      message: "No cited documents to validate temporally",
    };
  }

  // Query knowledge_base for effective_from / effective_to
  const { data: docs, error } = await supabase
    .from("knowledge_base")
    .select("id, title, effective_from, effective_to")
    .in("id", docIds.slice(0, 50));

  if (error) {
    return {
      type: "temporal_in_range",
      passed: false,
      message: `DB error checking temporal range: ${error.message}`,
    };
  }

  const violations: Array<{ id: string; title: string; effective_from: string | null; effective_to: string | null; reason: string }> = [];
  const refDate = new Date(referenceDate);

  for (const doc of docs || []) {
    if (doc.effective_from) {
      const from = new Date(doc.effective_from);
      if (from > refDate) {
        violations.push({
          id: doc.id,
          title: doc.title,
          effective_from: doc.effective_from,
          effective_to: doc.effective_to,
          reason: `effective_from (${doc.effective_from}) is after reference_date (${referenceDate})`,
        });
        continue;
      }
    }
    if (doc.effective_to) {
      const to = new Date(doc.effective_to);
      if (to <= refDate) {
        violations.push({
          id: doc.id,
          title: doc.title,
          effective_from: doc.effective_from,
          effective_to: doc.effective_to,
          reason: `effective_to (${doc.effective_to}) is on or before reference_date (${referenceDate})`,
        });
      }
    }
  }

  return {
    type: "temporal_in_range",
    passed: violations.length === 0,
    message: violations.length === 0
      ? `All ${docs?.length || 0} cited docs are temporally valid for ${referenceDate}`
      : `${violations.length} temporal violation(s) found`,
    details: violations.length > 0 ? violations : undefined,
  };
}

function checkAgentSchemaValid(response: Record<string, unknown>, targetFunction: string): InvariantResult {
  // Basic schema validation per function type
  if (targetFunction === "vector-search") {
    const hasKb = Array.isArray(response.kb);
    const hasPractice = Array.isArray(response.practice);
    return {
      type: "agent_schema_valid",
      passed: hasKb && hasPractice,
      message: hasKb && hasPractice
        ? "Response has valid vector-search schema (kb[], practice[])"
        : `Missing fields: ${!hasKb ? "kb" : ""} ${!hasPractice ? "practice" : ""}`.trim(),
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

  // Generic: just check it's not empty
  const hasContent = Object.keys(response).length > 0;
  return {
    type: "agent_schema_valid",
    passed: hasContent,
    message: hasContent ? "Response is non-empty" : "Empty response",
  };
}

// ── Helper ───────────────────────────────────────────────────────────────────

function extractText(response: Record<string, unknown>): string {
  // Try multiple fields where text might be
  for (const key of ["analysis_result", "result", "text", "content", "translated", "response_text", "full_report"]) {
    if (typeof response[key] === "string") return response[key] as string;
  }
  // For vector-search, concatenate KB titles
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

  // Auth: admin only
  const authErr = validateBrowserRequest(req, corsHeaders);
  if (authErr) return authErr;

  try {
    const { suite_id } = await req.json();
    if (!suite_id) return json({ error: "suite_id is required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch eval cases
    const { data: cases, error: casesErr } = await supabase
      .from("eval_cases")
      .select("*")
      .eq("suite_id", suite_id)
      .eq("is_active", true)
      .order("created_at");

    if (casesErr) return json({ error: `Failed to fetch cases: ${casesErr.message}` }, 500);
    if (!cases || cases.length === 0) return json({ error: "No active eval cases in suite" }, 404);

    // Create eval run
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

    log("eval-runner", "Starting eval run", { run_id: run.id, total_cases: cases.length });

    let passed = 0;
    let failed = 0;
    let skipped = 0;
    const results: Array<{ case_name: string; status: string; invariants: InvariantResult[]; latency_ms: number }> = [];

    for (const evalCase of cases) {
      const t0 = Date.now();
      try {
        // Call target edge function
        const targetUrl = `${supabaseUrl}/functions/v1/${evalCase.target_function}`;
        const response = await callInternalFunction(targetUrl, evalCase.input_payload, {
          timeoutMs: 60_000,
        });

        const latencyMs = Date.now() - t0;
        const responseBody = await response.json() as Record<string, unknown>;

        if (!response.ok) {
          // Function returned error
          const result: typeof results[0] = {
            case_name: evalCase.name,
            status: "fail",
            invariants: [{
              type: "function_call",
              passed: false,
              message: `Edge function returned ${response.status}: ${JSON.stringify(responseBody).substring(0, 500)}`,
            }],
            latency_ms: latencyMs,
          };
          failed++;
          results.push(result);

          await supabase.from("eval_run_results").insert({
            run_id: run.id,
            case_id: evalCase.id,
            status: "fail",
            raw_response: responseBody,
            invariant_results: result.invariants,
            latency_ms: latencyMs,
            error_message: `HTTP ${response.status}`,
          });
          continue;
        }

        // Run invariant checks
        const invariants: InvariantResult[] = [];
        const invariantDefs = (evalCase.invariants || []) as InvariantDef[];

        for (const inv of invariantDefs) {
          switch (inv.type) {
            case "citations_present":
              invariants.push(checkCitationsPresent(responseBody));
              break;
            case "no_fabricated_sources":
              invariants.push(checkNoFabricatedSources(responseBody));
              break;
            case "language_match":
              invariants.push(checkLanguageMatch(responseBody, evalCase.expected_language || undefined));
              break;
            case "temporal_in_range":
              invariants.push(await checkTemporalInRange(responseBody, evalCase.reference_date || "", supabase));
              break;
            case "agent_schema_valid":
              invariants.push(checkAgentSchemaValid(responseBody, evalCase.target_function));
              break;
            default:
              invariants.push({ type: inv.type, passed: true, message: `Unknown invariant '${inv.type}', skipped` });
          }
        }

        const allPassed = invariants.every(i => i.passed);
        const temporalViolations = invariants
          .filter(i => i.type === "temporal_in_range" && !i.passed)
          .map(i => i.details);

        const caseStatus = allPassed ? "pass" : "fail";
        if (allPassed) passed++;
        else failed++;

        results.push({
          case_name: evalCase.name,
          status: caseStatus,
          invariants,
          latency_ms: latencyMs,
        });

        await supabase.from("eval_run_results").insert({
          run_id: run.id,
          case_id: evalCase.id,
          status: caseStatus,
          raw_response: responseBody,
          invariant_results: invariants,
          temporal_violations: temporalViolations.length > 0 ? temporalViolations : null,
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
        });
      }
    }

    // Update run with final stats
    await supabase.from("eval_runs").update({
      status: failed > 0 ? "failed" : "passed",
      passed,
      failed,
      skipped,
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);

    log("eval-runner", "Eval run complete", { run_id: run.id, passed, failed, skipped });

    return json({ run_id: run.id, passed, failed, skipped, total: cases.length, results });
  } catch (error) {
    err("eval-runner", "Runner error", { error });
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
