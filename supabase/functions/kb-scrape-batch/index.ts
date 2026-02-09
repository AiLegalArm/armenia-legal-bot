import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScrapeRequest {
  urls?: string[];
  sitemapUrl?: string;
  category: string;
  sourceName: string;
  limit?: number;
  searchQuery?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // === AUTH GUARD (admin-only) ===
    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await sb.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // === END AUTH GUARD ===

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');

    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body: ScrapeRequest = await req.json();
    
    let urlsToProcess: string[] = [];
    
    // Option 1: Use provided URLs directly
    if (body.urls && body.urls.length > 0) {
      urlsToProcess = body.urls;
      console.log(`Using ${urlsToProcess.length} provided URLs`);
    }
    // Option 2: Search for documents using Firecrawl search
    else if (body.searchQuery) {
      console.log('Searching for:', body.searchQuery);
      
      const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: body.searchQuery,
          limit: body.limit || 20,
        }),
      });

      const searchData = await searchResponse.json();
      console.log('Search response:', JSON.stringify(searchData).slice(0, 500));
      
      if (searchResponse.ok && searchData.data) {
        urlsToProcess = searchData.data.map((r: any) => r.url).filter(Boolean);
        console.log(`Found ${urlsToProcess.length} URLs from search`);
      }
    }
    // Option 3: Map a website
    else if (body.sitemapUrl) {
      console.log('Mapping website:', body.sitemapUrl);
      
      const mapResponse = await fetch('https://api.firecrawl.dev/v1/map', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: body.sitemapUrl,
          limit: 5000,
          includeSubdomains: true,
        }),
      });

      const mapData = await mapResponse.json();
      console.log('Map response links count:', mapData.links?.length || 0);
      
      if (!mapResponse.ok) {
        throw new Error(`Map failed: ${mapData.error || 'Unknown error'}`);
      }
      
      const allLinks = mapData.links || [];
      
      // Filter for document-like URLs
      urlsToProcess = allLinks.filter((url: string) => {
        const lower = url.toLowerCase();
        return lower.endsWith('.pdf') || 
               lower.includes('/pdf/') ||
               lower.includes('/document') ||
               lower.includes('/act/') ||
               lower.includes('/law/') ||
               lower.includes('/decision/') ||
               lower.includes('docid=') ||
               lower.includes('id=');
      });
      
      // If no specific URLs found, use first N pages
      if (urlsToProcess.length === 0 && allLinks.length > 0) {
        console.log('No document URLs found, using first pages');
        urlsToProcess = allLinks.slice(0, Math.min(body.limit || 50, allLinks.length));
      }
      
      console.log(`Found ${urlsToProcess.length} URLs from ${allLinks.length} total`);
    }

    if (urlsToProcess.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: 'No URLs to process. Try search query or provide URLs directly.',
          hint: 'Use search like: "Armenian law site:arlis.am"'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const batchLimit = Math.min(body.limit || 50, 100);
    const batchUrls = urlsToProcess.slice(0, batchLimit);
    
    const results: { url: string; status: string; title?: string; error?: string }[] = [];
    let successCount = 0;
    let errorCount = 0;

    const BATCH_SIZE = 3;
    for (let i = 0; i < batchUrls.length; i += BATCH_SIZE) {
      const batch = batchUrls.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (url) => {
        try {
          console.log(`Scraping: ${url}`);
          
          const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${firecrawlKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url,
              formats: ['markdown'],
              onlyMainContent: true,
              waitFor: 2000,
            }),
          });

          const scrapeData = await scrapeResponse.json();
          
          if (!scrapeResponse.ok || !scrapeData.success) {
            throw new Error(scrapeData.error || 'Scrape failed');
          }

          const content = scrapeData.data?.markdown || '';
          const metadata = scrapeData.data?.metadata || {};
          
          if (!content || content.length < 50) {
            throw new Error('Content too short');
          }

          const title = metadata.title || 
                       decodeURIComponent(url.split('/').pop() || '').replace(/[_-]/g, ' ') || 
                       'Untitled';

          const { error: insertError } = await supabase
            .from('knowledge_base')
            .insert({
              title: title.substring(0, 500),
              content_text: content.substring(0, 100000),
              category: body.category,
              source_name: body.sourceName,
              source_url: url,
              is_active: true,
            });

          if (insertError) {
            throw new Error(`DB: ${insertError.message}`);
          }

          successCount++;
          return { url, status: 'success', title: title.substring(0, 100) };
        } catch (error) {
          errorCount++;
          const msg = error instanceof Error ? error.message : 'Unknown';
          console.error(`Error ${url}:`, msg);
          return { url, status: 'error', error: msg };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      if (i + BATCH_SIZE < batchUrls.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalUrls: urlsToProcess.length,
        processed: batchUrls.length,
        successCount,
        errorCount,
        remainingUrls: urlsToProcess.length - batchUrls.length,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Batch scrape error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
