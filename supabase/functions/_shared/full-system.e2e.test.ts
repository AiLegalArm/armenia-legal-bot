/**
 * Master E2E test runner — imports every test suite so a single command
 * exercises the full backend surface.
 *
 * Usage:
 *   1. supabase start
 *   2. supabase functions serve
 *   3. deno test --allow-net --allow-env --allow-read supabase/functions/_shared/full-system.e2e.test.ts
 *
 * Each suite skips gracefully when its required env vars are missing.
 *
 * Required env (set in .env or export):
 *   VITE_SUPABASE_URL / SUPABASE_URL
 *   VITE_SUPABASE_PUBLISHABLE_KEY / SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *   INTERNAL_INGEST_KEY
 *   TEST_USER_EMAIL        (for OCR contract auth tests)
 *   TEST_USER_PASSWORD      (for OCR contract auth tests)
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";

// ─── 1. Edge Security ──────────────────────────────────────────────────────
import "./edge-security.test.ts";

// ─── 2. Request-ID propagation (vector-search) ─────────────────────────────
import "../vector-search/request-id-propagation.test.ts";

// ─── 3. Vector-search contract ─────────────────────────────────────────────
import "../vector-search/vector-search.test.ts";

// ─── 4. RAG-search telemetry ───────────────────────────────────────────────
import "./rag-search-telemetry.test.ts";

// ─── 5. OCR contract ──────────────────────────────────────────────────────
import "../ocr-process/ocr-process.contract.test.ts";

// ─── 6. RLS security smoke ────────────────────────────────────────────────
import "./rls-smoke.test.ts";
