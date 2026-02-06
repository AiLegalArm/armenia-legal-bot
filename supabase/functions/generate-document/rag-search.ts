// =============================================================================
// RAG SEARCH FOR DOCUMENT GENERATION
// =============================================================================

export async function searchKnowledgeBase(
  query: string, 
  supabaseUrl: string, 
  supabaseKey: string
): Promise<string> {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/search_knowledge_base`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        search_query: query,
        result_limit: 5
      })
    });

    if (!response.ok) {
      console.error('KB search failed:', response.status);
      return '';
    }

    const results = await response.json();
    
    if (!results || results.length === 0) {
      return '';
    }

    return results.map((r: any) => 
      `[\u0411\u0430\u0437\u0430 \u0437\u043D\u0430\u043D\u0438\u0439: ${r.category}] ${r.title}\n${r.content_text.substring(0, 1500)}`
    ).join('\n\n---\n\n');
  } catch (error) {
    console.error('KB search error:', error);
    return '';
  }
}

export async function searchLegalPractice(
  query: string, 
  supabaseUrl: string, 
  supabaseKey: string,
  category?: string
): Promise<string> {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/search_legal_practice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        search_query: query,
        result_limit: 3,
        category: category || null
      })
    });

    if (!response.ok) {
      console.error('Legal practice search failed:', response.status);
      return '';
    }

    const results = await response.json();
    
    if (!results || results.length === 0) {
      return '';
    }

    return results.map((r: any) => 
      `[\u0410\u043D\u0430\u043B\u043E\u0433 \u0434\u0430\u0442\u0430\u043A\u0430\u043D \u043F\u0440\u0430\u043A\u057F\u056B\u056F\u0561 (KB)] ${r.title}
\u0422\u0438\u043F \u0441\u0443\u0434\u0430: ${r.court_type} | \u0418\u0441\u0445\u043E\u0434: ${r.outcome}
${r.legal_reasoning_summary || ''}
${r.content_snippet || ''}`
    ).join('\n\n---\n\n');
  } catch (error) {
    console.error('Legal practice search error:', error);
    return '';
  }
}

// Build search query based on document category and template
export function buildSearchQuery(
  category: string, 
  templateName: string
): string[] {
  const searchTerms: string[] = [];
  
  // Category-specific terms
  if (category === 'civil') {
    searchTerms.push('\u0563\u0580\u0561\u0581\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576', '\u0413\u041F\u041A \u0420\u0410', '\u0413\u041A \u0420\u0410');
  } else if (category === 'criminal') {
    searchTerms.push('\u0584\u0580\u0565\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576', '\u0423\u041F\u041A \u0420\u0410', '\u0423\u041A \u0420\u0410');
  } else if (category === 'administrative') {
    searchTerms.push('\u057E\u0561\u0580\u0579\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576', '\u0412\u0414\u041A \u0420\u0410');
  } else if (category === 'echr') {
    searchTerms.push('ECHR', '\u0535\u054D\u054A\u0540', 'Convention', '\u0415\u0421\u041F\u0427');
  }
  
  // Add template name for more specific search
  searchTerms.push(templateName);
  
  return searchTerms;
}

// Map category to legal practice category for filtering
export function mapCategoryToPracticeCategory(category: string): string | undefined {
  const mapping: Record<string, string> = {
    'civil': 'civil',
    'criminal': 'criminal',
    'administrative': 'administrative',
    'echr': 'echr'
  };
  return mapping[category];
}
