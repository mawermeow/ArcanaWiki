import type { CitationValidationResult, TarotAnswerSelectedSource } from "./types.ts";

const CITATION_PATTERN = /\[來源:\s*([^#\]]+)#([^\]]+)\]/g;

export function extractSourceCitations(answer: string): string[] {
  return Array.from(answer.matchAll(CITATION_PATTERN)).map((match) => `${match[1]}#${match[2]}`);
}

export function validateCitations(
  answer: string,
  selectedSources: TarotAnswerSelectedSource[]
): CitationValidationResult {
  const citations = extractSourceCitations(answer);
  const allowed = new Set(selectedSources.map((source) => `${source.pageId}#${source.chunkId}`));
  const errors: string[] = [];

  if (selectedSources.length > 0 && citations.length === 0) {
    errors.push("Answer did not include any source citations.");
  }

  for (const citation of citations) {
    if (!allowed.has(citation)) {
      errors.push(`Invalid citation: ${citation}`);
    }
  }

  return {
    citedSourceKeys: citations,
    errors
  };
}
