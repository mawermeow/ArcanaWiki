import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { cosineSimilarity } from "../../lib/retrieval/cosine.ts";
import {
  createEmbeddingBatches,
  estimateEmbeddingTokens,
  requireOpenAiApiKey
} from "../../lib/retrieval/embedding-client.ts";
import { writeVectorCache, readVectorCache } from "../../lib/retrieval/persistence.ts";
import { searchVectorCache } from "../../lib/retrieval/vector-searcher.ts";
import {
  buildVectorCache,
  buildVectorCachePlan,
  createEmptyVectorCache,
  createVectorCacheDocument
} from "../../lib/retrieval/vector-cache.ts";
import type { RetrievalDocument, VectorCache } from "../../lib/retrieval/types.ts";

function createDocument(overrides: Partial<RetrievalDocument> = {}): RetrievalDocument {
  return {
    id: "doc-1",
    chunkId: "page-1::overview",
    pageId: "page-1",
    pageType: "card",
    path: "wiki/cards/page-1.md",
    title: "Page 1",
    sectionTitle: "Overview",
    sectionPath: ["Overview"],
    tags: ["塔羅"],
    topics: ["感情"],
    keywords: ["連結"],
    relatedCards: ["page-2"],
    content: "溫柔而直接的關係訊息。",
    searchableText: "溫柔而直接的關係訊息。",
    tokenCount: 8,
    ...overrides
  };
}

const fakeEmbeddingClient = {
  async embedTexts(texts: string[]) {
    return {
      model: "fake-embedding-model",
      dimension: 3,
      vectors: texts.map((text, index) => [text.length, index + 1, text.includes("冷淡") ? 10 : 1])
    };
  }
};

test("cosine similarity is correct for identical and orthogonal vectors", () => {
  assert.equal(Number(cosineSimilarity([1, 0], [1, 0]).toFixed(6)), 1);
  assert.equal(Number(cosineSimilarity([1, 0], [0, 1]).toFixed(6)), 0);
});

test("vector cache load/save roundtrip preserves content", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "vector-cache-test-"));
  const filePath = path.join(directory, "vector-cache.json");
  const cache: VectorCache = {
    embeddingModel: "fake",
    embeddingDimension: 3,
    generatedAt: "2026-06-06T00:00:00.000Z",
    documents: [createVectorCacheDocument(createDocument(), [1, 2, 3], "hash-1")]
  };

  await writeVectorCache(filePath, cache);
  const loaded = await readVectorCache(filePath);
  assert.deepEqual(loaded, cache);
});

test("contentHash reuse avoids regenerating unchanged embeddings", async () => {
  const document = createDocument();
  const currentCache: VectorCache = {
    embeddingModel: "fake-embedding-model",
    embeddingDimension: 3,
    generatedAt: "2026-06-06T00:00:00.000Z",
    documents: [createVectorCacheDocument(document, [1, 2, 3])]
  };

  const plan = buildVectorCachePlan([document], currentCache, "fake-embedding-model");
  assert.equal(plan.reused.length, 1);
  assert.equal(plan.toGenerate.length, 0);
});

test("stale chunk detection marks missing cache entries", async () => {
  const currentDocument = createDocument();
  const staleDocument = createDocument({
    chunkId: "page-2::overview",
    pageId: "page-2",
    title: "Page 2"
  });
  const currentCache: VectorCache = {
    embeddingModel: "fake-embedding-model",
    embeddingDimension: 3,
    generatedAt: "2026-06-06T00:00:00.000Z",
    documents: [
      createVectorCacheDocument(currentDocument, [1, 2, 3]),
      createVectorCacheDocument(staleDocument, [2, 3, 4])
    ]
  };

  const plan = buildVectorCachePlan([currentDocument], currentCache, "fake-embedding-model");
  assert.equal(plan.stale.length, 1);
  assert.equal(plan.stale[0].chunkId, "page-2::overview");
  assert.equal(plan.stale[0].metadata.stale, true);
});

test("missing API key behavior is explicit", () => {
  assert.throws(() => requireOpenAiApiKey(""), /Missing OPENAI_API_KEY/);
});

test("embedding batches split large requests while preserving order", () => {
  const texts = [
    "短句",
    "x".repeat(1200),
    "另一段".repeat(200),
    "最後一段"
  ];
  const batches = createEmbeddingBatches(texts, {
    maxTokens: estimateEmbeddingTokens(texts[0]) + estimateEmbeddingTokens(texts[1]) + 10,
    maxItems: 2
  });

  assert.equal(batches.length >= 2, true);
  assert.deepEqual(batches.flat(), texts);
});

test("buildVectorCache reuses, generates, and preserves stale entries", async () => {
  const unchanged = createDocument();
  const changed = createDocument({
    chunkId: "page-2::overview",
    pageId: "page-2",
    title: "Page 2",
    content: "更新後的新內容。"
  });
  const removed = createDocument({
    chunkId: "page-3::overview",
    pageId: "page-3",
    title: "Page 3"
  });

  const currentCache: VectorCache = {
    embeddingModel: "fake-embedding-model",
    embeddingDimension: 3,
    generatedAt: "2026-06-06T00:00:00.000Z",
    documents: [
      createVectorCacheDocument(unchanged, [1, 1, 1]),
      createVectorCacheDocument(
        createDocument({
          chunkId: "page-2::overview",
          pageId: "page-2",
          title: "Page 2",
          content: "舊內容"
        }),
        [2, 2, 2]
      ),
      createVectorCacheDocument(removed, [3, 3, 3])
    ]
  };

  const { cache, summary } = await buildVectorCache(
    [unchanged, changed],
    currentCache,
    "fake-embedding-model",
    fakeEmbeddingClient,
    "2026-06-06T12:00:00.000Z"
  );

  assert.equal(summary.reusedEmbeddings, 1);
  assert.equal(summary.generatedEmbeddings, 1);
  assert.equal(summary.staleEmbeddings, 1);
  assert.equal(cache.documents.length, 3);
  assert.equal(cache.documents.find((item) => item.chunkId === "page-3::overview")?.metadata.stale, true);
});

test("search result ordering follows cosine similarity and ignores stale docs", async () => {
  const liveDocument = createVectorCacheDocument(
    createDocument({ chunkId: "page-1::overview", pageId: "page-1", title: "Page 1" }),
    [1, 0, 0]
  );
  const betterDocument = createVectorCacheDocument(
    createDocument({
      chunkId: "page-2::overview",
      pageId: "page-2",
      title: "Page 2",
      sectionTitle: "感情"
    }),
    [1, 1, 0]
  );
  const staleDocument = {
    ...createVectorCacheDocument(
      createDocument({
        chunkId: "page-3::overview",
        pageId: "page-3",
        title: "Page 3"
      }),
      [1, 1, 1]
    ),
    metadata: {
      ...createVectorCacheDocument(createDocument(), [1, 1, 1]).metadata,
      stale: true
    }
  };

  const cache: VectorCache = {
    embeddingModel: "fake-embedding-model",
    embeddingDimension: 3,
    generatedAt: "2026-06-06T00:00:00.000Z",
    documents: [liveDocument, betterDocument, staleDocument]
  };

  const response = await searchVectorCache(cache, "query", {
    queryVector: [1, 1, 0],
    liveQueryEmbedding: false,
    topK: 5
  });

  assert.equal(response.results[0].pageId, "page-2");
  assert.ok(response.results.every((result) => result.pageId !== "page-3"));
});

test("vector diagnostics shape includes raw scores and rejected results", async () => {
  const cache: VectorCache = {
    embeddingModel: "fake-embedding-model",
    embeddingDimension: 3,
    generatedAt: "2026-06-06T00:00:00.000Z",
    documents: [
      createVectorCacheDocument(createDocument(), [1, 0, 0]),
      createVectorCacheDocument(
        createDocument({
          chunkId: "page-2::overview",
          pageId: "page-2",
          title: "Page 2"
        }),
        [0, 1, 0]
      )
    ]
  };

  const response = await searchVectorCache(cache, "query", {
    queryVector: [1, 0, 0],
    liveQueryEmbedding: false,
    topK: 1,
    minScore: 0.1
  });

  assert.equal(response.diagnostics.queryEmbeddingModel, "fake-embedding-model");
  assert.equal(response.diagnostics.candidateCount, 2);
  assert.ok(Array.isArray(response.diagnostics.rawScores));
  assert.ok(Array.isArray(response.diagnostics.rejectedResults));
});
