/**
 * edge-security.ts — Fail-closed perimeter guards.
 *
 * Env vars:
 *   ALLOWED_ORIGINS        – comma-separated allowlist (REQUIRED in prod)
 *   ALLOW_WILDCARD_CORS    – set to "true" to allow "*" when ALLOWED_ORIGINS is missing
 *   INTERNAL_INGEST_KEY    – shared secret for x-internal-key header (REQUIRED in prod)
 *   ALLOW_UNAUTH_INGEST    – set to "true" to bypass auth when key is missing
 *   MAX_INPUT_CHARS         – max text length (default 2 000 000)
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

function isWildcardAllowed(): boolean {
  return Deno.env.get("ALLOW_WILDCARD_CORS") === "true";
}

/**
 * Build CORS headers. Fail-closed:
 * - If ALLOWED_ORIGINS is unset and ALLOW_WILDCARD_CORS !== "true" → returns null (caller must 403).
 * - If origin matches allowlist → reflect it.
 * - If origin doesn't match → use first allowlisted origin.
 * - If wildcard explicitly allowed → "*".
 */
export function getCorsHeaders(requestOrigin?: string | null): Record<string, string> | null {
  const allowed = getAllowedOrigins();

  if (allowed.length === 0) {
    if (isWildcardAllowed()) {
      return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": DEFAULT_ALLOWED_HEADERS,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      };
    }
    // Fail-closed: CORS not configured
    return null;
  }

  let origin: string;
  if (requestOrigin && allowed.includes(requestOrigin)) {
    origin = requestOrigin;
  } else {
    origin = allowed[0];
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": DEFAULT_ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

/**
 * Handle CORS preflight or reject if CORS is not configured.
 * Returns a Response for OPTIONS or when CORS is misconfigured; null to continue.
 */
export function handleCors(req: Request): { corsHeaders: Record<string, string>; errorResponse?: Response } | { corsHeaders?: undefined; errorResponse: Response } {
  const headers = getCorsHeaders(req.headers.get("origin"));

  if (!headers) {
    // CORS not configured – fail-closed
    const fallback = { "Content-Type": "application/json" };
    if (req.method === "OPTIONS") {
      return {
        errorResponse: new Response(JSON.stringify({ error: "CORS not configured" }), {
          status: 403,
          headers: fallback,
        }),
      };
    }
    return {
      errorResponse: new Response(JSON.stringify({ error: "CORS not configured" }), {
        status: 403,
        headers: fallback,
      }),
    };
  }

  if (req.method === "OPTIONS") {
    return {
      corsHeaders: headers,
      errorResponse: new Response(null, { status: 204, headers }),
    };
  }

  return { corsHeaders: headers };
}

// ─── AUTH GUARD ─────────────────────────────────────────────────────

function isUnauthAllowed(): boolean {
  return Deno.env.get("ALLOW_UNAUTH_INGEST") === "true";
}

/**
 * Validate x-internal-key header against INTERNAL_INGEST_KEY secret.
 * Fail-closed: if secret is missing and ALLOW_UNAUTH_INGEST !== "true" → 500.
 */
export function checkInternalAuth(
  req: Request,
  corsHeaders: Record<string, string>,
): Response | null {
  const secret = Deno.env.get("INTERNAL_INGEST_KEY");

  if (!secret) {
    if (isUnauthAllowed()) {
      return null; // Explicit dev bypass
    }
    // Fail-closed: server misconfigured
    return new Response(
      JSON.stringify({ error: "Server misconfigured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
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
