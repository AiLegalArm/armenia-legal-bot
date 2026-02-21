/**
 * verify-openai-migration.ts — Model governance verification.
 *
 * Validates:
 *   - No openai/* models in MODEL_MAP or ROLE_OVERRIDES
 *   - Temperature caps enforced (<=0.3)
 *   - Role overrides resolve correctly
 *   - Undefined roles are rejected
 *   - GovernanceMeta is structurally present
 */

import { MODEL_MAP, getModelConfig, buildGovernanceMeta } from "./openai-router.ts";

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

// 1) No openai/* models in MODEL_MAP
console.log("1) No openai/* models in MODEL_MAP:");
for (const [fn, cfg] of Object.entries(MODEL_MAP)) {
  check(fn, !cfg.model.startsWith("openai/"), cfg.model);
}

// 2) Temperature <= 0.3 for all functions
console.log("\n2) Temperature <= 0.3 for all functions:");
for (const [fn, cfg] of Object.entries(MODEL_MAP)) {
  check(fn, cfg.temperature <= 0.3, `temp=${cfg.temperature}`);
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

// 7) Structured roles use gemini-2.5-pro with 8k tokens
console.log("\n7) Structured diagnostic roles use google/gemini-2.5-pro:");
for (const role of ["precedent_citation", "cross_exam", "deadline_rules", "law_update_summary"]) {
  const cfg = getModelConfig("ai-analyze", role);
  check(role, cfg.model === "google/gemini-2.5-pro", cfg.model);
  check(`${role} max_tokens`, cfg.max_tokens === 8000, `max_tokens=${cfg.max_tokens}`);
  check(`${role} temp`, cfg.temperature === 0.2, `temp=${cfg.temperature}`);
}

// 8) Undefined role rejection
console.log("\n8) Undefined role rejection:");
let undefinedRoleRejected = false;
try {
  getModelConfig("ai-analyze", "nonexistent_role_xyz");
} catch (e) {
  undefinedRoleRejected = true;
}
check("undefined_role_rejected", undefinedRoleRejected, "throws on unknown role");

// 9) GovernanceMeta structure
console.log("\n9) GovernanceMeta structure:");
const testCfg = getModelConfig("ai-analyze");
const meta = buildGovernanceMeta(testCfg, "ai-analyze");
check("has role", typeof meta.role === "string" && meta.role === "ai-analyze");
check("has model_used", typeof meta.model_used === "string" && !meta.model_used.startsWith("openai/"));
check("has temperature_used", typeof meta.temperature_used === "number");
check("has max_tokens_used", typeof meta.max_tokens_used === "number");

// 10) No openai/* in resolved role overrides
console.log("\n10) No openai/* in resolved role configs:");
const rolesToCheck = [
  "strategy_builder", "risk_factors", "evidence_weakness",
  "hallucination_audit", "legal_position_comparator",
  "draft_deterministic", "precedent_citation", "cross_exam",
  "deadline_rules", "law_update_summary"
];
for (const role of rolesToCheck) {
  const cfg = getModelConfig("ai-analyze", role);
  check(`ai-analyze:${role}`, !cfg.model.startsWith("openai/"), cfg.model);
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) Deno.exit(1);
