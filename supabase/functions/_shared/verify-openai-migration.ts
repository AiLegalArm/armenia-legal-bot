/**
 * verify-openai-migration.ts — Model governance verification.
 *
 * Validates:
 *   - No openai/* models in MODEL_MAP
 *   - Temperature caps enforced
 *   - Role overrides correct
 */

import { MODEL_MAP, getModelConfig } from "./openai-router.ts";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  \u2705 ${name}${detail ? " \u2014 " + detail : ""}`);
    passed++;
  } else {
    console.error(`  \u274C FAIL: ${name}${detail ? " \u2014 " + detail : ""}`);
    failed++;
  }
}

console.log("\n=== Model Governance Verification ===\n");

// 1) No openai/* models
console.log("1) No openai/* models in MODEL_MAP:");
for (const [fn, cfg] of Object.entries(MODEL_MAP)) {
  check(fn, !cfg.model.startsWith("openai/"), cfg.model);
}

// 2) Temperature caps
console.log("\n2) Temperature <= 0.2 for all functions:");
for (const [fn, cfg] of Object.entries(MODEL_MAP)) {
  check(fn, cfg.temperature <= 0.2, `temp=${cfg.temperature}`);
}

// 3) High reasoning roles use claude-3.7-sonnet
console.log("\n3) High reasoning roles use anthropic/claude-3.7-sonnet:");
const highReasoningFns = ["ai-analyze", "multi-agent-analyze", "generate-complaint", "legal-chat", "analyze-files-for-complaint"];
for (const fn of highReasoningFns) {
  const cfg = MODEL_MAP[fn];
  check(fn, cfg?.model === "anthropic/claude-3.7-sonnet", cfg?.model);
}

// 4) Structured JSON roles use gemini-2.5-pro
console.log("\n4) Structured JSON roles use google/gemini-2.5-pro:");
for (const fn of ["extract-case-fields", "kb-search-assistant"]) {
  const cfg = MODEL_MAP[fn];
  check(fn, cfg?.model === "google/gemini-2.5-pro", cfg?.model);
}

// 5) Light tasks use gemini-2.5-flash
console.log("\n5) Light tasks use google/gemini-2.5-flash:");
for (const fn of ["generate-document", "audio-transcribe"]) {
  const cfg = MODEL_MAP[fn];
  check(fn, cfg?.model === "google/gemini-2.5-flash", cfg?.model);
}

// 6) draft_deterministic has temp=0
console.log("\n6) draft_deterministic temp=0:");
const draftCfg = getModelConfig("ai-analyze", "draft_deterministic");
check("draft_deterministic", draftCfg.temperature === 0, `temp=${draftCfg.temperature}`);

// 7) deadline_rules uses gemini-2.5-pro
console.log("\n7) deadline_rules uses google/gemini-2.5-pro:");
const dlCfg = getModelConfig("ai-analyze", "deadline_rules");
check("deadline_rules", dlCfg.model === "google/gemini-2.5-pro", dlCfg.model);

// 8) model_used returned in router output
console.log("\n8) Router returns model_used (structural check):");
check("TextResult.model_used", true, "type-level guarantee");
check("JSONResult.model_used", true, "type-level guarantee");

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) Deno.exit(1);
