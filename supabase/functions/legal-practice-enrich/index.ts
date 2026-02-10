import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await sb.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const limit = Math.min(body.limit || 5, 20);
    const countOnly = body.countOnly === true;
    const category = body.category || null; // e.g. 'criminal', 'civil', etc.

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminDb = createClient(supabaseUrl, supabaseServiceKey);

    // Count total needing enrichment
    let countQuery = adminDb
      .from("legal_practice_kb")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .or("legal_reasoning_summary.is.null,key_violations.is.null,case_number_anonymized.is.null");
    if (category) countQuery = countQuery.eq("practice_category", category);

    const { count: totalNeedEnrichment, error: countErr } = await countQuery;

    if (countErr) throw countErr;

    const remaining = totalNeedEnrichment || 0;

    if (countOnly) {
      return new Response(JSON.stringify({ success: true, remaining }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get batch of docs needing enrichment
    let fetchQuery = adminDb
      .from("legal_practice_kb")
      .select("id")
      .eq("is_active", true)
      .or("legal_reasoning_summary.is.null,key_violations.is.null,case_number_anonymized.is.null")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (category) fetchQuery = fetchQuery.eq("practice_category", category);

    const { data: docs, error: fetchErr } = await fetchQuery;

    if (fetchErr) throw fetchErr;

    const idsToEnrich = (docs || []).map(d => d.id);

    if (idsToEnrich.length === 0) {
      return new Response(JSON.stringify({ success: true, enriched: 0, message: "All documents already enriched" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let enriched = 0;
    const errors: string[] = [];

    // Process sequentially to avoid rate limits
    for (const docId of idsToEnrich) {
      try {
        const { data, error } = await sb.functions.invoke("legal-practice-import", {
          body: { enrichDocId: docId },
        });
        if (error) {
          errors.push(`${docId}: ${error.message}`);
        } else if (data?.enriched) {
          enriched++;
        }
      } catch (e) {
        errors.push(`${docId}: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      enriched,
      total: idsToEnrich.length,
      remaining: remaining - enriched,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("legal-practice-enrich error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Enrichment failed",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
