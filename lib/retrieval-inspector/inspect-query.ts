import { embedQueryText } from "../retrieval/embedding-client.ts";
import { readRelationGraph } from "../retrieval/graph-loader.ts";
import { readBm25Index, readVectorCache } from "../retrieval/persistence.ts";
import { searchBm25Index } from "../retrieval/bm25-searcher.ts";
import { searchHybridIndex } from "../retrieval/hybrid-searcher.ts";
import { searchVectorCache } from "../retrieval/vector-searcher.ts";
import type {
  BM25Index,
  RelationGraph,
  VectorCache,
  VectorSearchResponse
} from "../retrieval/types.ts";
import { buildInspectionNotes, classifyFailureCauses } from "./analysis.ts";
import type {
  RetrievalInspection,
  RetrievalInspectionExpected
} from "./types.ts";
import {
  buildBm25Preview,
  buildHybridPreview,
  buildVectorPreview,
  computeHitStatus,
  createCacheDocumentMap,
  createDocumentMap
} from "./utils.ts";

const DEFAULT_INDEX_PATH = "embeddings/bm25-index.json";
const DEFAULT_VECTOR_CACHE_PATH = "embeddings/vector-cache.json";
const DEFAULT_GRAPH_PATH = "relations/graph.json";

function createEmptyVectorResponse(query: string): VectorSearchResponse {
  return {
    query,
    results: [],
    diagnostics: {
      queryEmbeddingModel: "",
      candidateCount: 0,
      rawScores: [],
      rejectedResults: [],
      topK: 8,
      minScore: 0
    }
  };
}

async function resolveQueryVector(
  query: string,
  mode: "auto" | "live" | "disabled"
): Promise<{
  queryVector?: number[];
  vectorAvailable: boolean;
  resolvedMode: "auto" | "live" | "disabled";
  note?: string;
}> {
  if (mode === "disabled") {
    return {
      vectorAvailable: false,
      resolvedMode: mode
    };
  }

  if (!process.env.OPENAI_API_KEY && mode === "auto") {
    return {
      vectorAvailable: false,
      resolvedMode: mode,
      note: "OPENAI_API_KEY is not configured, so vector inspection ran in offline mode."
    };
  }

  try {
    const embedding = await embedQueryText(query);
    return {
      queryVector: embedding.vector,
      vectorAvailable: embedding.vector.length > 0,
      resolvedMode: mode
    };
  } catch (error) {
    return {
      vectorAvailable: false,
      resolvedMode: mode,
      note: error instanceof Error ? error.message : "Failed to resolve query embedding."
    };
  }
}

export async function inspectRetrievalQuery(options: {
  query: string;
  expected?: RetrievalInspectionExpected;
  index?: BM25Index;
  cache?: VectorCache;
  graph?: RelationGraph;
  topK?: number;
  vectorMode?: "auto" | "live" | "disabled";
}): Promise<RetrievalInspection> {
  const index = options.index ?? await readBm25Index(DEFAULT_INDEX_PATH);
  const cache = options.cache ?? await readVectorCache(DEFAULT_VECTOR_CACHE_PATH);
  const graph = options.graph ?? await readRelationGraph(DEFAULT_GRAPH_PATH);
  const topK = options.topK ?? 8;
  const vectorMode = options.vectorMode ?? "auto";
  const documentMap = createDocumentMap(index.documents);
  const cacheMap = createCacheDocumentMap(cache.documents);

  const bm25Response = searchBm25Index(index, options.query, { topK });
  const vectorResolution = await resolveQueryVector(options.query, vectorMode);
  const vectorResponse = vectorResolution.vectorAvailable
    ? await searchVectorCache(cache, options.query, {
        topK,
        queryVector: vectorResolution.queryVector,
        liveQueryEmbedding: false
      })
    : createEmptyVectorResponse(options.query);
  const hybridResponse = await searchHybridIndex(index, cache, graph, options.query, {
    topK,
    queryVector: vectorResolution.queryVector,
    liveQueryEmbedding: false
  });

  const bm25TopResults = bm25Response.results.map((result, indexNumber) =>
    buildBm25Preview(result, documentMap, indexNumber + 1)
  );
  const vectorTopResults = vectorResponse.results.map((result, indexNumber) =>
    buildVectorPreview(result, cacheMap, indexNumber + 1)
  );
  const hybridTopResults = hybridResponse.results.map((result, indexNumber) =>
    buildHybridPreview(result, documentMap, indexNumber + 1)
  );
  const graphExpandedResults = hybridResponse.diagnostics.graphExpandedResults.map((result, indexNumber) =>
    buildHybridPreview(result, documentMap, indexNumber + 1)
  );

  const inspection: RetrievalInspection = {
    query: options.query,
    tokenizedQuery: hybridResponse.diagnostics.queryTokens,
    expected: options.expected,
    bm25: {
      response: bm25Response,
      topResults: bm25TopResults,
      rejectedResults: bm25Response.diagnostics.rejectedResults,
      hitStatus: computeHitStatus(bm25TopResults, options.expected),
      diagnostics: bm25Response.diagnostics as unknown as Record<string, unknown>
    },
    vector: {
      response: vectorResponse,
      available: vectorResolution.vectorAvailable,
      mode: vectorResolution.resolvedMode,
      topResults: vectorTopResults,
      rejectedResults: vectorResponse.diagnostics.rejectedResults,
      hitStatus: computeHitStatus(vectorTopResults, options.expected),
      diagnostics: vectorResponse.diagnostics as unknown as Record<string, unknown>
    },
    hybrid: {
      response: hybridResponse,
      topResults: hybridTopResults,
      graphExpandedResults,
      selectedChunksPreview: hybridTopResults.slice(0, 5),
      scoreBreakdown: hybridResponse.diagnostics.normalizedScores.map((item) => ({
        pageId: item.pageId,
        chunkId: item.chunkId,
        source: item.source,
        rawScore: item.rawScore,
        normalizedScore: item.normalizedScore
      })),
      rejectedResults: hybridResponse.diagnostics.rejectedResults,
      hitStatus: computeHitStatus(hybridTopResults, options.expected),
      diagnostics: hybridResponse.diagnostics as unknown as Record<string, unknown>
    },
    analysis: {
      passed: computeHitStatus(hybridTopResults, options.expected).top5 || !options.expected,
      failureCauses: [],
      notes: []
    }
  };

  const notes = buildInspectionNotes(inspection);
  if (vectorResolution.note) {
    notes.unshift(vectorResolution.note);
  }
  inspection.analysis.notes = notes;
  inspection.analysis.failureCauses = classifyFailureCauses({
    inspection,
    expected: options.expected,
    documents: index.documents
  });
  inspection.analysis.passed = inspection.hybrid.hitStatus.top5 || !options.expected;

  return inspection;
}
