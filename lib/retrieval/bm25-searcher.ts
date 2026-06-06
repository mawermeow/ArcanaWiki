import { createTokenizer } from "./tokenizer.ts";
import type { BM25Index, RetrievalDocument, SearchDiagnostics, SearchOptions, SearchResponse, SearchResult } from "./types.ts";

const QUERY_TERM_EXPANSIONS: Record<string, string[]> = {
  love: ["感情", "戀愛", "relationship"],
  career: ["工作", "職涯"],
  work: ["工作", "職涯"],
  relationship: ["關係", "感情"],
  reversed: ["逆位"],
  upright: ["正位"],
  冷淡: ["冷漠", "疏離"],
  逃避: ["退縮", "離開"],
  復合: ["重逢", "前緣"]
};

type InternalScore = {
  document: RetrievalDocument;
  score: number;
  matchedTerms: string[];
};

function buildDocumentMap(documents: RetrievalDocument[]): Map<string, RetrievalDocument> {
  return new Map(documents.map((document) => [document.chunkId, document]));
}

function expandQueryTokens(tokens: string[]): string[] {
  const expanded = [...tokens];
  for (const token of tokens) {
    for (const extra of QUERY_TERM_EXPANSIONS[token] ?? []) {
      expanded.push(extra);
    }
  }
  return Array.from(new Set(expanded));
}

export function searchBm25Index(
  index: BM25Index,
  query: string,
  options: SearchOptions = {}
): SearchResponse {
  const topK = options.topK ?? 8;
  const minScore = options.minScore ?? 0;
  const tokenize = createTokenizer({
    protectedPhrases: index.metadata.tokenizer.protectedPhrases
  });
  const queryTokens = expandQueryTokens(tokenize(query));
  const documentMap = buildDocumentMap(index.documents);
  const scoreMap = new Map<string, InternalScore>();
  const { k1, b } = index.metadata.bm25;
  const documentCount = index.documents.length || 1;

  for (const token of queryTokens) {
    const postings = index.termFrequencies[token];
    const documentFrequency = index.documentFrequencies[token];
    if (!postings || !documentFrequency) {
      continue;
    }

    const idf = Math.log(1 + (documentCount - documentFrequency + 0.5) / (documentFrequency + 0.5));
    for (const posting of postings) {
      const document = documentMap.get(posting.documentId);
      if (!document) {
        continue;
      }
      const denominator =
        posting.frequency +
        k1 * (1 - b + b * (document.tokenCount / (index.averageDocumentLength || 1)));
      const termScore = idf * ((posting.frequency * (k1 + 1)) / denominator);
      const existing = scoreMap.get(posting.documentId) ?? {
        document,
        score: 0,
        matchedTerms: []
      };
      existing.score += termScore;
      if (!existing.matchedTerms.includes(token)) {
        existing.matchedTerms.push(token);
      }
      scoreMap.set(posting.documentId, existing);
    }
  }

  const ranked = Array.from(scoreMap.values())
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.document.chunkId.localeCompare(right.document.chunkId, "en");
    });

  const kept = ranked.filter((item) => item.score >= minScore).slice(0, topK);
  const results: SearchResult[] = kept.map((item) => ({
    score: Number(item.score.toFixed(6)),
    pageId: item.document.pageId,
    chunkId: item.document.chunkId,
    title: item.document.title,
    sectionTitle: item.document.sectionTitle,
    matchedTerms: item.matchedTerms.sort((a, b) => a.localeCompare(b, "en")),
    source: "bm25",
    tags: item.document.tags,
    topics: item.document.topics,
    path: item.document.path
  }));

  const rejectedResults = ranked
    .filter((item, indexNumber) => item.score < minScore || indexNumber >= topK)
    .map((item) => ({
      pageId: item.document.pageId,
      chunkId: item.document.chunkId,
      score: Number(item.score.toFixed(6)),
      reason: item.score < minScore ? "below_min_score" : "outside_top_k"
    }));

  const diagnostics: SearchDiagnostics = {
    tokenizedQuery: queryTokens,
    rawScores: ranked.map((item) => ({
      pageId: item.document.pageId,
      chunkId: item.document.chunkId,
      score: Number(item.score.toFixed(6)),
      matchedTerms: item.matchedTerms.sort((a, b) => a.localeCompare(b, "en"))
    })),
    rejectedResults,
    topK,
    averageScore: Number(
      (
        ranked.reduce((sum, item) => sum + item.score, 0) /
        (ranked.length || 1)
      ).toFixed(6)
    )
  };

  return {
    query,
    results,
    diagnostics
  };
}
