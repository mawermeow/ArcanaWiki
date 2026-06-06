import { readBm25Index } from "./persistence.ts";
import { readVectorCache } from "./persistence.ts";
import { readRelationGraph } from "./graph-loader.ts";
import { searchBm25Index } from "./bm25-searcher.ts";
import { searchHybridIndex } from "./hybrid-searcher.ts";
import type {
  BM25Index,
  HybridSearchOptions,
  HybridSearchResponse,
  SearchOptions,
  SearchResponse,
  VectorCache
} from "./types.ts";

const DEFAULT_INDEX_PATH = "embeddings/bm25-index.json";
const DEFAULT_VECTOR_CACHE_PATH = "embeddings/vector-cache.json";
const DEFAULT_GRAPH_PATH = "relations/graph.json";

export async function searchWiki(
  query: string,
  options: SearchOptions & { index?: BM25Index } = {}
): Promise<SearchResponse> {
  const index = options.index ?? (await readBm25Index(options.indexPath ?? DEFAULT_INDEX_PATH));
  return searchBm25Index(index, query, options);
}

export async function searchWikiHybrid(
  query: string,
  options: HybridSearchOptions = {}
): Promise<HybridSearchResponse> {
  const index = options.index ?? (await readBm25Index(options.indexPath ?? DEFAULT_INDEX_PATH));
  const cache = options.cache ?? (await readVectorCache(options.cachePath ?? DEFAULT_VECTOR_CACHE_PATH));
  const graph = options.graph ?? (await readRelationGraph(options.graphPath ?? DEFAULT_GRAPH_PATH));
  return searchHybridIndex(index, cache, graph, query, options);
}

export { searchWikiVector } from "./vector-search-api.ts";
