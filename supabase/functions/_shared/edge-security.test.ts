/**
 * Tests for edge-security shared helpers.
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
  checkInternalAuth,
  checkInputSize,
  getMaxInputChars,
} from "./edge-security.ts";

// ─── CORS TESTS ────────────────────────────────────────────────────

Deno.test("getCorsHeaders: no ALLOWED_ORIGINS -> wildcard '*'", () => {
  // Ensure env is unset for this test
  const prev = Deno.env.get("ALLOWED_ORIGINS");
  Deno.env.delete("ALLOWED_ORIGINS");

  const headers = getCorsHeaders("https://evil.com");
  assertEquals(headers["Access-Control-Allow-Origin"], "*");
  assertEquals(headers["Vary"], undefined); // no Vary for wildcard

  if (prev) Deno.env.set("ALLOWED_ORIGINS", prev);
});

Deno.test("getCorsHeaders: allowed origin is reflected", () => {
  const prev = Deno.env.get("ALLOWED_ORIGINS");
  Deno.env.set("ALLOWED_ORIGINS", "https://app.example.com,https://admin.example.com");

  const headers = getCorsHeaders("https://admin.example.com");
  assertEquals(headers["Access-Control-Allow-Origin"], "https://admin.example.com");
  assertEquals(headers["Vary"], "Origin");

  if (prev) Deno.env.set("ALLOWED_ORIGINS", prev);
  else Deno.env.delete("ALLOWED_ORIGINS");
});

Deno.test("getCorsHeaders: disallowed origin -> first allowlisted origin", () => {
  const prev = Deno.env.get("ALLOWED_ORIGINS");
  Deno.env.set("ALLOWED_ORIGINS", "https://app.example.com,https://admin.example.com");

  const headers = getCorsHeaders("https://evil.com");
  assertEquals(headers["Access-Control-Allow-Origin"], "https://app.example.com");
  assertEquals(headers["Vary"], "Origin");

  if (prev) Deno.env.set("ALLOWED_ORIGINS", prev);
  else Deno.env.delete("ALLOWED_ORIGINS");
});

Deno.test("getCorsHeaders: null origin -> first allowlisted origin", () => {
  const prev = Deno.env.get("ALLOWED_ORIGINS");
  Deno.env.set("ALLOWED_ORIGINS", "https://app.example.com");

  const headers = getCorsHeaders(null);
  assertEquals(headers["Access-Control-Allow-Origin"], "https://app.example.com");

  if (prev) Deno.env.set("ALLOWED_ORIGINS", prev);
  else Deno.env.delete("ALLOWED_ORIGINS");
});

Deno.test("getCorsHeaders: includes x-internal-key in allowed headers", () => {
  const headers = getCorsHeaders(null);
  assertEquals(headers["Access-Control-Allow-Headers"].includes("x-internal-key"), true);
});

// ─── AUTH GUARD TESTS ──────────────────────────────────────────────

Deno.test("checkInternalAuth: no secret configured -> passes (null)", () => {
  const prev = Deno.env.get("INTERNAL_INGEST_KEY");
  Deno.env.delete("INTERNAL_INGEST_KEY");

  const req = new Request("https://example.com/test", {
    method: "POST",
    headers: {},
  });
  const result = checkInternalAuth(req, { "Access-Control-Allow-Origin": "*" });
  assertEquals(result, null);

  if (prev) Deno.env.set("INTERNAL_INGEST_KEY", prev);
});

Deno.test("checkInternalAuth: missing x-internal-key -> 401", async () => {
  const prev = Deno.env.get("INTERNAL_INGEST_KEY");
  Deno.env.set("INTERNAL_INGEST_KEY", "test-secret-key-12345");

  const req = new Request("https://example.com/test", {
    method: "POST",
    headers: {},
  });
  const result = checkInternalAuth(req, { "Access-Control-Allow-Origin": "*" });
  assertExists(result);
  assertEquals(result!.status, 401);

  const body = await result!.json();
  assertEquals(body.error, "Unauthorized");

  if (prev) Deno.env.set("INTERNAL_INGEST_KEY", prev);
  else Deno.env.delete("INTERNAL_INGEST_KEY");
});

Deno.test("checkInternalAuth: wrong key -> 401", async () => {
  const prev = Deno.env.get("INTERNAL_INGEST_KEY");
  Deno.env.set("INTERNAL_INGEST_KEY", "correct-key");

  const req = new Request("https://example.com/test", {
    method: "POST",
    headers: { "x-internal-key": "wrong-key" },
  });
  const result = checkInternalAuth(req, { "Access-Control-Allow-Origin": "*" });
  assertExists(result);
  assertEquals(result!.status, 401);
  await result!.text(); // consume body

  if (prev) Deno.env.set("INTERNAL_INGEST_KEY", prev);
  else Deno.env.delete("INTERNAL_INGEST_KEY");
});

Deno.test("checkInternalAuth: correct key -> passes (null)", () => {
  const prev = Deno.env.get("INTERNAL_INGEST_KEY");
  Deno.env.set("INTERNAL_INGEST_KEY", "correct-key");

  const req = new Request("https://example.com/test", {
    method: "POST",
    headers: { "x-internal-key": "correct-key" },
  });
  const result = checkInternalAuth(req, { "Access-Control-Allow-Origin": "*" });
  assertEquals(result, null);

  if (prev) Deno.env.set("INTERNAL_INGEST_KEY", prev);
  else Deno.env.delete("INTERNAL_INGEST_KEY");
});

// ─── INPUT SIZE LIMIT TESTS ────────────────────────────────────────

Deno.test("checkInputSize: text within limit -> passes (null)", () => {
  const prev = Deno.env.get("MAX_INPUT_CHARS");
  Deno.env.set("MAX_INPUT_CHARS", "1000");

  const result = checkInputSize("A".repeat(999), { "Access-Control-Allow-Origin": "*" });
  assertEquals(result, null);

  if (prev) Deno.env.set("MAX_INPUT_CHARS", prev);
  else Deno.env.delete("MAX_INPUT_CHARS");
});

Deno.test("checkInputSize: text at exact limit -> passes (null)", () => {
  const prev = Deno.env.get("MAX_INPUT_CHARS");
  Deno.env.set("MAX_INPUT_CHARS", "500");

  const result = checkInputSize("B".repeat(500), { "Access-Control-Allow-Origin": "*" });
  assertEquals(result, null);

  if (prev) Deno.env.set("MAX_INPUT_CHARS", prev);
  else Deno.env.delete("MAX_INPUT_CHARS");
});

Deno.test("checkInputSize: text exceeds limit -> 413", async () => {
  const prev = Deno.env.get("MAX_INPUT_CHARS");
  Deno.env.set("MAX_INPUT_CHARS", "500");

  const result = checkInputSize("C".repeat(501), { "Access-Control-Allow-Origin": "*" });
  assertExists(result);
  assertEquals(result!.status, 413);

  const body = await result!.json();
  assertEquals(body.error, "Payload too large");
  assertEquals(body.max_chars, 500);
  assertEquals(body.received_chars, 501);

  if (prev) Deno.env.set("MAX_INPUT_CHARS", prev);
  else Deno.env.delete("MAX_INPUT_CHARS");
});

Deno.test("getMaxInputChars: default is 2000000", () => {
  const prev = Deno.env.get("MAX_INPUT_CHARS");
  Deno.env.delete("MAX_INPUT_CHARS");

  assertEquals(getMaxInputChars(), 2_000_000);

  if (prev) Deno.env.set("MAX_INPUT_CHARS", prev);
});

Deno.test("getMaxInputChars: respects env override", () => {
  const prev = Deno.env.get("MAX_INPUT_CHARS");
  Deno.env.set("MAX_INPUT_CHARS", "50000");

  assertEquals(getMaxInputChars(), 50000);

  if (prev) Deno.env.set("MAX_INPUT_CHARS", prev);
  else Deno.env.delete("MAX_INPUT_CHARS");
});

Deno.test("getMaxInputChars: invalid env value -> default", () => {
  const prev = Deno.env.get("MAX_INPUT_CHARS");
  Deno.env.set("MAX_INPUT_CHARS", "not-a-number");

  assertEquals(getMaxInputChars(), 2_000_000);

  if (prev) Deno.env.set("MAX_INPUT_CHARS", prev);
  else Deno.env.delete("MAX_INPUT_CHARS");
});
