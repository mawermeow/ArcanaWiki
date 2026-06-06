import type { BM25Index, HybridSearchResponse, RetrievalDocument } from "../retrieval/types.ts";
import type { AnswerContext, TarotAnswerRequest } from "./types.ts";

function getRepresentativeDocument(index: BM25Index, pageId: string): RetrievalDocument | undefined {
  return index.documents.find((document) => document.pageId === pageId);
}

function formatCardLine(request: TarotAnswerRequest, index: BM25Index): string[] {
  return (request.cards ?? []).map((card) => {
    const title = getRepresentativeDocument(index, card.cardId)?.title ?? card.cardId;
    const orientation =
      card.orientation === "reversed"
        ? "逆位"
        : card.orientation === "upright"
          ? "正位"
          : "未知";
    const position = card.position ? `，位置：${card.position}` : "";
    return `${title}（${card.cardId}，${orientation}${position}）`;
  });
}

export function buildAnswerQuery(request: TarotAnswerRequest, index: BM25Index): string {
  const parts = [request.question.trim()];
  const cardLines = formatCardLine(request, index);

  if (cardLines.length > 0) {
    parts.push(cardLines.join(" "));
  }

  if (request.spreadId) {
    parts.push(`spread:${request.spreadId}`);
  }

  return parts.filter(Boolean).join(" ").trim();
}

export function buildAnswerContext(options: {
  request: TarotAnswerRequest;
  index: BM25Index;
  retrieval: HybridSearchResponse;
  maxChunks?: number;
}): AnswerContext {
  const limit = options.maxChunks ?? Number(process.env.TAROT_FINAL_CONTEXT_TOP_K ?? 6);
  const documentMap = new Map(options.index.documents.map((document) => [document.chunkId, document]));
  const selectedResults = options.retrieval.results.slice(0, limit);

  const chunks = selectedResults
    .map((result) => {
      const document = documentMap.get(result.chunkId);
      if (!document) {
        return undefined;
      }
      return {
        pageId: result.pageId,
        chunkId: result.chunkId,
        title: result.title,
        sectionTitle: result.sectionTitle,
        tags: document.tags,
        topics: document.topics,
        content: document.content
      };
    })
    .filter((chunk): chunk is NonNullable<typeof chunk> => Boolean(chunk));

  return {
    query: buildAnswerQuery(options.request, options.index),
    selectedSources: chunks.map((chunk) => ({
      pageId: chunk.pageId,
      chunkId: chunk.chunkId,
      title: chunk.title,
      sectionTitle: chunk.sectionTitle
    })),
    chunks,
    renderedContext: chunks
      .map((chunk, index) =>
        [
          `### Chunk ${index + 1}`,
          `SOURCE: ${chunk.pageId}#${chunk.chunkId}`,
          `TITLE: ${chunk.title}`,
          `SECTION: ${chunk.sectionTitle}`,
          `TAGS: ${chunk.tags.join(", ")}`,
          `TOPICS: ${chunk.topics.join(", ")}`,
          "CONTENT:",
          chunk.content
        ].join("\n")
      )
      .join("\n\n")
  };
}
