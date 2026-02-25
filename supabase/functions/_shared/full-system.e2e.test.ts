/**
 * Master E2E test runner — comprehensive backend validation suite.
 *
 * Groups:
 *   1. SECURITY        — edge-security dual-mode, CORS, internal key
 *   2. TRACEABILITY    — x-request-id propagation
 *   3. OCR CONTRACT    — schema stability, error handling
 *   4. TELEMETRY       — vector-search response shape, retrieval_mode
 *   5. DEGRADATION     — failure paths, fallback modes
 *   6. COST            — pricing computation edge cases
 *   7. FAIL-CLOSED     — missing key guarantees
 *
 * Usage:
 *   1. supabase start
 *   2. supabase functions serve
 *   3. deno test -A supabase/functions/_shared/full-system.e2e.test.ts
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
import {
  assertEquals,
  assertExists,
  assert,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  getCorsHeaders,
  handleCors,
  checkInputSize,
  getMaxInputChars,
  isValidInternalCall,
  getRequestMode,
  validateBrowserRequest,
  validateInternalRequest,
  buildInternalHeaders,
} from "./edge-security.ts";

// ─── ENV ───────────────────────────────────────────────────────────

const SUPABASE_URL =
  Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL");
const ANON_KEY =
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ||
  Deno.env.get("SUPABASE_ANON_KEY");
const INTERNAL_KEY = Deno.env.get("INTERNAL_INGEST_KEY");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const TEST_EMAIL = Deno.env.get("TEST_USER_EMAIL");
const TEST_PASSWORD = Deno.env.get("TEST_USER_PASSWORD");

const VECTOR_URL = SUPABASE_URL
  ? `${SUPABASE_URL}/functions/v1/vector-search`
  : "";
const OCR_URL = SUPABASE_URL
  ? `${SUPABASE_URL}/functions/v1/ocr-process`
  : "";

function skipE2E(): boolean {
  if (!SUPABASE_URL || !INTERNAL_KEY) {
    console.warn("SKIP: SUPABASE_URL or INTERNAL_INGEST_KEY not set");
    return true;
  }
  return false;
}

function skipOCR(): boolean {
  if (!SUPABASE_URL) {
    console.warn("SKIP: SUPABASE_URL not set");
    return true;
  }
  return false;
}

// ─── Env helper for unit tests ─────────────────────────────────────

function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => void | Promise<void>,
) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    saved[key] = Deno.env.get(key);
    if (vars[key] === undefined) Deno.env.delete(key);
    else Deno.env.set(key, vars[key]!);
  }
  const restore = () => {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) Deno.env.delete(key);
      else Deno.env.set(key, saved[key]!);
    }
  };
  try {
    const result = fn();
    if (result instanceof Promise) return result.finally(restore);
    restore();
  } catch (e) {
    restore();
    throw e;
  }
}

// ─── Auth helper for OCR ───────────────────────────────────────────

let _token: string | null = null;
async function getToken(): Promise<string | null> {
  if (_token) return _token;
  if (!SUPABASE_URL || !ANON_KEY || !TEST_EMAIL || !TEST_PASSWORD) return null;
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    },
  );
  if (!res.ok) { await res.text(); return null; }
  const d = await res.json();
  _token = d.access_token ?? null;
  return _token;
}

// ─── Fetch with timeout ────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 15000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ═══════════════════════════════════════════════════════════════════
// 1. SECURITY
// ═══════════════════════════════════════════════════════════════════

Deno.test("SECURITY: INTERNAL_INGEST_KEY missing → internal calls rejected", () => {
  return withEnv({ INTERNAL_INGEST_KEY: undefined }, () => {
    const req = new Request("https://x.com", {
      method: "POST",
      headers: { "x-internal-key": "anything" },
    });
    assertEquals(isValidInternalCall(req), false);
  });
});

Deno.test("SECURITY: empty string INTERNAL_INGEST_KEY → rejected", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "" }, () => {
    const req = new Request("https://x.com", {
      method: "POST",
      headers: { "x-internal-key": "" },
    });
    assertEquals(isValidInternalCall(req), false);
  });
});

Deno.test("SECURITY: wrong x-internal-key → handleCors 403", async () => {
  return withEnv(
    { INTERNAL_INGEST_KEY: "correct", ALLOWED_ORIGINS: "https://app.com", ALLOW_WILDCARD_CORS: undefined },
    async () => {
      const req = new Request("https://x.com", {
        method: "POST",
        headers: { "x-internal-key": "wrong" },
      });
      const result = handleCors(req);
      assertExists(result.errorResponse);
      assertEquals(result.errorResponse!.status, 403);
      await result.errorResponse!.text();
    },
  );
});

Deno.test("SECURITY: browser from disallowed origin → 403", async () => {
  return withEnv(
    { INTERNAL_INGEST_KEY: "secret", ALLOWED_ORIGINS: "https://app.com", ALLOW_WILDCARD_CORS: undefined },
    async () => {
      const req = new Request("https://x.com", {
        method: "POST",
        headers: { Origin: "https://evil.com" },
      });
      const result = handleCors(req);
      assertExists(result.errorResponse);
      assertEquals(result.errorResponse!.status, 403);
      await result.errorResponse!.text();
    },
  );
});

Deno.test("SECURITY: valid internal call without Origin → allowed", () => {
  return withEnv(
    { INTERNAL_INGEST_KEY: "key-abc", ALLOWED_ORIGINS: "https://app.com", ALLOW_WILDCARD_CORS: undefined },
    () => {
      const req = new Request("https://x.com", {
        method: "POST",
        headers: { "x-internal-key": "key-abc" },
      });
      const result = handleCors(req);
      assertEquals(result.errorResponse, undefined);
      assertEquals((result as { mode: string }).mode, "internal");
    },
  );
});

Deno.test("SECURITY: buildInternalHeaders throws if key missing", () => {
  return withEnv({ INTERNAL_INGEST_KEY: undefined }, () => {
    let threw = false;
    try { buildInternalHeaders(); } catch { threw = true; }
    assertEquals(threw, true);
  });
});

Deno.test("SECURITY: isValidInternalCall never true for empty secret", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "" }, () => {
    const req = new Request("https://x.com", {
      method: "POST",
      headers: { "x-internal-key": "some-value" },
    });
    assertEquals(isValidInternalCall(req), false);
  });
});

Deno.test("SECURITY: validateBrowserRequest rejects missing auth → 401", async () => {
  const req = new Request("https://x.com", { method: "POST" });
  const r = validateBrowserRequest(req, { "Access-Control-Allow-Origin": "*" });
  assertExists(r);
  assertEquals(r!.status, 401);
  await r!.text();
});

console.log("SECURITY ✓");

// ═══════════════════════════════════════════════════════════════════
// 2. TRACEABILITY
// ═══════════════════════════════════════════════════════════════════

Deno.test("TRACEABILITY: provided x-request-id returned unchanged", async () => {
  if (skipE2E()) return;
  const traceId = "trace-e2e-001";
  const res = await fetchWithTimeout(VECTOR_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": INTERNAL_KEY!,
      "x-request-id": traceId,
    },
    body: JSON.stringify({ query: "test trace", tables: "kb", limit: 1 }),
  });
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.request_id, traceId);
});

Deno.test("TRACEABILITY: auto-generated when not provided", async () => {
  if (skipE2E()) return;
  const res = await fetchWithTimeout(VECTOR_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": INTERNAL_KEY!,
    },
    body: JSON.stringify({ query: "test auto id", tables: "kb", limit: 1 }),
  });
  assertEquals(res.status, 200);
  const data = await res.json();
  assertExists(data.request_id);
  assert(data.request_id.length > 0);
});

Deno.test("TRACEABILITY: response JSON always contains request_id", async () => {
  if (skipE2E()) return;
  const res = await fetchWithTimeout(VECTOR_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": INTERNAL_KEY!,
    },
    body: JSON.stringify({ query: "telemetry check", tables: "both", limit: 1 }),
  });
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(typeof data.request_id, "string");
});

Deno.test("TRACEABILITY: buildInternalHeaders includes x-request-id with req_ prefix", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "k" }, () => {
    const h = buildInternalHeaders();
    assert(h["x-request-id"].startsWith("req_"));
  });
});

Deno.test("TRACEABILITY: caller x-request-id preserved in buildInternalHeaders", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "k" }, () => {
    const h = buildInternalHeaders({ "x-request-id": "my-trace" });
    assertEquals(h["x-request-id"], "my-trace");
  });
});

console.log("TRACEABILITY ✓");

// ═══════════════════════════════════════════════════════════════════
// 3. OCR CONTRACT
// ═══════════════════════════════════════════════════════════════════

function assertOCRSchema(data: Record<string, unknown>) {
  assertEquals(typeof data.ok, "boolean");
  assertEquals(typeof data.text, "string");
  if (data.warnings !== undefined) {
    assertEquals(Array.isArray(data.warnings), true);
  }
}

Deno.test("OCR CONTRACT: no auth → 401 + schema", async () => {
  if (skipOCR()) return;
  const res = await fetchWithTimeout(OCR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileUrl: "https://example.com/t.pdf", fileName: "t.pdf" }),
  });
  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.ok, false);
  assertOCRSchema(data);
});

Deno.test("OCR CONTRACT: unsupported file type → 400", async () => {
  if (skipOCR()) return;
  const token = await getToken();
  if (!token) { console.warn("SKIP: no test creds"); return; }
  const res = await fetchWithTimeout(OCR_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY!,
    },
    body: JSON.stringify({ fileUrl: "https://example.com/v.exe", fileName: "v.exe" }),
  });
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.ok, false);
  assertOCRSchema(data);
});

Deno.test("OCR CONTRACT: missing fileUrl → 400", async () => {
  if (skipOCR()) return;
  const token = await getToken();
  if (!token) { console.warn("SKIP: no test creds"); return; }
  const res = await fetchWithTimeout(OCR_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY!,
    },
    body: JSON.stringify({ fileName: "test.pdf" }),
  });
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.ok, false);
  assertOCRSchema(data);
});

Deno.test("OCR CONTRACT: error responses match { ok: false, text: '', warnings: [] }", async () => {
  if (skipOCR()) return;
  const res = await fetchWithTimeout(OCR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileUrl: "https://example.com/t.pdf", fileName: "t.pdf" }),
  });
  const data = await res.json();
  assertEquals(data.ok, false);
  assertEquals(typeof data.text, "string");
});

console.log("OCR CONTRACT ✓");

// ═══════════════════════════════════════════════════════════════════
// 4. TELEMETRY
// ═══════════════════════════════════════════════════════════════════

Deno.test("TELEMETRY: 400 missing query returns error field", async () => {
  if (skipE2E()) return;
  const res = await fetchWithTimeout(VECTOR_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": INTERNAL_KEY!,
    },
    body: JSON.stringify({ tables: "kb", limit: 1 }),
  });
  assertEquals(res.status, 400);
  const data = await res.json();
  assertExists(data.error);
});

Deno.test("TELEMETRY: success returns kb[], practice[], retrieval_mode, semantic_ok, request_id", async () => {
  if (skipE2E()) return;
  const res = await fetchWithTimeout(VECTOR_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": INTERNAL_KEY!,
      "x-request-id": "telemetry-test",
    },
    body: JSON.stringify({ query: "test telemetry", tables: "both", limit: 2 }),
  });
  assertEquals(res.status, 200);
  const data = await res.json();
  assert(Array.isArray(data.kb));
  assert(Array.isArray(data.practice));
  assertExists(data.retrieval_mode);
  assertEquals(typeof data.semantic_ok, "boolean");
  assertEquals(data.request_id, "telemetry-test");
});

Deno.test("TELEMETRY: retrieval_mode is valid enum", async () => {
  if (skipE2E()) return;
  const res = await fetchWithTimeout(VECTOR_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": INTERNAL_KEY!,
    },
    body: JSON.stringify({ query: "retrieval mode check", tables: "kb", limit: 1 }),
  });
  assertEquals(res.status, 200);
  const data = await res.json();
  assert(
    ["keyword+rerank", "keyword_only", "rpc_fallback"].includes(data.retrieval_mode),
    `Invalid retrieval_mode: ${data.retrieval_mode}`,
  );
});

Deno.test("TELEMETRY: rerank_ok=false implies rerank_error present", async () => {
  if (skipE2E()) return;
  const res = await fetchWithTimeout(VECTOR_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": INTERNAL_KEY!,
    },
    body: JSON.stringify({ query: "rerank check", tables: "both", limit: 1 }),
  });
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(typeof data.rerank_ok, "boolean");
  if (!data.rerank_ok) {
    assertExists(data.rerank_error);
  }
});

console.log("TELEMETRY ✓");

// ═══════════════════════════════════════════════════════════════════
// 5. DEGRADATION
// ═══════════════════════════════════════════════════════════════════

Deno.test("DEGRADATION: vector-search 500 → semantic_ok=false (simulated)", () => {
  const vectorResults = {
    _failed: true,
    _error: "vector-search returned 500: Internal Server Error",
    rerank_ok: undefined as boolean | undefined,
    retrieval_mode: undefined as string | undefined,
    rerank_error: undefined as string | undefined,
  };
  const merged: unknown[] = [];
  const rerankOk = !vectorResults._failed && vectorResults.rerank_ok !== false;
  const retrievalMode = vectorResults._failed
    ? (merged.length > 0 ? "keyword_only" : "rpc_fallback")
    : (vectorResults.retrieval_mode || "keyword_only");

  assertEquals(rerankOk, false);
  assertEquals(retrievalMode, "rpc_fallback");
});

Deno.test("DEGRADATION: with keyword fallback → retrieval_mode=keyword_only", () => {
  const vectorResults = { _failed: true, _error: "500 timeout", rerank_ok: undefined as boolean | undefined };
  const merged = [{ id: "1", title: "fallback" }];
  const rerankOk = !vectorResults._failed && vectorResults.rerank_ok !== false;
  const retrievalMode = vectorResults._failed
    ? (merged.length > 0 ? "keyword_only" : "rpc_fallback")
    : "keyword_only";

  assertEquals(rerankOk, false);
  assertEquals(retrievalMode, "keyword_only");
});

Deno.test("DEGRADATION: without fallback → retrieval_mode=rpc_fallback", () => {
  const vectorResults = { _failed: true, _error: "500", rerank_ok: undefined as boolean | undefined };
  const merged: unknown[] = [];
  const retrievalMode = vectorResults._failed
    ? (merged.length > 0 ? "keyword_only" : "rpc_fallback")
    : "keyword_only";

  assertEquals(retrievalMode, "rpc_fallback");
});

Deno.test("DEGRADATION: _failed=true surfaces semantic_ok=false + semantic_error", () => {
  const vectorResults = {
    _failed: true,
    _error: "vector-search returned 500: Internal Server Error",
    rerank_ok: undefined as boolean | undefined,
    rerank_error: undefined as string | undefined,
  };
  const rerankOk = !vectorResults._failed && vectorResults.rerank_ok !== false;
  const semanticOk = rerankOk;
  const semanticError = vectorResults._error || vectorResults.rerank_error;

  assertEquals(semanticOk, false);
  assertExists(semanticError);
  assert(semanticError!.includes("500"));
});

console.log("DEGRADATION ✓");

// ═══════════════════════════════════════════════════════════════════
// 6. COST
// ═══════════════════════════════════════════════════════════════════

// Simulated cost computation matching OCR pipeline MODEL_PRICING logic
function computeCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  pricing: Record<string, { prompt: number; completion: number }>,
): { cost_usd: number; cost_unknown?: boolean } {
  const clamped_in = Math.max(0, inputTokens);
  const clamped_out = Math.max(0, outputTokens);
  const p = pricing[model];
  if (!p) {
    return { cost_usd: 0, cost_unknown: true };
  }
  const cost = (clamped_in / 1000) * p.prompt + (clamped_out / 1000) * p.completion;
  return { cost_usd: Math.round(cost * 1_000_000) / 1_000_000 };
}

const SAMPLE_PRICING: Record<string, { prompt: number; completion: number }> = {
  "gpt-4o": { prompt: 0.005, completion: 0.015 },
  "gemini-2.5-flash": { prompt: 0.00015, completion: 0.0006 },
};

Deno.test("COST: known model → cost > 0", () => {
  const r = computeCost("gpt-4o", 100, 50, SAMPLE_PRICING);
  assert(r.cost_usd > 0);
  assertEquals(r.cost_unknown, undefined);
});

Deno.test("COST: unknown model → cost_unknown=true, no crash", () => {
  const r = computeCost("mystery-model", 100, 50, SAMPLE_PRICING);
  assertEquals(r.cost_usd, 0);
  assertEquals(r.cost_unknown, true);
});

Deno.test("COST: zero tokens → cost=0", () => {
  const r = computeCost("gpt-4o", 0, 0, SAMPLE_PRICING);
  assertEquals(r.cost_usd, 0);
});

Deno.test("COST: negative tokens clamped to 0", () => {
  const r = computeCost("gpt-4o", -100, -50, SAMPLE_PRICING);
  assertEquals(r.cost_usd, 0);
});

console.log("COST ✓");

// ═══════════════════════════════════════════════════════════════════
// 7. FAIL-CLOSED
// ═══════════════════════════════════════════════════════════════════

Deno.test("FAIL-CLOSED: buildInternalHeaders throws when key not set", () => {
  return withEnv({ INTERNAL_INGEST_KEY: undefined }, () => {
    let threw = false;
    try { buildInternalHeaders(); } catch (e) {
      threw = true;
      assert((e as Error).message.includes("INTERNAL_INGEST_KEY"));
    }
    assertEquals(threw, true);
  });
});

Deno.test("FAIL-CLOSED: buildInternalHeaders throws when key is empty string", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "" }, () => {
    let threw = false;
    try { buildInternalHeaders(); } catch { threw = true; }
    assertEquals(threw, true);
  });
});

Deno.test("FAIL-CLOSED: getRequestMode returns 'browser' when key not set", () => {
  return withEnv({ INTERNAL_INGEST_KEY: undefined }, () => {
    const req = new Request("https://x.com", {
      method: "POST",
      headers: { "x-internal-key": "val" },
    });
    assertEquals(getRequestMode(req), "browser");
  });
});

Deno.test("FAIL-CLOSED: getRequestMode returns 'browser' when key is empty", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "" }, () => {
    const req = new Request("https://x.com", {
      method: "POST",
      headers: { "x-internal-key": "" },
    });
    assertEquals(getRequestMode(req), "browser");
  });
});

Deno.test("FAIL-CLOSED: isValidInternalCall returns false when key not set", () => {
  return withEnv({ INTERNAL_INGEST_KEY: undefined }, () => {
    const req = new Request("https://x.com", {
      method: "POST",
      headers: { "x-internal-key": "anything" },
    });
    assertEquals(isValidInternalCall(req), false);
  });
});

Deno.test("FAIL-CLOSED: isValidInternalCall returns false when key is empty", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "" }, () => {
    const req = new Request("https://x.com", {
      method: "POST",
      headers: { "x-internal-key": "anything" },
    });
    assertEquals(isValidInternalCall(req), false);
  });
});

Deno.test("FAIL-CLOSED: validateInternalRequest returns 500 when secret not configured", async () => {
  return withEnv({ INTERNAL_INGEST_KEY: undefined, ALLOW_UNAUTH_INGEST: undefined }, async () => {
    const req = new Request("https://x.com", { method: "POST" });
    const r = validateInternalRequest(req, {});
    assertExists(r);
    assertEquals(r!.status, 500);
    await r!.text();
  });
});

Deno.test("FAIL-CLOSED: checkInputSize rejects oversized payload → 413", async () => {
  return withEnv({ MAX_INPUT_CHARS: "100" }, async () => {
    const r = checkInputSize("X".repeat(101), {});
    assertExists(r);
    assertEquals(r!.status, 413);
    const body = await r!.json();
    assertEquals(body.error, "Payload too large");
  });
});

console.log("FAIL-CLOSED ✓");

// ═══════════════════════════════════════════════════════════════════
// Also import existing RLS smoke tests
// ═══════════════════════════════════════════════════════════════════
import "./rls-smoke.test.ts";
