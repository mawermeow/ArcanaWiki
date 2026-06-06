import { createContentHash } from "./hash.ts";
import { normalizeText } from "./normalizer.ts";
import type {
  RetrievalDocument,
  VectorCache,
  VectorCacheBuildSummary,
  VectorCacheDocument
} from "./types.ts";

export type EmbeddingClientLike = {
  embedTexts(texts: string[], model: string): Promise<{
    model: string;
    vectors: number[][];
    dimension: number;
  }>;
};

export function createVectorText(document: RetrievalDocument): string {
  return normalizeText(
    [
      document.title,
      document.sectionPath.join(" > "),
      document.tags.join("、"),
      document.topics.join("、"),
      document.keywords.join("、"),
      document.relatedCards.join("、"),
      document.content
    ]
      .filter(Boolean)
      .join("\n\n")
  );
}

export function createVectorCacheDocument(
  document: RetrievalDocument,
  vector: number[],
  contentHash = createContentHash(createVectorText(document))
): VectorCacheDocument {
  return {
    chunkId: document.chunkId,
    pageId: document.pageId,
    contentHash,
    text: createVectorText(document),
    title: document.title,
    sectionTitle: document.sectionTitle,
    metadata: {
      pageType: document.pageType,
      path: document.path,
      tags: document.tags,
      topics: document.topics,
      keywords: document.keywords,
      relatedCards: document.relatedCards,
      sectionPath: document.sectionPath
    },
    vector
  };
}

export function createEmptyVectorCache(model = "", dimension = 0): VectorCache {
  return {
    embeddingModel: model,
    embeddingDimension: dimension,
    generatedAt: "",
    documents: []
  };
}

export function getActiveVectorDocuments(cache: VectorCache): VectorCacheDocument[] {
  return cache.documents.filter((document) => document.metadata.stale !== true);
}

export function buildVectorCachePlan(
  documents: RetrievalDocument[],
  currentCache: VectorCache,
  embeddingModel: string
): {
  reused: VectorCacheDocument[];
  toGenerate: Array<{
    document: RetrievalDocument;
    contentHash: string;
    text: string;
  }>;
  stale: VectorCacheDocument[];
} {
  const activeCache = new Map(
    getActiveVectorDocuments(currentCache).map((entry) => [entry.chunkId, entry])
  );
  const seenChunkIds = new Set<string>();
  const reused: VectorCacheDocument[] = [];
  const toGenerate: Array<{ document: RetrievalDocument; contentHash: string; text: string }> = [];

  for (const document of documents) {
    const text = createVectorText(document);
    const contentHash = createContentHash(text);
    const existing = activeCache.get(document.chunkId);
    seenChunkIds.add(document.chunkId);

    if (
      existing &&
      existing.contentHash === contentHash &&
      currentCache.embeddingModel === embeddingModel &&
      existing.vector.length > 0
    ) {
      reused.push({
        ...existing,
        title: document.title,
        sectionTitle: document.sectionTitle,
        text,
        metadata: {
          ...existing.metadata,
          pageType: document.pageType,
          path: document.path,
          tags: document.tags,
          topics: document.topics,
          keywords: document.keywords,
          relatedCards: document.relatedCards,
          sectionPath: document.sectionPath,
          stale: false
        }
      });
      continue;
    }

    toGenerate.push({ document, contentHash, text });
  }

  const stale = getActiveVectorDocuments(currentCache)
    .filter((entry) => !seenChunkIds.has(entry.chunkId))
    .map((entry) => ({
      ...entry,
      metadata: {
        ...entry.metadata,
        stale: true
      }
    }));

  return { reused, toGenerate, stale };
}

export async function buildVectorCache(
  documents: RetrievalDocument[],
  currentCache: VectorCache,
  embeddingModel: string,
  embeddingClient: EmbeddingClientLike,
  generatedAt: string
): Promise<{ cache: VectorCache; summary: VectorCacheBuildSummary }> {
  const { reused, toGenerate, stale } = buildVectorCachePlan(
    documents,
    currentCache,
    embeddingModel
  );

  const generatedDocuments: VectorCacheDocument[] = [];
  let dimension = currentCache.embeddingDimension || 0;

  if (toGenerate.length > 0) {
    const response = await embeddingClient.embedTexts(
      toGenerate.map((item) => item.text),
      embeddingModel
    );
    dimension = response.dimension;
    for (const [index, item] of toGenerate.entries()) {
      generatedDocuments.push(
        createVectorCacheDocument(item.document, response.vectors[index], item.contentHash)
      );
    }
  }

  const cacheDocuments = [...reused, ...generatedDocuments, ...stale].sort((left, right) =>
    left.chunkId.localeCompare(right.chunkId, "en")
  );

  const cache: VectorCache = {
    embeddingModel,
    embeddingDimension: dimension,
    generatedAt,
    documents: cacheDocuments
  };

  return {
    cache,
    summary: {
      totalChunks: documents.length,
      reusedEmbeddings: reused.length,
      generatedEmbeddings: generatedDocuments.length,
      staleEmbeddings: stale.length,
      embeddingModel,
      dimension
    }
  };
}
