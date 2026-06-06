import test from "node:test";
import assert from "node:assert/strict";

import { readBm25Index, readVectorCache } from "../../lib/retrieval/persistence.ts";
import { readRelationGraph } from "../../lib/retrieval/graph-loader.ts";
import {
  applyGraphExpansion,
  mergeHybridResults,
  searchHybridIndex
} from "../../lib/retrieval/hybrid-searcher.ts";
import {
  normalizeBm25Scores,
  normalizeVectorScores
} from "../../lib/retrieval/hybrid-normalization.ts";
import type {
  BM25Index,
  HybridNormalizedScore,
  RelationGraph,
  RetrievalDocument,
  RetrievalSource,
  SearchResult,
  VectorCache,
  VectorSearchResult
} from "../../lib/retrieval/types.ts";

let cachedFixtures: Promise<{
  index: BM25Index;
  cache: VectorCache;
  graph: RelationGraph;
}>;

async function getFixtures() {
  cachedFixtures ??= Promise.all([
    readBm25Index("embeddings/bm25-index.json"),
    readVectorCache("embeddings/vector-cache.json"),
    readRelationGraph("relations/graph.json")
  ]).then(([index, cache, graph]) => ({ index, cache, graph }));
  return cachedFixtures;
}

function getDocument(index: BM25Index, chunkId: string): RetrievalDocument {
  const document = index.documents.find((item) => item.chunkId === chunkId);
  assert.ok(document, `Missing document for chunk ${chunkId}`);
  return document;
}

function getVector(cache: VectorCache, chunkId: string): number[] {
  const document = cache.documents.find((item) => item.chunkId === chunkId);
  assert.ok(document, `Missing vector for chunk ${chunkId}`);
  return document.vector;
}

test("score normalization keeps bm25 and vector values in 0..1", () => {
  const bm25 = normalizeBm25Scores([0, 1.4, 4.8, 9.2]);
  const vector = normalizeVectorScores([-0.5, 0.1, 0.65, 0.95]);

  assert.ok(bm25.every((value) => value >= 0 && value <= 1));
  assert.ok(vector.every((value) => value >= 0 && value <= 1));
  assert.equal(bm25[0], 0);
  assert.equal(vector.at(-1), 1);
});

test("duplicate chunk merge preserves one record with both source scores", () => {
  const document: RetrievalDocument = {
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
    content: "關係與連結",
    searchableText: "關係與連結",
    tokenCount: 5
  };
  const documentMap = new Map([[document.chunkId, document]]);
  const bm25Results: SearchResult[] = [
    {
      chunkId: document.chunkId,
      pageId: document.pageId,
      score: 3.2,
      source: "bm25",
      title: document.title,
      sectionTitle: document.sectionTitle,
      matchedTerms: ["連結"],
      tags: document.tags,
      topics: document.topics,
      path: document.path,
      metadata: {}
    }
  ];
  const vectorResults: VectorSearchResult[] = [
    {
      chunkId: document.chunkId,
      pageId: document.pageId,
      score: 0.81,
      source: "vector",
      title: document.title,
      sectionTitle: document.sectionTitle,
      metadata: {}
    }
  ];

  const merged = mergeHybridResults({
    bm25Results,
    vectorResults,
    bm25Normalized: [0.9],
    vectorNormalized: [0.7],
    documentMap
  });

  assert.equal(merged.mergedResults.length, 1);
  assert.deepEqual(merged.mergedResults[0].sourceScores, { bm25: 0.9, vector: 0.7 });
  assert.deepEqual(merged.mergedResults[0].sources.sort(), ["bm25", "vector"]);
});

test("BM25-only query still returns deterministic hybrid results", async () => {
  const { index, cache, graph } = await getFixtures();
  const response = await searchHybridIndex(index, cache, graph, "復合", {
    topK: 5,
    graphExpansion: false
  });

  assert.ok(response.results.length > 0);
  assert.ok(response.results.every((result) => result.sources.includes("bm25")));
  assert.ok(
    response.results.some((result) =>
      ["spread-lover-reunion", "spread-love-tree", "spread-love-greater-cross"].includes(result.pageId)
    )
  );
});

test("vector-heavy query includes vector-driven matches", async () => {
  const { index, cache, graph } = await getFixtures();
  const response = await searchHybridIndex(
    index,
    cache,
    graph,
    "對方最近很冷淡",
    {
      topK: 5,
      queryVector: getVector(cache, "major-18-moon::情境解讀::感情")
    }
  );

  assert.ok(response.results.length > 0);
  assert.ok(response.results.some((result) => result.sources.includes("vector")));
  assert.ok(
    response.results.some((result) =>
      ["major-18-moon", "cups-queen", "swords-02", "cups-king"].includes(result.pageId)
    )
  );
});

test("mixed query merges bm25 and vector signals", async () => {
  const { index, cache, graph } = await getFixtures();
  const response = await searchHybridIndex(index, cache, graph, "The Hermit love", {
    topK: 5,
    queryVector: getVector(cache, "major-09-hermit::情境解讀::感情")
  });

  assert.ok(response.results.length > 0);
  assert.equal(response.results[0].pageId, "major-09-hermit");
  assert.ok(
    response.results[0].sources.includes("bm25") || response.results[0].sources.includes("vector")
  );
});

test("graph expansion does not dominate direct hits", async () => {
  const { index, graph } = await getFixtures();
  const mergedDocument = getDocument(index, "cups-02::overview");
  const mergedResults = [
    {
      chunkId: mergedDocument.chunkId,
      pageId: mergedDocument.pageId,
      title: mergedDocument.title,
      sectionTitle: mergedDocument.sectionTitle,
      finalScore: 0.95,
      sourceScores: { bm25: 1, vector: 0.8 },
      sources: ["bm25", "vector"] as RetrievalSource[],
      matchedTerms: ["聖杯二逆位"],
      metadata: {
        pageType: mergedDocument.pageType,
        path: mergedDocument.path,
        tags: mergedDocument.tags,
        topics: mergedDocument.topics,
        keywords: mergedDocument.keywords,
        relatedCards: mergedDocument.relatedCards
      },
      pageType: mergedDocument.pageType,
      path: mergedDocument.path,
      tags: mergedDocument.tags,
      topics: mergedDocument.topics,
      keywords: mergedDocument.keywords,
      relatedCards: mergedDocument.relatedCards,
      directHit: true
    }
  ];
  const normalizedScores: Array<{
    pageId: string;
    chunkId: string;
    source: RetrievalSource;
    rawScore: number;
    normalizedScore: number;
  }> = [];

  const expanded = applyGraphExpansion({
    mergedResults,
    graph,
    documentMap: new Map(index.documents.map((document) => [document.chunkId, document])),
    representativeChunks: new Map(index.documents.map((document) => [document.pageId, document])),
    graphTopK: 3,
    normalizedScores
  });

  assert.ok(expanded.expandedResults.length >= 1);
  assert.equal(expanded.expandedResults[0].pageId, "cups-02");
  assert.ok(expanded.expandedResults.some((result) => result.sources.includes("graph")));
});

test("exact card match boost keeps The Hermit query anchored on Hermit", async () => {
  const { index, cache, graph } = await getFixtures();
  const response = await searchHybridIndex(index, cache, graph, "The Hermit love", {
    topK: 3,
    queryVector: getVector(cache, "major-09-hermit::overview")
  });

  assert.equal(response.results[0].pageId, "major-09-hermit");
});

test("orientation match boost surfaces reversed meaning chunk", async () => {
  const { index, cache, graph } = await getFixtures();
  const response = await searchHybridIndex(index, cache, graph, "聖杯二逆位 感情", {
    topK: 5,
    queryVector: getVector(cache, "cups-02::逆位意義")
  });

  assert.ok(
    response.results.some(
      (result) => result.chunkId === "cups-02::逆位意義" && result.sources.includes("vector")
    )
  );
});

test("diagnostics shape includes merged, graph, rejected, and final results", async () => {
  const { index, cache, graph } = await getFixtures();
  const response = await searchHybridIndex(index, cache, graph, "我該不該換工作", {
    topK: 5,
    queryVector: getVector(cache, "major-00-fool::情境解讀::工作")
  });

  assert.ok(Array.isArray(response.diagnostics.bm25Results));
  assert.ok(Array.isArray(response.diagnostics.vectorResults));
  assert.ok(Array.isArray(response.diagnostics.normalizedScores));
  assert.ok(Array.isArray(response.diagnostics.mergedResults));
  assert.ok(Array.isArray(response.diagnostics.graphExpandedResults));
  assert.ok(Array.isArray(response.diagnostics.rejectedResults));
  assert.ok(Array.isArray(response.diagnostics.finalResults));
  assert.equal(typeof response.diagnostics.timingMs.total, "number");
});
