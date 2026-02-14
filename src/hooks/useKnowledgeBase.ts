import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import type { Database } from '@/integrations/supabase/types';

type KnowledgeBase = Database['public']['Tables']['knowledge_base']['Row'];
type KnowledgeBaseInsert = Database['public']['Tables']['knowledge_base']['Insert'];
type KnowledgeBaseUpdate = Database['public']['Tables']['knowledge_base']['Update'];
type KbCategory = Database['public']['Enums']['kb_category'];

export interface KBFilters {
  search?: string;
  category?: KbCategory | 'all';
  page?: number;
  pageSize?: number;
}

export interface KBSearchResult {
  id: string;
  title: string;
  content_text: string;
  category: KbCategory;
  source_name: string | null;
  version_date: string | null;
  rank: number | null;
}

export interface KBChunkSearchResult {
  id: string;
  title: string;
  category: string;
  source_name: string | null;
  article_number: string | null;
  source_url: string | null;
  max_score: number;
  content_text: string; // first chunk excerpt as fallback
  chunks: Array<{
    doc_id: string;
    chunk_index: number;
    chunk_type: string;
    label: string | null;
    char_start: number;
    excerpt: string;
    full_text: string | null;
    score: number;
  }>;
}

export function useKnowledgeBase(filters: KBFilters = {}) {
  const { toast } = useToast();
  const { t } = useTranslation('kb');
  const queryClient = useQueryClient();

  const page = filters.page || 1;
  const pageSize = filters.pageSize || 20;
  const offset = (page - 1) * pageSize;

  // Chunk-level search using PostgreSQL RPC
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['kb-search', filters.search, filters.category],
    queryFn: async () => {
      if (!filters.search || filters.search.length < 2) return null;
      
      const { data, error } = await supabase
        .rpc('search_kb_chunks', {
          p_query: filters.search,
          p_category: filters.category && filters.category !== 'all' ? filters.category : null,
          p_limit_chunks: 50,
          p_limit_docs: 10,
          p_chunks_per_doc: 3,
        });
      
      if (error) throw error;
      
      const parsed = data as unknown as {
        documents: Array<{
          id: string; title: string; category: string;
          source_name: string | null; article_number: string | null;
          source_url: string | null; max_score: number;
        }>;
        chunks: Array<{
          doc_id: string; chunk_index: number; chunk_type: string;
          label: string | null; char_start: number; excerpt: string;
          full_text: string | null; score: number;
        }>;
      };
      
      // Group chunks by doc_id
      const chunksByDoc = new Map<string, typeof parsed.chunks>();
      for (const chunk of parsed.chunks || []) {
        const arr = chunksByDoc.get(chunk.doc_id) || [];
        arr.push(chunk);
        chunksByDoc.set(chunk.doc_id, arr);
      }
      
      const isArticleQuery = /(?:\u0540\u0578\u0564\u057E\u0561\u056E|\u0421\u0442\u0430\u0442\u044C\u044F|Article)\s*\d+/i.test(filters.search || '');

      return (parsed.documents || [])
        .filter((doc) => {
          if (isArticleQuery) return true;
          const score = Number(doc.max_score);
          return Number.isFinite(score) && Math.round(score * 100) >= 50;
        })
        .map((doc): KBChunkSearchResult => {
          const docChunks = chunksByDoc.get(doc.id) || [];
          const excerpt = docChunks[0]?.excerpt || '';
          return {
            ...doc,
            content_text: excerpt.substring(0, 500),
            chunks: docChunks,
          };
        });
    },
    enabled: !!filters.search && filters.search.length >= 2,
  });

  // List all documents with pagination
  const { data: listData, isLoading: isListing } = useQuery({
    queryKey: ['kb-list', filters.category, page, pageSize],
    queryFn: async () => {
      let query = supabase
        .from('knowledge_base')
        .select('*', { count: 'exact' })
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (filters.category && filters.category !== 'all') {
        query = query.eq('category', filters.category);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      
      return {
        items: data as KnowledgeBase[],
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize),
      };
    },
    enabled: !filters.search || filters.search.length < 2,
  });

  // Create document (admin only)
  const createDocument = useMutation({
    mutationFn: async (doc: KnowledgeBaseInsert) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('knowledge_base')
        .insert({
          ...doc,
          uploaded_by: user.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-list'] });
      queryClient.invalidateQueries({ queryKey: ['kb-search'] });
      toast({ title: t('document_uploaded') });
    },
    onError: (error) => {
      toast({
        title: t('errors:operation_failed', 'Operation failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Update document (admin only)
  const updateDocument = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: KnowledgeBaseUpdate }) => {
      const { data, error } = await supabase
        .from('knowledge_base')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-list'] });
      queryClient.invalidateQueries({ queryKey: ['kb-search'] });
      queryClient.invalidateQueries({ queryKey: ['kb-document'] });
      toast({ title: t('document_updated') });
    },
    onError: (error) => {
      toast({
        title: t('errors:operation_failed', 'Operation failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Soft delete (deactivate) document (admin only)
  const deleteDocument = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('knowledge_base')
        .update({ is_active: false })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-list'] });
      queryClient.invalidateQueries({ queryKey: ['kb-search'] });
      toast({ title: t('document_deleted') });
    },
    onError: (error) => {
      toast({
        title: t('errors:operation_failed', 'Operation failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const isLoading = isSearching || isListing;
  const documents = filters.search && filters.search.length >= 2 
    ? searchResults || [] 
    : listData?.items || [];
  const pagination = listData ? {
    page: listData.page,
    pageSize: listData.pageSize,
    total: listData.total,
    totalPages: listData.totalPages,
  } : null;

  return {
    documents,
    pagination,
    isLoading,
    createDocument,
    updateDocument,
    deleteDocument,
  };
}

// Get single document
export function useKBDocument(id: string | undefined) {
  return useQuery({
    queryKey: ['kb-document', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as KnowledgeBase;
    },
    enabled: !!id,
  });
}

// Get version history for a document
export function useKBVersions(kbId: string | undefined) {
  return useQuery({
    queryKey: ['kb-versions', kbId],
    queryFn: async () => {
      if (!kbId) return [];
      const { data, error } = await supabase
        .from('kb_versions')
        .select('*')
        .eq('kb_id', kbId)
        .order('version_number', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!kbId,
  });
}
