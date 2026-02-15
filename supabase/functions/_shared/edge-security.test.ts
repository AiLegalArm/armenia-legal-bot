/**
 * Tests for edge-security shared helpers (fail-closed edition).
 *
 * Covers: CORS allowlist, auth guard, input size limits.
 * No Armenian glyphs - Unicode escapes only.
 */

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  getCorsHeaders,
  handleCors,
  checkInternalAuth,
  checkInputSize,
  getMaxInputChars,
} from "./edge-security.ts";

// ─── Helper to save/restore env ────────────────────────────────────

function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => void | Promise<void>,
) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    saved[key] = Deno.env.get(key);
    if (vars[key] === undefined) {
      Deno.env.delete(key);
    } else {
      Deno.env.set(key, vars[key]!);
    }
  }
  const restore = () => {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) Deno.env.delete(key);
      else Deno.env.set(key, saved[key]!);
    }
  };
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.finally(restore);
    }
    restore();
  } catch (e) {
    restore();
    throw e;
  }
}

// ─── CORS TESTS (fail-closed) ──────────────────────────────────────

Deno.test("getCorsHeaders: no ALLOWED_ORIGINS, no wildcard flag -> null", () => {
  return withEnv({ ALLOWED_ORIGINS: undefined, ALLOW_WILDCARD_CORS: undefined }, () => {
    const headers = getCorsHeaders("https://evil.com");
    assertEquals(headers, null);
  });
});

Deno.test("getCorsHeaders: no ALLOWED_ORIGINS + ALLOW_WILDCARD_CORS=true -> '*'", () => {
  return withEnv({ ALLOWED_ORIGINS: undefined, ALLOW_WILDCARD_CORS: "true" }, () => {
    const headers = getCorsHeaders("https://evil.com");
    assertExists(headers);
    assertEquals(headers!["Access-Control-Allow-Origin"], "*");
  });
});

Deno.test("getCorsHeaders: allowed origin is reflected", () => {
  return withEnv({ ALLOWED_ORIGINS: "https://app.example.com,https://admin.example.com", ALLOW_WILDCARD_CORS: undefined }, () => {
    const headers = getCorsHeaders("https://admin.example.com");
    assertExists(headers);
    assertEquals(headers!["Access-Control-Allow-Origin"], "https://admin.example.com");
    assertEquals(headers!["Vary"], "Origin");
  });
});

Deno.test("getCorsHeaders: disallowed origin -> null (fail-closed)", () => {
  return withEnv({ ALLOWED_ORIGINS: "https://app.example.com,https://admin.example.com", ALLOW_WILDCARD_CORS: undefined }, () => {
    const headers = getCorsHeaders("https://evil.com");
    assertEquals(headers, null);
  });
});

Deno.test("getCorsHeaders: null origin -> null (fail-closed)", () => {
  return withEnv({ ALLOWED_ORIGINS: "https://app.example.com", ALLOW_WILDCARD_CORS: undefined }, () => {
    const headers = getCorsHeaders(null);
    assertEquals(headers, null);
  });
});

Deno.test("getCorsHeaders: includes x-internal-key in allowed headers", () => {
  return withEnv({ ALLOWED_ORIGINS: undefined, ALLOW_WILDCARD_CORS: "true" }, () => {
    const headers = getCorsHeaders(null);
    assertExists(headers);
    assertEquals(headers!["Access-Control-Allow-Headers"].includes("x-internal-key"), true);
  });
});

// ─── handleCors integration ────────────────────────────────────────

Deno.test("handleCors: no CORS config, POST -> 403", async () => {
  return withEnv({ ALLOWED_ORIGINS: undefined, ALLOW_WILDCARD_CORS: undefined }, async () => {
    const req = new Request("https://example.com/test", { method: "POST" });
    const result = handleCors(req);
    assertExists(result.errorResponse);
    assertEquals(result.errorResponse!.status, 403);
    const body = await result.errorResponse!.json();
    assertEquals(body.error, "CORS not configured");
  });
});

Deno.test("handleCors: no CORS config, OPTIONS -> 403", async () => {
  return withEnv({ ALLOWED_ORIGINS: undefined, ALLOW_WILDCARD_CORS: undefined }, async () => {
    const req = new Request("https://example.com/test", { method: "OPTIONS" });
    const result = handleCors(req);
    assertExists(result.errorResponse);
    assertEquals(result.errorResponse!.status, 403);
    await result.errorResponse!.text();
  });
});

Deno.test("handleCors: CORS configured, OPTIONS -> 204 preflight", () => {
  return withEnv({ ALLOWED_ORIGINS: "https://app.example.com", ALLOW_WILDCARD_CORS: undefined }, () => {
    const req = new Request("https://example.com/test", {
      method: "OPTIONS",
      headers: { "Origin": "https://app.example.com" },
    });
    const result = handleCors(req);
    assertExists(result.errorResponse);
    assertEquals(result.errorResponse!.status, 204);
    assertExists(result.corsHeaders);
  });
});

Deno.test("handleCors: CORS configured, POST -> corsHeaders returned, no error", () => {
  return withEnv({ ALLOWED_ORIGINS: "https://app.example.com", ALLOW_WILDCARD_CORS: undefined }, () => {
    const req = new Request("https://example.com/test", {
      method: "POST",
      headers: { "Origin": "https://app.example.com" },
    });
    const result = handleCors(req);
    assertEquals(result.errorResponse, undefined);
    assertExists(result.corsHeaders);
    assertEquals(result.corsHeaders!["Access-Control-Allow-Origin"], "https://app.example.com");
  });
});

// ─── AUTH GUARD TESTS (fail-closed) ────────────────────────────────

Deno.test("checkInternalAuth: no secret, no bypass -> 500", async () => {
  return withEnv({ INTERNAL_INGEST_KEY: undefined, ALLOW_UNAUTH_INGEST: undefined }, async () => {
    const req = new Request("https://example.com/test", { method: "POST" });
    const result = checkInternalAuth(req, { "Access-Control-Allow-Origin": "*" });
    assertExists(result);
    assertEquals(result!.status, 500);
    const body = await result!.json();
    assertEquals(body.error, "Server misconfigured");
  });
});

Deno.test("checkInternalAuth: no secret + ALLOW_UNAUTH_INGEST=true -> passes (null)", () => {
  return withEnv({ INTERNAL_INGEST_KEY: undefined, ALLOW_UNAUTH_INGEST: "true" }, () => {
    const req = new Request("https://example.com/test", { method: "POST" });
    const result = checkInternalAuth(req, { "Access-Control-Allow-Origin": "*" });
    assertEquals(result, null);
  });
});

Deno.test("checkInternalAuth: missing x-internal-key -> 401", async () => {
  return withEnv({ INTERNAL_INGEST_KEY: "test-secret-key-12345", ALLOW_UNAUTH_INGEST: undefined }, async () => {
    const req = new Request("https://example.com/test", { method: "POST" });
    const result = checkInternalAuth(req, { "Access-Control-Allow-Origin": "*" });
    assertExists(result);
    assertEquals(result!.status, 401);
    const body = await result!.json();
    assertEquals(body.error, "Unauthorized");
  });
});

Deno.test("checkInternalAuth: wrong key -> 401", async () => {
  return withEnv({ INTERNAL_INGEST_KEY: "correct-key", ALLOW_UNAUTH_INGEST: undefined }, async () => {
    const req = new Request("https://example.com/test", {
      method: "POST",
      headers: { "x-internal-key": "wrong-key" },
    });
    const result = checkInternalAuth(req, { "Access-Control-Allow-Origin": "*" });
    assertExists(result);
    assertEquals(result!.status, 401);
    await result!.text();
  });
});

Deno.test("checkInternalAuth: correct key -> passes (null)", () => {
  return withEnv({ INTERNAL_INGEST_KEY: "correct-key", ALLOW_UNAUTH_INGEST: undefined }, () => {
    const req = new Request("https://example.com/test", {
      method: "POST",
      headers: { "x-internal-key": "correct-key" },
    });
    const result = checkInternalAuth(req, { "Access-Control-Allow-Origin": "*" });
    assertEquals(result, null);
  });
});

// ─── INPUT SIZE LIMIT TESTS ────────────────────────────────────────

Deno.test("checkInputSize: text within limit -> passes (null)", () => {
  return withEnv({ MAX_INPUT_CHARS: "1000" }, () => {
    const result = checkInputSize("A".repeat(999), { "Access-Control-Allow-Origin": "*" });
    assertEquals(result, null);
  });
});

Deno.test("checkInputSize: text at exact limit -> passes (null)", () => {
  return withEnv({ MAX_INPUT_CHARS: "500" }, () => {
    const result = checkInputSize("B".repeat(500), { "Access-Control-Allow-Origin": "*" });
    assertEquals(result, null);
  });
});

Deno.test("checkInputSize: text exceeds limit -> 413", async () => {
  return withEnv({ MAX_INPUT_CHARS: "500" }, async () => {
    const result = checkInputSize("C".repeat(501), { "Access-Control-Allow-Origin": "*" });
    assertExists(result);
    assertEquals(result!.status, 413);
    const body = await result!.json();
    assertEquals(body.error, "Payload too large");
    assertEquals(body.max_chars, 500);
    assertEquals(body.received_chars, 501);
  });
});

Deno.test("getMaxInputChars: default is 2000000", () => {
  return withEnv({ MAX_INPUT_CHARS: undefined }, () => {
    assertEquals(getMaxInputChars(), 2_000_000);
  });
});

Deno.test("getMaxInputChars: respects env override", () => {
  return withEnv({ MAX_INPUT_CHARS: "50000" }, () => {
    assertEquals(getMaxInputChars(), 50000);
  });
});

Deno.test("getMaxInputChars: invalid env value -> default", () => {
  return withEnv({ MAX_INPUT_CHARS: "not-a-number" }, () => {
    assertEquals(getMaxInputChars(), 2_000_000);
  });
});
