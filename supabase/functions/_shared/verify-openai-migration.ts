/**
 * verify-openai-migration.ts — Acceptance checks for OpenAI migration.
 *
 * Required env vars:
 *   LOVABLE_API_KEY    — auto-provisioned
 *   OPENAI_TIMEOUT_MS  — optional (default 60000)
 *   OPENAI_MAX_RETRIES — optional (default 2)
 *
 * Excluded (OCR — untouched):
 *   ocr-process, kb-table-screenshots
 *
 * Run: deno run --allow-env --allow-read supabase/functions/_shared/verify-openai-migration.ts
 */

import { MODEL_MAP } from "./openai-router.ts";

const MIGRATED_FUNCTIONS = [
  "ai-analyze",
  "multi-agent-analyze",
  "generate-complaint",
  "generate-document",
  "legal-chat",
  "analyze-files-for-complaint",
  "audio-transcribe",
  "extract-case-fields",
  "kb-search-assistant",
];

const OCR_FUNCTIONS = ["ocr-process", "kb-table-screenshots"];

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ✅ ${name}${detail ? " — " + detail : ""}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${name}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

console.log("\n=== OpenAI Migration Verification ===\n");

// 1) All migrated functions have MODEL_MAP entries
console.log("1) MODEL_MAP entries for all migrated functions:");
for (const fn of MIGRATED_FUNCTIONS) {
  check(fn, fn in MODEL_MAP, MODEL_MAP[fn]?.model ?? "MISSING");
}

// 2) All migrated functions use OpenAI models
console.log("\n2) OpenAI model assigned (not Google Gemini):");
for (const fn of MIGRATED_FUNCTIONS) {
  const cfg = MODEL_MAP[fn];
  check(fn, cfg?.model?.startsWith("openai/") ?? false, cfg?.model ?? "MISSING");
}

// 3) OCR functions are NOT in MODEL_MAP (they stay on Gemini)
console.log("\n3) OCR functions NOT in MODEL_MAP (excluded from migration):");
for (const fn of OCR_FUNCTIONS) {
  check(fn + " not in MODEL_MAP", !(fn in MODEL_MAP));
}

// 4) JSON functions have json_mode=true and max_tokens <= 4000
console.log("\n4) JSON functions have json_mode=true and max_tokens <= 4000:");
for (const fn of ["extract-case-fields", "kb-search-assistant"]) {
  const cfg = MODEL_MAP[fn];
  check(fn + " json_mode", cfg?.json_mode === true);
  check(fn + " max_tokens <= 4000", (cfg?.max_tokens ?? 9999) <= 4000, String(cfg?.max_tokens));
}

// 5) Legal functions have temperature <= 0.3
console.log("\n5) Legal reasoning functions temperature <= 0.3:");
const legalFns = ["ai-analyze", "multi-agent-analyze", "generate-complaint", "legal-chat", "analyze-files-for-complaint"];
for (const fn of legalFns) {
  const cfg = MODEL_MAP[fn];
  check(fn, (cfg?.temperature ?? 1) <= 0.3, `temp=${cfg?.temperature}`);
}

// 6) kb-search-assistant max_tokens == 200
console.log("\n6) kb-search-assistant max_tokens == 200 (enforced):");
check("kb-search-assistant max_tokens=200", MODEL_MAP["kb-search-assistant"]?.max_tokens === 200);

// Summary
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) Deno.exit(1);
