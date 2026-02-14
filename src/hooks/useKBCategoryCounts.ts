import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type KbCategory = Database['public']['Enums']['kb_category'];

export interface CategoryCount {
  category: KbCategory;
  count: number;
}

export function useKBCategoryCounts() {
  return useQuery({
    queryKey: ['kb-category-counts'],
    queryFn: async () => {
      // Fetch all categories and their counts in one query
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('category')
        .eq('is_active', true);

      if (error) throw error;

      const counts = new Map<string, number>();
      for (const row of data || []) {
        const cat = row.category || 'other';
        counts.set(cat, (counts.get(cat) || 0) + 1);
      }

      return counts;
    },
  });
}

export function useKBCategoryDocuments(category: KbCategory | null) {
  return useQuery({
    queryKey: ['kb-category-docs', category],
    queryFn: async () => {
      if (!category) return [];

      const { data, error } = await supabase
        .from('knowledge_base')
        .select('*')
        .eq('is_active', true)
        .eq('category', category)
        .order('title', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!category,
  });
}
