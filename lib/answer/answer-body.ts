export type AnswerDisplayBlock =
  | { type: "section"; title: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

const SECTION_LINE = /^\d+\.\s+(.+)$/;
const BULLET_LINE = /^\s*-\s+(.+)$/;

function flushParagraph(lines: string[], blocks: AnswerDisplayBlock[]) {
  const text = lines.join("\n").trim();
  if (text.length > 0) {
    blocks.push({ type: "paragraph", text });
  }
  lines.length = 0;
}

function flushList(items: string[], blocks: AnswerDisplayBlock[]) {
  if (items.length > 0) {
    blocks.push({ type: "list", items: [...items] });
    items.length = 0;
  }
}

export function parseAnswerBody(text: string): AnswerDisplayBlock[] {
  const blocks: AnswerDisplayBlock[] = [];
  const paragraphLines: string[] = [];
  const listItems: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      flushParagraph(paragraphLines, blocks);
      flushList(listItems, blocks);
      continue;
    }

    const sectionMatch = trimmed.match(SECTION_LINE);
    if (sectionMatch) {
      flushParagraph(paragraphLines, blocks);
      flushList(listItems, blocks);
      blocks.push({ type: "section", title: sectionMatch[1].trim() });
      continue;
    }

    const bulletMatch = trimmed.match(BULLET_LINE);
    if (bulletMatch) {
      flushParagraph(paragraphLines, blocks);
      listItems.push(bulletMatch[1].trim());
      continue;
    }

    flushList(listItems, blocks);
    paragraphLines.push(trimmed);
  }

  flushParagraph(paragraphLines, blocks);
  flushList(listItems, blocks);

  return blocks;
}

export function hasStructuredAnswerBody(text: string): boolean {
  return parseAnswerBody(text).some((block) => block.type === "section" || block.type === "list");
}
