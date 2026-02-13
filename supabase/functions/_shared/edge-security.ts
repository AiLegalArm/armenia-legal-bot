/**
 * edge-security.ts
 *
 * Problem:
 *   Internal ingestion endpoints (legal-chunker, legal-document-normalizer)
 *   use wildcard CORS, no auth guard, and no input size limits. This exposes
 *   them to cross-origin abuse, unauthorized access, and denial-of-service
 *   via oversized payloads.
 *
 * Risk:
 *   - Any origin can call these endpoints (data exfiltration / abuse)
 *   - No authentication on ingestion pipeline (unauthorized writes)
 *   - Unbounded input size allows memory exhaustion attacks
 *
 * Solution:
 *   Shared helpers that:
 *   1) Build CORS headers from an ALLOWED_ORIGINS env allowlist
 *   2) Validate x-internal-key against INTERNAL_INGEST_KEY secret
 *   3) Enforce MAX_INPUT_CHARS (default 2_000_000) on text payloads
 */

// ─── CORS ALLOWLIST ─────────────────────────────────────────────────

const DEFAULT_ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-internal-key, " +
  "x-supabase-client-platform, x-supabase-client-platform-version, " +
  "x-supabase-client-runtime, x-supabase-client-runtime-version";

function getAllowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS") || "";
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * Build CORS headers based on the request Origin and the ALLOWED_ORIGINS env.
 *
 * Strategy: If the request origin is in the allowlist, reflect it.
 * Otherwise, use the first allowlisted origin as default (safe: browser
 * won't send cookies/credentials to a non-matching origin).
 * If ALLOWED_ORIGINS is empty/unset, fall back to "*" for dev environments.
 */
export function getCorsHeaders(requestOrigin?: string | null): Record<string, string> {
  const allowed = getAllowedOrigins();

  let origin: string;
  if (allowed.length === 0) {
    // No allowlist configured (dev mode) -> permissive
    origin = "*";
  } else if (requestOrigin && allowed.includes(requestOrigin)) {
    origin = requestOrigin;
  } else {
    origin = allowed[0];
  }

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": DEFAULT_ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // Vary: Origin is critical when origin is not "*"
  if (origin !== "*") {
    headers["Vary"] = "Origin";
  }

  return headers;
}

// ─── AUTH GUARD ─────────────────────────────────────────────────────

/**
 * Validate x-internal-key header against INTERNAL_INGEST_KEY secret.
 * Returns null if valid, or a 401 Response if invalid.
 */
export function checkInternalAuth(
  req: Request,
  corsHeaders: Record<string, string>,
): Response | null {
  const secret = Deno.env.get("INTERNAL_INGEST_KEY");
  if (!secret) {
    // No secret configured -> skip guard (dev mode)
    return null;
  }

  const provided = req.headers.get("x-internal-key");
  if (!provided || provided !== secret) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  return null;
}

// ─── INPUT SIZE LIMIT ──────────────────────────────────────────────

const DEFAULT_MAX_CHARS = 2_000_000;

export function getMaxInputChars(): number {
  const raw = Deno.env.get("MAX_INPUT_CHARS");
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_MAX_CHARS;
}

/**
 * Check if text exceeds MAX_INPUT_CHARS. Returns null if OK, or 413 Response.
 */
export function checkInputSize(
  text: string,
  corsHeaders: Record<string, string>,
): Response | null {
  const limit = getMaxInputChars();
  if (text.length > limit) {
    return new Response(
      JSON.stringify({
        error: "Payload too large",
        max_chars: limit,
        received_chars: text.length,
      }),
      {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  return null;
}
