// -*- coding: utf-8 -*-
// Encoding: UTF-8
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Parse Armenian legal code text into articles
function parseCodeText(text: string, codeName: string, category: string): Array<{
  title: string;
  content_text: string;
  article_number: string;
  category: string;
  source_name: string;
}> {
  const articles: Array<{
    title: string;
    content_text: string;
    article_number: string;
    category: string;
    source_name: string;
  }> = [];

  // Normalize Unicode to NFC form for consistent Armenian text processing
  // This prevents issues with different Unicode representations of Armenian characters
  text = text.normalize('NFC');

  // Pattern to match Armenian articles: Հոդված X. (Article X.)
  // Supports multiple formats:
  // - Հոդված 1. Title
  // - Հոդված 1.1. Title  
  // - Հոդված 1. Title (all caps)
  // Armenian "Հոդված" in both direct form and Unicode escape as fallback
  const articlePattern = /(?:⚖️?)?\s*(?:Հոդված|\u0540\u0578\u0564\u057E\u0561\u056E)\s*(\d+(?:\.\d+)?)\.\s*([^\n]+)/gi;
  
  let match;
  const matches: Array<{ index: number; number: string; title: string }> = [];
  
  while ((match = articlePattern.exec(text)) !== null) {
    matches.push({
      index: match.index,
      number: match[1],
      title: match[2].trim()
    });
  }

  // If no matches with standard pattern, try alternative patterns
  if (matches.length === 0) {
    // Try pattern with number patterns like "1." at line start
    const altPattern = /^(\d+(?:\.\d+)?)\.\s+([^\n]+)/gm;
    while ((match = altPattern.exec(text)) !== null) {
      matches.push({
        index: match.index,
        number: match[1],
        title: match[2].trim()
      });
    }
  }

  // Extract content between articles
  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i];
    const nextMatch = matches[i + 1];
    
    const startIndex = currentMatch.index;
    const endIndex = nextMatch ? nextMatch.index : text.length;
    
    let content = text.substring(startIndex, endIndex).trim();
    
    // Clean up content
    content = content
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (content.length > 50) { // Only add if has meaningful content
      articles.push({
        title: `${codeName} - Հոդված ${currentMatch.number}. ${currentMatch.title}`,
        content_text: content,
        article_number: currentMatch.number,
        category: category,
        source_name: codeName
      });
    }
  }

  return articles;
}

// KB category enum type matching Database['public']['Enums']['kb_category']
type KBCategory = 
  | "constitution" 
  | "civil_code" 
  | "criminal_code" 
  | "labor_code" 
  | "family_code" 
  | "administrative_code" 
  | "tax_code" 
  | "court_practice" 
  | "legal_commentary" 
  | "other" 
  | "criminal_procedure_code" 
  | "civil_procedure_code" 
  | "administrative_procedure_code" 
  | "administrative_violations_code" 
  | "land_code" 
  | "forest_code" 
  | "water_code" 
  | "urban_planning_code" 
  | "electoral_code" 
  | "state_duty_law" 
  | "citizenship_law" 
  | "public_service_law" 
  | "human_rights_law" 
  | "anti_corruption_body_law" 
  | "corruption_prevention_law" 
  | "mass_media_law" 
  | "education_law" 
  | "healthcare_law" 
  | "echr" 
  | "eaeu_customs_code";

interface KBImportRequest {
  textContent: string;
  codeName: string;
  category: KBCategory;
  clearExisting?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // === AUTH GUARD ===
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
    // === END AUTH GUARD ===

    const { textContent, codeName, category, clearExisting } = await req.json() as KBImportRequest;

    if (!textContent || !codeName || !category) {
      return new Response(JSON.stringify({ 
        error: "textContent, codeName, and category are required" 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize Unicode and remove null bytes that PostgreSQL cannot store
    const normalizedContent = textContent
      .normalize('NFC')
      .replace(/\u0000/g, ''); // Remove null bytes

    // Debug: Log first 500 chars and their Unicode codes
    const first500 = normalizedContent.substring(0, 500);
    const charCodes = first500.split('').slice(0, 100).map((c: string) => ({
      char: c,
      code: c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')
    }));
    console.log("=== DEBUG: First 500 chars of input ===");
    console.log(first500);
    console.log("=== DEBUG: First 100 char codes ===");
    console.log(JSON.stringify(charCodes));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Optionally clear existing entries
    if (clearExisting) {
      await supabase
        .from("knowledge_base")
        .update({ is_active: false })
        .eq("is_active", true);
    }

    // Parse the text into articles (using normalized content)
    const articles = parseCodeText(normalizedContent, codeName, category);

    if (articles.length === 0) {
      return new Response(JSON.stringify({ 
        error: "No articles found in the provided text",
        hint: "Expected format: Հոդված X. Title"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert articles in batches
    const batchSize = 50;
    let inserted = 0;
    
    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, i + batchSize);
      const { error } = await supabase
        .from("knowledge_base")
        .insert(batch.map(a => ({
          ...a,
          is_active: true,
          version_date: new Date().toISOString().split('T')[0]
        })));

      if (error) {
        console.error("Insert error:", error);
        throw error;
      }
      inserted += batch.length;
    }

    return new Response(JSON.stringify({
      success: true,
      imported: inserted,
      codeName,
      category,
      sampleTitles: articles.slice(0, 3).map(a => a.title)
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("kb-import error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Import failed" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});