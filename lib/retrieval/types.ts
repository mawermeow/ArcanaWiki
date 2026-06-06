export type WikiHeading = {
  depth: number;
  title: string;
  line: number;
};

export type WikiPageFrontmatter = {
  id?: string;
  pageId?: string;
  type?: string;
  title?: string;
  titleEn?: string;
  titleZh?: string;
  summary?: string;
  tags?: string[];
  topics?: string[];
  related_cards?: string[];
  related_spreads?: string[];
  source_refs?: string[];
  raw_refs?: string[];
  updated?: string;
};

export type WikiPage = {
  id: string;
  pageId: string;
  path: string;
  type: string;
  title: string;
  titleEn?: string;
  titleZh?: string;
  summary: string;
  tags: string[];
  topics: string[];
  keywords: string[];
  relatedCards: string[];
  relatedSpreads: string[];
  frontmatter: WikiPageFrontmatter;
  content: string;
  headings: WikiHeading[];
};

export type RetrievalDocument = {
  id: string;
  chunkId: string;
  pageId: string;
  pageType: string;
  path: string;
  title: string;
  sectionTitle: string;
  sectionPath: string[];
  tags: string[];
  topics: string[];
  keywords: string[];
  relatedCards: string[];
  content: string;
  searchableText: string;
  tokenCount: number;
};

export type RetrievalSource = "bm25" | "vector" | "graph";

export type RetrievalResult = {
  chunkId: string;
  pageId: string;
  score: number;
  source: RetrievalSource;
  title: string;
  sectionTitle?: string;
  metadata?: Record<string, unknown>;
};

export type BM25Posting = {
  documentId: string;
  frequency: number;
};

export type BM25IndexMetadata = {
  version: number;
  deterministic: boolean;
  sourcePattern: string;
  documentCount: number;
  pageCount: number;
  termCount: number;
  averageDocumentLength: number;
  bm25: {
    k1: number;
    b: number;
  };
  tokenizer: {
    protectedPhrases: string[];
    notes: string[];
  };
  pageIds: string[];
  tags: string[];
  topics: string[];
};

export type BM25Index = {
  metadata: BM25IndexMetadata;
  documents: RetrievalDocument[];
  termFrequencies: Record<string, BM25Posting[]>;
  documentFrequencies: Record<string, number>;
  averageDocumentLength: number;
};

export type SearchOptions = {
  topK?: number;
  minScore?: number;
  indexPath?: string;
};

export type SearchResult = RetrievalResult & {
  sectionTitle: string;
  matchedTerms: string[];
  tags: string[];
  topics: string[];
  path: string;
  metadata?: Record<string, unknown>;
};

export type RejectedResult = {
  pageId: string;
  chunkId: string;
  score: number;
  reason: string;
};

export type SearchDiagnostics = {
  tokenizedQuery: string[];
  rawScores: Array<{
    pageId: string;
    chunkId: string;
    score: number;
    matchedTerms: string[];
  }>;
  rejectedResults: RejectedResult[];
  topK: number;
  averageScore: number;
};

export type SearchResponse = {
  query: string;
  results: SearchResult[];
  diagnostics: SearchDiagnostics;
};

export type VectorCacheDocument = {
  chunkId: string;
  pageId: string;
  contentHash: string;
  text: string;
  title: string;
  sectionTitle: string;
  metadata: {
    pageType: string;
    path: string;
    tags: string[];
    topics: string[];
    keywords: string[];
    relatedCards: string[];
    sectionPath: string[];
    stale?: boolean;
  };
  vector: number[];
};

export type VectorCache = {
  embeddingModel: string;
  embeddingDimension: number;
  generatedAt: string;
  documents: VectorCacheDocument[];
};

export type VectorCacheBuildSummary = {
  totalChunks: number;
  reusedEmbeddings: number;
  generatedEmbeddings: number;
  staleEmbeddings: number;
  embeddingModel: string;
  dimension: number;
};

export type VectorSearchOptions = {
  topK?: number;
  minScore?: number;
  cachePath?: string;
  cache?: VectorCache;
  queryVector?: number[];
  liveQueryEmbedding?: boolean;
  embeddingModel?: string;
  embedQuery?: (text: string, model: string) => Promise<number[]>;
};

export type VectorSearchResult = RetrievalResult & {
  sectionTitle: string;
  source: "vector";
  metadata: Record<string, unknown>;
};

export type VectorSearchDiagnostics = {
  queryEmbeddingModel: string;
  candidateCount: number;
  rawScores: Array<{
    pageId: string;
    chunkId: string;
    score: number;
  }>;
  rejectedResults: RejectedResult[];
  topK: number;
  minScore: number;
};

export type VectorSearchResponse = {
  query: string;
  results: VectorSearchResult[];
  diagnostics: VectorSearchDiagnostics;
};

export type GraphRelationType =
  | "symbolic"
  | "emotional"
  | "archetype"
  | "narrative"
  | "contrast";

export type RelationGraphNode = {
  id: string;
  type: string;
  title: string;
  path: string;
};

export type RelationGraphRelationship = {
  source: string;
  target: string;
  type: GraphRelationType;
  reason: string;
  evidence?: {
    page?: string;
    section?: string;
  };
};

export type RelationGraph = {
  generatedAt?: string;
  nodes: RelationGraphNode[];
  relationships: RelationGraphRelationship[];
};

export type HybridSearchWeights = {
  bm25: number;
  vector: number;
  graph: number;
};

export type HybridSourceScores = {
  bm25?: number;
  vector?: number;
  graph?: number;
};

export type HybridSearchResult = {
  chunkId: string;
  pageId: string;
  title: string;
  sectionTitle: string;
  finalScore: number;
  sourceScores: HybridSourceScores;
  sources: RetrievalSource[];
  matchedTerms?: string[];
  metadata: Record<string, unknown>;
};

export type HybridRejectedResult = {
  pageId: string;
  chunkId: string;
  stage: "bm25" | "vector" | "graph" | "final";
  reason: string;
  score?: number;
};

export type HybridNormalizedScore = {
  source: RetrievalSource;
  pageId: string;
  chunkId: string;
  rawScore: number;
  normalizedScore: number;
};

export type HybridDiagnostics = {
  bm25Results: SearchResult[];
  vectorResults: VectorSearchResult[];
  normalizedScores: HybridNormalizedScore[];
  mergedResults: HybridSearchResult[];
  graphExpandedResults: HybridSearchResult[];
  rejectedResults: HybridRejectedResult[];
  finalResults: HybridSearchResult[];
  weights: HybridSearchWeights;
  topK: number;
  timingMs: {
    bm25: number;
    vector: number;
    merge: number;
    graph: number;
    total: number;
  };
  queryTokens: string[];
};

export type HybridSearchResponse = {
  query: string;
  results: HybridSearchResult[];
  diagnostics: HybridDiagnostics;
};

export type HybridSearchOptions = {
  topK?: number;
  bm25TopK?: number;
  vectorTopK?: number;
  graphTopK?: number;
  minBm25Score?: number;
  minVectorScore?: number;
  graphExpansion?: boolean;
  weights?: Partial<HybridSearchWeights>;
  indexPath?: string;
  cachePath?: string;
  graphPath?: string;
  index?: BM25Index;
  cache?: VectorCache;
  graph?: RelationGraph;
  queryVector?: number[];
  liveQueryEmbedding?: boolean;
  embeddingModel?: string;
  embedQuery?: (text: string, model: string) => Promise<number[]>;
};

export type EvaluationEntry = {
  query: string;
  expected_topics: string[];
  expected_cards: string[];
  expected_keywords: string[];
};

export type EvaluationDataset = {
  generatedAt?: string;
  source?: string;
  categories: Record<string, EvaluationEntry[]>;
};
