import { normalizeText } from "../retrieval/normalizer.ts";
import type { RetrievalDocument, VectorCacheDocument } from "../retrieval/types.ts";
import type {
  InspectorHitStatus,
  InspectorResultPreview,
  RetrievalInspectionExpected
} from "./types.ts";

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function normalizeKeyword(value: string): string {
  return normalizeText(value).toLowerCase();
}

export function createDocumentMap(documents: RetrievalDocument[]): Map<string, RetrievalDocument> {
  return new Map(documents.map((document) => [document.chunkId, document]));
}

export function createCacheDocumentMap(
  documents: VectorCacheDocument[]
): Map<string, VectorCacheDocument> {
  return new Map(documents.map((document) => [document.chunkId, document]));
}

export function createPreview(text: string, maxLength = 120): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 1)}...`;
}

export function buildBm25Preview(result: {
  pageId: string;
  chunkId: string;
  title: string;
  sectionTitle: string;
  score: number;
  matchedTerms?: string[];
  metadata?: Record<string, unknown>;
}, documentMap: Map<string, RetrievalDocument>, rank: number): InspectorResultPreview {
  const document = documentMap.get(result.chunkId);
  return {
    rank,
    pageId: result.pageId,
    chunkId: result.chunkId,
    title: result.title,
    sectionTitle: result.sectionTitle,
    score: result.score,
    matchedTerms: result.matchedTerms ?? [],
    tags: Array.isArray(document?.tags) ? document.tags : [],
    topics: Array.isArray(document?.topics) ? document.topics : [],
    keywords: Array.isArray(document?.keywords) ? document.keywords : [],
    relatedCards: Array.isArray(document?.relatedCards) ? document.relatedCards : [],
    preview: createPreview(document?.content ?? "")
  };
}

export function buildVectorPreview(result: {
  pageId: string;
  chunkId: string;
  title: string;
  sectionTitle: string;
  score: number;
  metadata?: Record<string, unknown>;
}, cacheMap: Map<string, VectorCacheDocument>, rank: number): InspectorResultPreview {
  const document = cacheMap.get(result.chunkId);
  const metadata = document?.metadata;
  return {
    rank,
    pageId: result.pageId,
    chunkId: result.chunkId,
    title: result.title,
    sectionTitle: result.sectionTitle,
    score: result.score,
    matchedTerms: [],
    tags: Array.isArray(metadata?.tags) ? metadata.tags : [],
    topics: Array.isArray(metadata?.topics) ? metadata.topics : [],
    keywords: Array.isArray(metadata?.keywords) ? metadata.keywords : [],
    relatedCards: Array.isArray(metadata?.relatedCards) ? metadata.relatedCards : [],
    preview: createPreview(document?.text ?? "")
  };
}

export function buildHybridPreview(result: {
  pageId: string;
  chunkId: string;
  title: string;
  sectionTitle: string;
  finalScore: number;
  sourceScores: Record<string, number | undefined>;
  sources: string[];
  matchedTerms?: string[];
  metadata?: Record<string, unknown>;
}, documentMap: Map<string, RetrievalDocument>, rank: number): InspectorResultPreview {
  const document = documentMap.get(result.chunkId);
  const metadata = result.metadata ?? {};
  return {
    rank,
    pageId: result.pageId,
    chunkId: result.chunkId,
    title: result.title,
    sectionTitle: result.sectionTitle,
    score: result.finalScore,
    finalScore: result.finalScore,
    sourceScores: result.sourceScores,
    sources: result.sources,
    matchedTerms: result.matchedTerms ?? [],
    tags: Array.isArray(metadata.tags) ? metadata.tags.map(String) : document?.tags ?? [],
    topics: Array.isArray(metadata.topics) ? metadata.topics.map(String) : document?.topics ?? [],
    keywords: Array.isArray(metadata.keywords) ? metadata.keywords.map(String) : document?.keywords ?? [],
    relatedCards: Array.isArray(metadata.relatedCards)
      ? metadata.relatedCards.map(String)
      : document?.relatedCards ?? [],
    preview: createPreview(document?.content ?? "")
  };
}

function matchesExpectedCard(pageId: string, expected: RetrievalInspectionExpected | undefined): boolean {
  return Boolean(expected?.cards?.includes(pageId));
}

function matchesExpectedTopic(topics: string[], expected: RetrievalInspectionExpected | undefined): boolean {
  return Boolean(expected?.topics?.some((topic) => topics.includes(topic)));
}

function matchesExpectedKeyword(item: InspectorResultPreview, expected: RetrievalInspectionExpected | undefined): boolean {
  const expectedKeywords = expected?.keywords ?? [];
  if (expectedKeywords.length === 0) {
    return false;
  }
  const haystacks = unique([
    item.title,
    item.sectionTitle,
    item.preview,
    ...item.matchedTerms,
    ...item.tags,
    ...item.topics,
    ...item.keywords
  ]).map(normalizeKeyword);
  return expectedKeywords.some((keyword) => {
    const normalizedKeyword = normalizeKeyword(keyword);
    return haystacks.some((value) => value.includes(normalizedKeyword));
  });
}

export function computeHitStatus(
  results: InspectorResultPreview[],
  expected?: RetrievalInspectionExpected
): InspectorHitStatus {
  const top1 = results.slice(0, 1);
  const top3 = results.slice(0, 3);
  const top5 = results.slice(0, 5);

  const hasHit = (items: InspectorResultPreview[]) =>
    items.some((item) =>
      matchesExpectedCard(item.pageId, expected) ||
      matchesExpectedTopic(item.topics, expected) ||
      matchesExpectedKeyword(item, expected)
    );

  return {
    any: hasHit(results),
    cardHit: results.some((item) => matchesExpectedCard(item.pageId, expected)),
    topicHit: results.some((item) => matchesExpectedTopic(item.topics, expected)),
    keywordHit: results.some((item) => matchesExpectedKeyword(item, expected)),
    top1: hasHit(top1),
    top3: hasHit(top3),
    top5: hasHit(top5)
  };
}

export function searchCorpusForExpected(
  documents: RetrievalDocument[],
  expected?: RetrievalInspectionExpected
): {
  hasExpectedCard: boolean;
  hasExpectedTopic: boolean;
  hasExpectedKeyword: boolean;
} {
  const normalizedKeywords = (expected?.keywords ?? []).map(normalizeKeyword);
  return {
    hasExpectedCard: Boolean(expected?.cards?.some((cardId) => documents.some((document) => document.pageId === cardId))),
    hasExpectedTopic: Boolean(expected?.topics?.some((topic) => documents.some((document) => document.topics.includes(topic)))),
    hasExpectedKeyword: normalizedKeywords.some((keyword) =>
      documents.some((document) => normalizeKeyword(document.searchableText).includes(keyword))
    )
  };
}
