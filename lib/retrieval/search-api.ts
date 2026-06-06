import { readBm25Index } from "./persistence.ts";
import { searchBm25Index } from "./bm25-searcher.ts";
import type { BM25Index, SearchOptions, SearchResponse } from "./types.ts";

const DEFAULT_INDEX_PATH = "embeddings/bm25-index.json";

export async function searchWiki(
  query: string,
  options: SearchOptions & { index?: BM25Index } = {}
): Promise<SearchResponse> {
  const index = options.index ?? (await readBm25Index(options.indexPath ?? DEFAULT_INDEX_PATH));
  return searchBm25Index(index, query, options);
}
