import type { CitationValidationResult, TarotAnswerSelectedSource } from "./types.ts";

const CITATION_PATTERN = /\[來源:\s*([^#\]]+)#([^\]]+)\]/g;
const CITATION_BLOCK_HEADING = "引用來源";

export function extractSourceCitations(answer: string): string[] {
  return Array.from(answer.matchAll(CITATION_PATTERN)).map((match) => `${match[1]}#${match[2]}`);
}

export function stripSourceCitations(answer: string): string {
  return answer
    .replace(CITATION_PATTERN, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function renderCitationBlock(selectedSources: TarotAnswerSelectedSource[]): string {
  if (selectedSources.length === 0) {
    return "";
  }

  const lines = selectedSources.map((source) => {
    const section = source.sectionTitle ? ` / ${source.sectionTitle}` : "";
    return `- ${source.title}${section} [來源: ${source.pageId}#${source.chunkId}]`;
  });

  return `${CITATION_BLOCK_HEADING}：\n${lines.join("\n")}`;
}

export function attachSelectedSourceCitations(
  answer: string,
  selectedSources: TarotAnswerSelectedSource[]
): string {
  const stripped = stripSourceCitations(answer);
  const citationBlock = renderCitationBlock(selectedSources);

  if (!citationBlock) {
    return stripped;
  }

  return `${stripped}\n\n${citationBlock}`.trim();
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
