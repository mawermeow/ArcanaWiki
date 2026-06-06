import { chunkWikiPage } from "./chunking.ts";
import { normalizeText, uniqueSorted } from "./normalizer.ts";
import { buildProtectedPhrases, createTokenizer } from "./tokenizer.ts";
import type { BM25Index, BM25Posting, RetrievalDocument, WikiPage } from "./types.ts";

function buildSearchableText(document: RetrievalDocument): string {
  return normalizeText(
    [
      document.title,
      document.sectionPath.join(" "),
      document.tags.join(" "),
      document.topics.join(" "),
      document.keywords.join(" "),
      document.relatedCards.join(" "),
      document.content
    ].join("\n")
  );
}

function sortRecordKeys<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right, "en"))
  );
}

export function createRetrievalDocuments(pages: WikiPage[]): RetrievalDocument[] {
  return pages
    .flatMap((page) => chunkWikiPage(page))
    .sort((a, b) => a.chunkId.localeCompare(b.chunkId, "en"));
}

export function buildBm25Index(
  pages: WikiPage[],
  options: { k1?: number; b?: number } = {}
): BM25Index {
  const k1 = options.k1 ?? 1.5;
  const b = options.b ?? 0.75;
  const protectedPhrases = buildProtectedPhrases(pages);
  const tokenize = createTokenizer({ protectedPhrases });
  const rawDocuments = createRetrievalDocuments(pages);

  const documents = rawDocuments.map((document) => {
    const searchableText = buildSearchableText(document);
    const tokenCount = tokenize(searchableText).length;
    return {
      ...document,
      searchableText,
      tokenCount
    };
  });

  const termFrequencies: Record<string, BM25Posting[]> = {};
  const documentFrequencies: Record<string, number> = {};

  for (const document of documents) {
    const tokens = tokenize(document.searchableText);
    const counts = new Map<string, number>();
    for (const token of tokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }

    for (const [term, frequency] of Array.from(counts.entries()).sort(([left], [right]) =>
      left.localeCompare(right, "en")
    )) {
      const postings = termFrequencies[term] ?? [];
      postings.push({ documentId: document.chunkId, frequency });
      termFrequencies[term] = postings.sort((left, right) =>
        left.documentId.localeCompare(right.documentId, "en")
      );
      documentFrequencies[term] = (documentFrequencies[term] ?? 0) + 1;
    }
  }

  const averageDocumentLength =
    documents.reduce((sum, document) => sum + document.tokenCount, 0) /
      (documents.length || 1) || 0;

  return {
    metadata: {
      version: 1,
      deterministic: true,
      sourcePattern: "wiki/**/*.md",
      documentCount: documents.length,
      pageCount: pages.length,
      termCount: Object.keys(termFrequencies).length,
      averageDocumentLength,
      bm25: { k1, b },
      tokenizer: {
        protectedPhrases,
        notes: [
          "Preserves tarot phrases such as 女祭司 and 聖杯二逆位.",
          "Keeps upright/reversed and mixed Chinese-English query terms.",
          "Uses gentle normalization without stemming."
        ]
      },
      pageIds: uniqueSorted(pages.map((page) => page.pageId)),
      tags: uniqueSorted(pages.flatMap((page) => page.tags)),
      topics: uniqueSorted(pages.flatMap((page) => page.topics))
    },
    documents,
    termFrequencies: sortRecordKeys(termFrequencies),
    documentFrequencies: sortRecordKeys(documentFrequencies),
    averageDocumentLength
  };
}
