import type {
  HybridRejectedResult,
  HybridSearchResponse,
  RetrievalDocument,
  SearchResponse,
  VectorSearchResponse
} from "../retrieval/types.ts";

export type RetrievalFailureCause =
  | "missing-wiki-content"
  | "bad-tokenization"
  | "bad-metadata"
  | "weak-vector-match"
  | "bad-score-normalization"
  | "graph-noise"
  | "unknown";

export type RetrievalInspectionExpected = {
  cards?: string[];
  topics?: string[];
  keywords?: string[];
};

export type InspectorHitStatus = {
  any: boolean;
  cardHit: boolean;
  topicHit: boolean;
  keywordHit: boolean;
  top1: boolean;
  top3: boolean;
  top5: boolean;
};

export type InspectorResultPreview = {
  rank: number;
  pageId: string;
  chunkId: string;
  title: string;
  sectionTitle: string;
  score: number;
  finalScore?: number;
  sourceScores?: Record<string, number | undefined>;
  sources?: string[];
  matchedTerms: string[];
  tags: string[];
  topics: string[];
  keywords: string[];
  relatedCards: string[];
  preview: string;
};

export type InspectorEngineSummary = {
  topResults: InspectorResultPreview[];
  rejectedResults: Array<HybridRejectedResult | Record<string, unknown>>;
  hitStatus: InspectorHitStatus;
  diagnostics: Record<string, unknown>;
};

export type RetrievalInspection = {
  query: string;
  tokenizedQuery: string[];
  expected?: RetrievalInspectionExpected;
  bm25: InspectorEngineSummary & {
    response: SearchResponse;
  };
  vector: InspectorEngineSummary & {
    available: boolean;
    mode: "auto" | "live" | "disabled";
    response: VectorSearchResponse;
  };
  hybrid: InspectorEngineSummary & {
    response: HybridSearchResponse;
    graphExpandedResults: InspectorResultPreview[];
    selectedChunksPreview: InspectorResultPreview[];
    scoreBreakdown: Array<{
      pageId: string;
      chunkId: string;
      source: string;
      rawScore: number;
      normalizedScore: number;
    }>;
  };
  analysis: {
    passed: boolean;
    failureCauses: RetrievalFailureCause[];
    notes: string[];
  };
};

export type RetrievalEvalInspectionEntry = {
  category: string;
  inspection: RetrievalInspection;
  bm25: InspectorHitStatus;
  vector: InspectorHitStatus;
  hybrid: InspectorHitStatus;
  likelyCause: RetrievalFailureCause[];
};

export type RetrievalEvalInspectionReport = {
  generatedAt: string;
  datasetPath: string;
  vectorMode: "auto" | "live" | "disabled";
  queryCount: number;
  summary: {
    bm25: {
      top1: number;
      top3: number;
      top5: number;
    };
    vector: {
      top1: number;
      top3: number;
      top5: number;
    };
    hybrid: {
      top1: number;
      top3: number;
      top5: number;
    };
  };
  failureCases: Array<{
    category: string;
    query: string;
    likelyCause: RetrievalFailureCause[];
    notes: string[];
  }>;
  queries: RetrievalEvalInspectionEntry[];
};

export type RetrievalInspectionFixtures = {
  documents: RetrievalDocument[];
  cacheDocumentsByChunkId: Map<string, {
    tags: string[];
    topics: string[];
    keywords: string[];
    relatedCards: string[];
    preview: string;
  }>;
};
