import { performance } from "node:perf_hooks";

import { searchBm25Index } from "./bm25-searcher.ts";
import { searchVectorCache } from "./vector-searcher.ts";
import { createTokenizer } from "./tokenizer.ts";
import { normalizeText } from "./normalizer.ts";
import {
  normalizeBm25Scores,
  normalizeGraphScores,
  normalizeVectorScores,
  scoreGraphRelation
} from "./hybrid-normalization.ts";
import type {
  BM25Index,
  GraphRelationType,
  HybridNormalizedScore,
  HybridRejectedResult,
  HybridSearchOptions,
  HybridSearchResponse,
  HybridSearchResult,
  HybridSearchWeights,
  RelationGraph,
  RelationGraphRelationship,
  RetrievalDocument,
  RetrievalSource,
  SearchResult,
  VectorCache,
  VectorSearchResponse,
  VectorSearchResult
} from "./types.ts";

const DEFAULT_WEIGHTS: HybridSearchWeights = {
  bm25: 0.45,
  vector: 0.55,
  graph: 0.15
};

const DEFAULT_TOP_K = 8;
const DEFAULT_GRAPH_TOP_K = 3;

type MergedCandidate = HybridSearchResult & {
  pageType?: string;
  path?: string;
  tags: string[];
  topics: string[];
  keywords: string[];
  relatedCards: string[];
  directHit: boolean;
  graphDistance?: number;
  graphRelationType?: GraphRelationType;
  graphReason?: string;
};

type QuerySignals = {
  normalizedQuery: string;
  tokens: string[];
  tokenSet: Set<string>;
  orientation?: "upright" | "reversed";
};

function roundScore(value: number): number {
  return Number(value.toFixed(6));
}

function buildDocumentMap(documents: RetrievalDocument[]): Map<string, RetrievalDocument> {
  return new Map(documents.map((document) => [document.chunkId, document]));
}

function buildRepresentativeChunkMap(documents: RetrievalDocument[]): Map<string, RetrievalDocument> {
  const sortedDocuments = [...documents].sort((left, right) => {
    const leftPriority = left.sectionTitle === "Overview" ? 0 : 1;
    const rightPriority = right.sectionTitle === "Overview" ? 0 : 1;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return left.chunkId.localeCompare(right.chunkId, "en");
  });

  const map = new Map<string, RetrievalDocument>();
  for (const document of sortedDocuments) {
    if (!map.has(document.pageId)) {
      map.set(document.pageId, document);
    }
  }
  return map;
}

function splitTitleAliases(title: string): string[] {
  const aliases = [title];
  const match = title.match(/^([^（(]+)[（(]([^）)]+)[）)]$/);
  if (match) {
    aliases.push(match[1], match[2]);
  }
  return aliases
    .map((value) => normalizeText(value).toLowerCase())
    .flatMap((value) => [value, value.replace(/\s+/g, "")])
    .filter(Boolean);
}

function buildPageAliasMap(documents: RetrievalDocument[]): Map<string, Set<string>> {
  const aliasMap = new Map<string, Set<string>>();
  for (const document of documents) {
    const aliases = aliasMap.get(document.pageId) ?? new Set<string>();
    aliases.add(document.pageId.toLowerCase());
    for (const alias of splitTitleAliases(document.title)) {
      aliases.add(alias);
    }
    aliasMap.set(document.pageId, aliases);
  }
  return aliasMap;
}

function toMetadata(document: RetrievalDocument): Record<string, unknown> {
  return {
    pageType: document.pageType,
    path: document.path,
    tags: document.tags,
    topics: document.topics,
    keywords: document.keywords,
    relatedCards: document.relatedCards,
    sectionPath: document.sectionPath
  };
}

function createMergedCandidate(document: RetrievalDocument): MergedCandidate {
  return {
    chunkId: document.chunkId,
    pageId: document.pageId,
    title: document.title,
    sectionTitle: document.sectionTitle,
    finalScore: 0,
    sourceScores: {},
    sources: [],
    matchedTerms: [],
    metadata: toMetadata(document),
    pageType: document.pageType,
    path: document.path,
    tags: document.tags,
    topics: document.topics,
    keywords: document.keywords,
    relatedCards: document.relatedCards,
    directHit: false
  };
}

function buildQuerySignals(query: string, tokenizedQuery: string[]): QuerySignals {
  const normalizedQuery = normalizeText(query).toLowerCase();
  const orientation = tokenizedQuery.includes("逆位") || tokenizedQuery.includes("reversed")
    ? "reversed"
    : tokenizedQuery.includes("正位") || tokenizedQuery.includes("upright")
      ? "upright"
      : undefined;

  return {
    normalizedQuery,
    tokens: tokenizedQuery,
    tokenSet: new Set(tokenizedQuery),
    orientation
  };
}

function buildDocumentTokenSet(document: RetrievalDocument, tokenize: (input: string) => string[]): Set<string> {
  return new Set(
    tokenize(
      [
        document.title,
        document.sectionTitle,
        document.tags.join(" "),
        document.topics.join(" "),
        document.keywords.join(" "),
        document.relatedCards.join(" "),
        document.searchableText
      ]
        .filter(Boolean)
        .join(" ")
    )
  );
}

function addSource(candidate: MergedCandidate, source: RetrievalSource, score: number): void {
  candidate.sourceScores[source] = roundScore(score);
  if (!candidate.sources.includes(source)) {
    candidate.sources.push(source);
  }
}

function keywordOverlapScore(querySignals: QuerySignals, documentTokens: Set<string>): number {
  if (querySignals.tokenSet.size === 0) {
    return 0;
  }

  let hits = 0;
  for (const token of querySignals.tokenSet) {
    if (documentTokens.has(token)) {
      hits += 1;
    }
  }
  return hits / querySignals.tokenSet.size;
}

function listOverlapScore(values: string[], querySignals: QuerySignals): number {
  if (values.length === 0) {
    return 0;
  }

  const normalizedValues = values.map((value) => normalizeText(value).toLowerCase());
  const hits = normalizedValues.filter((value) => querySignals.normalizedQuery.includes(value)).length;
  return hits / normalizedValues.length;
}

function hasExactCardMatch(pageAliases: Set<string> | undefined, querySignals: QuerySignals): boolean {
  if (!pageAliases) {
    return false;
  }
  for (const alias of pageAliases) {
    if (querySignals.normalizedQuery.includes(alias)) {
      return true;
    }
  }
  return false;
}

function hasOrientationMatch(document: RetrievalDocument, querySignals: QuerySignals): boolean {
  if (!querySignals.orientation) {
    return false;
  }

  if (querySignals.orientation === "reversed") {
    return document.sectionTitle.includes("逆位") || document.searchableText.includes("逆位");
  }

  return document.sectionTitle.includes("正位") || document.searchableText.includes("正位");
}

function computeRerankScore(options: {
  candidate: MergedCandidate;
  document: RetrievalDocument;
  documentTokens: Set<string>;
  pageAliases: Set<string> | undefined;
  querySignals: QuerySignals;
  weights: HybridSearchWeights;
}): number {
  const bm25Score = options.candidate.sourceScores.bm25 ?? 0;
  const vectorScore = options.candidate.sourceScores.vector ?? 0;
  const graphScore = options.candidate.sourceScores.graph ?? 0;

  const exactCardMatch = hasExactCardMatch(options.pageAliases, options.querySignals) ? 0.2 : 0;
  const orientationMatch = hasOrientationMatch(options.document, options.querySignals) ? 0.08 : 0;
  const topicMatch = listOverlapScore(options.document.topics, options.querySignals) * 0.08;
  const tagMatch = listOverlapScore(options.document.tags, options.querySignals) * 0.05;
  const keywordOverlap = keywordOverlapScore(options.querySignals, options.documentTokens) * 0.1;
  const graphRelationBoost = options.candidate.graphRelationType ? 0.03 : 0;

  return roundScore(
    bm25Score * options.weights.bm25 +
      vectorScore * options.weights.vector +
      graphScore * options.weights.graph +
      exactCardMatch +
      orientationMatch +
      topicMatch +
      tagMatch +
      keywordOverlap +
      graphRelationBoost
  );
}

function sortHybridResults(results: MergedCandidate[]): MergedCandidate[] {
  return [...results].sort((left, right) => {
    if (right.finalScore !== left.finalScore) {
      return right.finalScore - left.finalScore;
    }
    return left.chunkId.localeCompare(right.chunkId, "en");
  });
}

function indexGraphRelationships(graph: RelationGraph): Map<string, RelationGraphRelationship[]> {
  const map = new Map<string, RelationGraphRelationship[]>();
  for (const relationship of graph.relationships) {
    const sourceList = map.get(relationship.source) ?? [];
    sourceList.push(relationship);
    map.set(relationship.source, sourceList);

    const reverseList = map.get(relationship.target) ?? [];
    reverseList.push({
      ...relationship,
      source: relationship.target,
      target: relationship.source
    });
    map.set(relationship.target, reverseList);
  }
  return map;
}

function createEmptyVectorResponse(query: string): VectorSearchResponse {
  return {
    query,
    results: [] as VectorSearchResult[],
    diagnostics: {
      queryEmbeddingModel: "",
      candidateCount: 0,
      rawScores: [],
      rejectedResults: [],
      topK: 0,
      minScore: 0
    }
  };
}

export function mergeHybridResults(options: {
  bm25Results: SearchResult[];
  vectorResults: VectorSearchResult[];
  bm25Normalized: number[];
  vectorNormalized: number[];
  documentMap: Map<string, RetrievalDocument>;
}): {
  mergedResults: MergedCandidate[];
  normalizedScores: HybridNormalizedScore[];
} {
  const mergedMap = new Map<string, MergedCandidate>();
  const normalizedScores: HybridNormalizedScore[] = [];

  for (const [index, result] of options.bm25Results.entries()) {
    const document = options.documentMap.get(result.chunkId);
    if (!document) {
      continue;
    }
    const candidate = mergedMap.get(result.chunkId) ?? createMergedCandidate(document);
    addSource(candidate, "bm25", options.bm25Normalized[index] ?? 0);
    candidate.directHit = true;
    candidate.matchedTerms = Array.from(new Set([...(candidate.matchedTerms ?? []), ...result.matchedTerms])).sort(
      (left, right) => left.localeCompare(right, "en")
    );
    mergedMap.set(result.chunkId, candidate);
    normalizedScores.push({
      source: "bm25",
      pageId: result.pageId,
      chunkId: result.chunkId,
      rawScore: roundScore(result.score),
      normalizedScore: roundScore(options.bm25Normalized[index] ?? 0)
    });
  }

  for (const [index, result] of options.vectorResults.entries()) {
    const document = options.documentMap.get(result.chunkId);
    if (!document) {
      continue;
    }
    const candidate = mergedMap.get(result.chunkId) ?? createMergedCandidate(document);
    addSource(candidate, "vector", options.vectorNormalized[index] ?? 0);
    candidate.directHit = true;
    mergedMap.set(result.chunkId, candidate);
    normalizedScores.push({
      source: "vector",
      pageId: result.pageId,
      chunkId: result.chunkId,
      rawScore: roundScore(result.score),
      normalizedScore: roundScore(options.vectorNormalized[index] ?? 0)
    });
  }

  return {
    mergedResults: sortHybridResults(Array.from(mergedMap.values())),
    normalizedScores: normalizedScores.sort((left, right) => {
      if (left.source !== right.source) {
        return left.source.localeCompare(right.source, "en");
      }
      return left.chunkId.localeCompare(right.chunkId, "en");
    })
  };
}

export function applyGraphExpansion(options: {
  mergedResults: MergedCandidate[];
  graph: RelationGraph;
  documentMap: Map<string, RetrievalDocument>;
  representativeChunks: Map<string, RetrievalDocument>;
  graphTopK: number;
  normalizedScores: HybridNormalizedScore[];
}): {
  expandedResults: MergedCandidate[];
  rejectedResults: HybridRejectedResult[];
} {
  const relationshipMap = indexGraphRelationships(options.graph);
  const mergedMap = new Map(options.mergedResults.map((result) => [result.chunkId, result]));
  const bestChunkByPage = new Map<string, MergedCandidate>();
  const rejectedResults: HybridRejectedResult[] = [];

  for (const result of sortHybridResults(options.mergedResults)) {
    if (!bestChunkByPage.has(result.pageId)) {
      bestChunkByPage.set(result.pageId, result);
    }
  }

  const graphOnlyCandidates: Array<{
    candidate: MergedCandidate;
    rawGraphScore: number;
  }> = [];
  const seenGraphPages = new Set<string>();

  for (const seed of sortHybridResults(options.mergedResults)) {
    const relationships = relationshipMap.get(seed.pageId) ?? [];
    for (const relationship of relationships) {
      const targetPageId = relationship.target;
      if (targetPageId === seed.pageId) {
        continue;
      }

      const document =
        options.documentMap.get(bestChunkByPage.get(targetPageId)?.chunkId ?? "") ??
        options.representativeChunks.get(targetPageId);
      if (!document) {
        continue;
      }

      const rawGraphScore = scoreGraphRelation({
        relationType: relationship.type,
        distance: 1,
        seedScore: seed.finalScore
      });

      const existingChunk = bestChunkByPage.get(targetPageId);
      const candidate = existingChunk ?? createMergedCandidate(document);
      candidate.graphDistance = 1;
      candidate.graphRelationType = relationship.type;
      candidate.graphReason = relationship.reason;
      candidate.metadata = {
        ...candidate.metadata,
        graphExpansion: {
          fromPageId: seed.pageId,
          relationType: relationship.type,
          reason: relationship.reason,
          evidence: relationship.evidence ?? null,
          distance: 1
        }
      };

      if (existingChunk) {
        const nextGraphScore = Math.max(existingChunk.sourceScores.graph ?? 0, rawGraphScore);
        addSource(existingChunk, "graph", nextGraphScore);
        options.normalizedScores.push({
          source: "graph",
          pageId: existingChunk.pageId,
          chunkId: existingChunk.chunkId,
          rawScore: roundScore(rawGraphScore),
          normalizedScore: roundScore(rawGraphScore)
        });
        continue;
      }

      if (seenGraphPages.has(targetPageId)) {
        continue;
      }
      seenGraphPages.add(targetPageId);
      graphOnlyCandidates.push({ candidate, rawGraphScore });
    }
  }

  const normalizedGraphScores = normalizeGraphScores(graphOnlyCandidates.map((item) => item.rawGraphScore));
  const rankedGraphOnly = graphOnlyCandidates
    .map((item, index) => {
      addSource(item.candidate, "graph", normalizedGraphScores[index] ?? 0);
      options.normalizedScores.push({
        source: "graph",
        pageId: item.candidate.pageId,
        chunkId: item.candidate.chunkId,
        rawScore: roundScore(item.rawGraphScore),
        normalizedScore: roundScore(normalizedGraphScores[index] ?? 0)
      });
      return item.candidate;
    })
    .sort((left, right) => {
      const leftScore = left.sourceScores.graph ?? 0;
      const rightScore = right.sourceScores.graph ?? 0;
      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }
      return left.chunkId.localeCompare(right.chunkId, "en");
    });

  const keptGraphOnly = rankedGraphOnly.slice(0, options.graphTopK);
  for (const rejected of rankedGraphOnly.slice(options.graphTopK)) {
    rejectedResults.push({
      pageId: rejected.pageId,
      chunkId: rejected.chunkId,
      stage: "graph",
      reason: "outside_graph_top_k",
      score: rejected.sourceScores.graph
    });
  }

  for (const result of keptGraphOnly) {
    mergedMap.set(result.chunkId, result);
  }

  return {
    expandedResults: sortHybridResults(Array.from(mergedMap.values())),
    rejectedResults
  };
}

export async function searchHybridIndex(
  index: BM25Index,
  cache: VectorCache,
  graph: RelationGraph,
  query: string,
  options: HybridSearchOptions = {}
): Promise<HybridSearchResponse> {
  const totalStart = performance.now();
  const weights: HybridSearchWeights = {
    ...DEFAULT_WEIGHTS,
    ...options.weights
  };
  const topK = options.topK ?? DEFAULT_TOP_K;
  const bm25TopK = options.bm25TopK ?? Math.max(topK, 8);
  const vectorTopK = options.vectorTopK ?? Math.max(topK, 8);
  const graphTopK = options.graphTopK ?? DEFAULT_GRAPH_TOP_K;
  const tokenize = createTokenizer({
    protectedPhrases: index.metadata.tokenizer.protectedPhrases
  });
  const documentMap = buildDocumentMap(index.documents);
  const representativeChunks = buildRepresentativeChunkMap(index.documents);
  const pageAliases = buildPageAliasMap(index.documents);
  const rejectedResults: HybridRejectedResult[] = [];

  const bm25Start = performance.now();
  const bm25Response = searchBm25Index(index, query, {
    topK: bm25TopK,
    minScore: options.minBm25Score ?? 0
  });
  const bm25Timing = performance.now() - bm25Start;
  rejectedResults.push(
    ...bm25Response.diagnostics.rejectedResults.map((item) => ({
      pageId: item.pageId,
      chunkId: item.chunkId,
      stage: "bm25" as const,
      reason: item.reason,
      score: item.score
    }))
  );

  const vectorStart = performance.now();
  let vectorResponse = createEmptyVectorResponse(query);
  try {
    if (options.queryVector || options.liveQueryEmbedding || options.embedQuery) {
      vectorResponse = await searchVectorCache(cache, query, {
        topK: vectorTopK,
        minScore: options.minVectorScore ?? 0,
        queryVector: options.queryVector,
        liveQueryEmbedding: options.liveQueryEmbedding,
        embeddingModel: options.embeddingModel,
        embedQuery: options.embedQuery
      });
    }
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("query embedding")) {
      throw error;
    }
  }
  const vectorTiming = performance.now() - vectorStart;
  rejectedResults.push(
    ...vectorResponse.diagnostics.rejectedResults.map((item) => ({
      pageId: item.pageId,
      chunkId: item.chunkId,
      stage: "vector" as const,
      reason: item.reason,
      score: item.score
    }))
  );

  const mergeStart = performance.now();
  const tokenizedQuery =
    bm25Response.diagnostics.tokenizedQuery.length > 0
      ? bm25Response.diagnostics.tokenizedQuery
      : tokenize(query);
  const querySignals = buildQuerySignals(query, tokenizedQuery);
  const merged = mergeHybridResults({
    bm25Results: bm25Response.results,
    vectorResults: vectorResponse.results,
    bm25Normalized: normalizeBm25Scores(bm25Response.results.map((result) => result.score)),
    vectorNormalized: normalizeVectorScores(vectorResponse.results.map((result) => result.score)),
    documentMap
  });

  const initialMergedResults = merged.mergedResults.map((candidate) => {
    const document = documentMap.get(candidate.chunkId);
    if (!document) {
      return candidate;
    }
    candidate.finalScore = computeRerankScore({
      candidate,
      document,
      documentTokens: buildDocumentTokenSet(document, tokenize),
      pageAliases: pageAliases.get(candidate.pageId),
      querySignals,
      weights
    });
    return candidate;
  });
  const mergeTiming = performance.now() - mergeStart;

  const graphStart = performance.now();
  let postGraphResults = sortHybridResults(initialMergedResults);
  const graphExpandedResults: MergedCandidate[] = [];
  if (options.graphExpansion !== false) {
    const graphApplied = applyGraphExpansion({
      mergedResults: postGraphResults,
      graph,
      documentMap,
      representativeChunks,
      graphTopK,
      normalizedScores: merged.normalizedScores
    });
    rejectedResults.push(...graphApplied.rejectedResults);
    postGraphResults = graphApplied.expandedResults.map((candidate) => {
      const document = documentMap.get(candidate.chunkId) ?? representativeChunks.get(candidate.pageId);
      if (!document) {
        return candidate;
      }
      candidate.finalScore = computeRerankScore({
        candidate,
        document,
        documentTokens: buildDocumentTokenSet(document, tokenize),
        pageAliases: pageAliases.get(candidate.pageId),
        querySignals,
        weights
      });
      return candidate;
    });
    for (const result of postGraphResults) {
      if (result.sources.includes("graph")) {
        graphExpandedResults.push(result);
      }
    }
  }
  const graphTiming = performance.now() - graphStart;

  const sortedDirectResults = sortHybridResults(postGraphResults.filter((result) => result.directHit));
  const sortedGraphOnlyResults = sortHybridResults(postGraphResults.filter((result) => !result.directHit));
  const finalResults = [...sortedDirectResults, ...sortedGraphOnlyResults].slice(0, topK);
  const finalChunkIds = new Set(finalResults.map((result) => result.chunkId));

  for (const rejected of [...sortedDirectResults, ...sortedGraphOnlyResults]) {
    if (!finalChunkIds.has(rejected.chunkId)) {
      rejectedResults.push({
        pageId: rejected.pageId,
        chunkId: rejected.chunkId,
        stage: "final",
        reason: "outside_final_top_k",
        score: rejected.finalScore
      });
    }
  }

  const totalTiming = performance.now() - totalStart;

  return {
    query,
    results: finalResults.map((result) => ({
      chunkId: result.chunkId,
      pageId: result.pageId,
      title: result.title,
      sectionTitle: result.sectionTitle,
      finalScore: roundScore(result.finalScore),
      sourceScores: result.sourceScores,
      sources: [...result.sources].sort((left, right) => left.localeCompare(right, "en")),
      matchedTerms: result.matchedTerms,
      metadata: result.metadata
    })),
    diagnostics: {
      bm25Results: bm25Response.results,
      vectorResults: vectorResponse.results,
      normalizedScores: merged.normalizedScores.sort((left, right) => {
        if (left.source !== right.source) {
          return left.source.localeCompare(right.source, "en");
        }
        return left.chunkId.localeCompare(right.chunkId, "en");
      }),
      mergedResults: sortHybridResults(initialMergedResults).map((result) => ({
        chunkId: result.chunkId,
        pageId: result.pageId,
        title: result.title,
        sectionTitle: result.sectionTitle,
        finalScore: roundScore(result.finalScore),
        sourceScores: result.sourceScores,
        sources: [...result.sources].sort((left, right) => left.localeCompare(right, "en")),
        matchedTerms: result.matchedTerms,
        metadata: result.metadata
      })),
      graphExpandedResults: sortHybridResults(graphExpandedResults).map((result) => ({
        chunkId: result.chunkId,
        pageId: result.pageId,
        title: result.title,
        sectionTitle: result.sectionTitle,
        finalScore: roundScore(result.finalScore),
        sourceScores: result.sourceScores,
        sources: [...result.sources].sort((left, right) => left.localeCompare(right, "en")),
        matchedTerms: result.matchedTerms,
        metadata: result.metadata
      })),
      rejectedResults: rejectedResults.sort((left, right) => left.chunkId.localeCompare(right.chunkId, "en")),
      finalResults: finalResults.map((result) => ({
        chunkId: result.chunkId,
        pageId: result.pageId,
        title: result.title,
        sectionTitle: result.sectionTitle,
        finalScore: roundScore(result.finalScore),
        sourceScores: result.sourceScores,
        sources: [...result.sources].sort((left, right) => left.localeCompare(right, "en")),
        matchedTerms: result.matchedTerms,
        metadata: result.metadata
      })),
      weights,
      topK,
      timingMs: {
        bm25: roundScore(bm25Timing),
        vector: roundScore(vectorTiming),
        merge: roundScore(mergeTiming),
        graph: roundScore(graphTiming),
        total: roundScore(totalTiming)
      },
      queryTokens: tokenizedQuery
    }
  };
}
