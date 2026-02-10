import { supabase } from "@/integrations/supabase/client";

type ChunkingProgress = {
  processedDocs: number;
  totalRemaining: number;
  totalChunksInserted: number;
};

/**
 * Runs kb-backfill-chunks in a loop until all documents are processed.
 * Each call processes up to `batchLimit` docs (default 10).
 * Returns cumulative stats.
 */
export async function runBatchChunking(opts?: {
  chunkSize?: number;
  batchLimit?: number;
  onProgress?: (p: ChunkingProgress) => void;
  signal?: AbortSignal;
}): Promise<ChunkingProgress> {
  const chunkSize = opts?.chunkSize ?? 8000;
  const batchLimit = opts?.batchLimit ?? 10;
  let totalProcessed = 0;
  let totalChunks = 0;
  let remaining = Infinity;

  while (remaining > 0) {
    if (opts?.signal?.aborted) break;

    const { data, error } = await supabase.functions.invoke('kb-backfill-chunks', {
      body: { chunkSize, batchLimit },
    });

    if (error) throw error;

    const batchProcessed = data?.processedDocs ?? 0;
    remaining = data?.totalRemaining ?? 0;
    totalProcessed += batchProcessed;
    totalChunks += data?.totalChunksInserted ?? 0;

    opts?.onProgress?.({
      processedDocs: totalProcessed,
      totalRemaining: remaining,
      totalChunksInserted: totalChunks,
    });

    // If nothing was processed this round, stop to avoid infinite loop
    if (batchProcessed === 0) break;
  }

  return { processedDocs: totalProcessed, totalRemaining: remaining, totalChunksInserted: totalChunks };
}
