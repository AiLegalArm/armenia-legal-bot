import { supabase } from "@/integrations/supabase/client";

type EmbeddingProgress = {
  processedDocs: number;
  totalRemaining: number;
  errors?: string[];
};

/**
 * Runs generate-embeddings in a loop until all documents are processed.
 * Each call processes up to `batchLimit` docs (default 10).
 */
export async function runBatchEmbedding(opts: {
  table: "knowledge_base" | "legal_practice_kb";
  batchLimit?: number;
  onProgress?: (p: EmbeddingProgress) => void;
  signal?: AbortSignal;
}): Promise<EmbeddingProgress> {
  const batchLimit = opts.batchLimit ?? 5;
  let totalProcessed = 0;
  let remaining = Infinity;
  const allErrors: string[] = [];

  while (remaining > 0) {
    if (opts.signal?.aborted) break;

    const { data, error } = await supabase.functions.invoke("generate-embeddings", {
      body: { table: opts.table, batchLimit },
    });

    if (error) throw error;

    const batchProcessed = data?.processedDocs ?? 0;
    remaining = data?.totalRemaining ?? 0;
    totalProcessed += batchProcessed;
    
    if (data?.errors) allErrors.push(...data.errors);

    opts.onProgress?.({
      processedDocs: totalProcessed,
      totalRemaining: remaining,
      errors: allErrors.length > 0 ? allErrors : undefined,
    });

    // If nothing was processed this round, stop to avoid infinite loop
    if (batchProcessed === 0) break;
  }

  return {
    processedDocs: totalProcessed,
    totalRemaining: remaining,
    errors: allErrors.length > 0 ? allErrors : undefined,
  };
}
