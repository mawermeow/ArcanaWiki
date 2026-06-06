import { embedQueryText } from "./embedding-client.ts";
import { getActiveVectorDocuments } from "./vector-cache.ts";
import { cosineSimilarity } from "./cosine.ts";
import type { RejectedResult, VectorCache, VectorSearchDiagnostics, VectorSearchOptions, VectorSearchResponse, VectorSearchResult } from "./types.ts";

const DEFAULT_VECTOR_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

export async function searchVectorCache(
  cache: VectorCache,
  query: string,
  options: VectorSearchOptions = {}
): Promise<VectorSearchResponse> {
  const topK = options.topK ?? 8;
  const minScore = options.minScore ?? 0;
  const embeddingModel = options.embeddingModel ?? cache.embeddingModel ?? DEFAULT_VECTOR_MODEL;

  let queryVector = options.queryVector;
  let queryEmbeddingModel = embeddingModel;

  if (!queryVector) {
    if (options.liveQueryEmbedding === false) {
      throw new Error(
        "Vector search requires a query embedding. Pass `queryVector` or enable `liveQueryEmbedding`."
      );
    }
    const embedder = options.embedQuery ?? (async (text: string, model: string) => {
      const response = await embedQueryText(text, model);
      queryEmbeddingModel = response.model;
      return response.vector;
    });
    queryVector = await embedder(query, embeddingModel);
  }

  const activeDocuments = getActiveVectorDocuments(cache);
  const ranked = activeDocuments
    .map((document) => ({
      document,
      score: cosineSimilarity(queryVector!, document.vector)
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.document.chunkId.localeCompare(right.document.chunkId, "en");
    });

  const kept = ranked.filter((item) => item.score >= minScore).slice(0, topK);
  const results: VectorSearchResult[] = kept.map((item) => ({
    score: Number(item.score.toFixed(6)),
    pageId: item.document.pageId,
    chunkId: item.document.chunkId,
    title: item.document.title,
    sectionTitle: item.document.sectionTitle,
    source: "vector",
    metadata: item.document.metadata
  }));

  const rejectedResults: RejectedResult[] = ranked
    .filter((item, index) => item.score < minScore || index >= topK)
    .map((item) => ({
      pageId: item.document.pageId,
      chunkId: item.document.chunkId,
      score: Number(item.score.toFixed(6)),
      reason: item.score < minScore ? "below_min_score" : "outside_top_k"
    }));

  const diagnostics: VectorSearchDiagnostics = {
    queryEmbeddingModel,
    candidateCount: activeDocuments.length,
    rawScores: ranked.map((item) => ({
      pageId: item.document.pageId,
      chunkId: item.document.chunkId,
      score: Number(item.score.toFixed(6))
    })),
    rejectedResults,
    topK,
    minScore
  };

  return {
    query,
    results,
    diagnostics
  };
}
