import { Index } from "@upstash/vector";

// Shared Upstash Vector client — used by both ingest script and API route
export const vectorIndex = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL!,
  token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
});

export interface VectorResult {
  id: string;
  score: number;
  data: string;
  metadata: {
    source_url: string;
    page_title: string;
    section: string;
  };
}

// Minimum similarity score to consider a result relevant
const MIN_SCORE_THRESHOLD = 0.5;

/**
 * Query the Jumbo88 knowledge base for chunks relevant to the user's message.
 * Returns top-k results with metadata for source attribution.
 * Filters out results below the minimum relevance score threshold.
 */
export async function queryKnowledge(
  query: string,
  topK = 5,
): Promise<VectorResult[]> {
  const results = await vectorIndex.query<{
    source_url: string;
    page_title: string;
    section: string;
  }>({
    data: query,
    topK,
    includeMetadata: true,
    includeData: true,
  });

  return results
    .filter((r) => r.metadata && r.data && r.score >= MIN_SCORE_THRESHOLD)
    .map((r) => ({
      id: String(r.id),
      score: r.score,
      data: r.data!,
      metadata: r.metadata!,
    }));
}
