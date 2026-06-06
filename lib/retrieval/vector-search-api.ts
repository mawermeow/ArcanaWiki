import { readVectorCache } from "./persistence.ts";
import { searchVectorCache } from "./vector-searcher.ts";
import type { VectorCache, VectorSearchOptions, VectorSearchResponse } from "./types.ts";

const DEFAULT_VECTOR_CACHE_PATH = "embeddings/vector-cache.json";

export async function searchWikiVector(
  query: string,
  options: VectorSearchOptions & { cache?: VectorCache } = {}
): Promise<VectorSearchResponse> {
  const cache = options.cache ?? (await readVectorCache(options.cachePath ?? DEFAULT_VECTOR_CACHE_PATH));
  return searchVectorCache(cache, query, options);
}
