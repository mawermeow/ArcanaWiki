import { normalizeText, slugifySegment, stripMarkdown, uniqueSorted } from "./normalizer.ts";
import type { RetrievalDocument, WikiPage } from "./types.ts";

type SectionNode = {
  title: string;
  depth: number;
  lines: string[];
  children: SectionNode[];
};

function createSectionTree(content: string): { prelude: string[]; sections: SectionNode[] } {
  const lines = content.split("\n");
  const prelude: string[] = [];
  const sections: SectionNode[] = [];
  const stack: SectionNode[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{2,3})\s+(.*)$/);
    if (!headingMatch) {
      if (stack.length === 0) {
        prelude.push(line);
      } else {
        stack[stack.length - 1].lines.push(line);
      }
      continue;
    }

    const node: SectionNode = {
      title: normalizeText(headingMatch[2]),
      depth: headingMatch[1].length,
      lines: [],
      children: []
    };

    while (stack.length > 0 && stack[stack.length - 1].depth >= node.depth) {
      stack.pop();
    }

    if (stack.length === 0) {
      sections.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }

  return { prelude, sections };
}

function createChunkId(pageId: string, parts: string[]): string {
  return `${pageId}::${parts.map((part) => slugifySegment(part)).join("::")}`;
}

function createOverviewChunk(page: WikiPage, prelude: string): RetrievalDocument {
  const sectionTitle = "Overview";
  const content = normalizeText(
    [
      page.summary,
      stripMarkdown(prelude),
      page.keywords.join("、"),
      page.relatedCards.join("、"),
      page.relatedSpreads.join("、")
    ].join("\n\n")
  );

  return {
    id: createChunkId(page.pageId, ["overview"]),
    chunkId: createChunkId(page.pageId, ["overview"]),
    pageId: page.pageId,
    pageType: page.type,
    path: page.path,
    title: page.title,
    sectionTitle,
    sectionPath: [sectionTitle],
    tags: page.tags,
    topics: page.topics,
    keywords: page.keywords,
    relatedCards: uniqueSorted([...page.relatedCards, ...page.relatedSpreads]),
    content,
    searchableText: "",
    tokenCount: 0
  };
}

function flattenNodeContent(node: SectionNode): string {
  const childText = node.children
    .map((child) => `### ${child.title}\n${child.lines.join("\n")}`)
    .join("\n\n");
  return normalizeText([node.lines.join("\n"), childText].filter(Boolean).join("\n\n"));
}

function createDocument(page: WikiPage, sectionPath: string[], content: string): RetrievalDocument {
  const sectionTitle = sectionPath[sectionPath.length - 1];
  return {
    id: createChunkId(page.pageId, sectionPath),
    chunkId: createChunkId(page.pageId, sectionPath),
    pageId: page.pageId,
    pageType: page.type,
    path: page.path,
    title: page.title,
    sectionTitle,
    sectionPath,
    tags: page.tags,
    topics: page.topics,
    keywords: page.keywords,
    relatedCards: uniqueSorted([...page.relatedCards, ...page.relatedSpreads]),
    content: normalizeText(stripMarkdown(content)),
    searchableText: "",
    tokenCount: 0
  };
}

function shouldIndexSection(sectionTitle: string, content: string): boolean {
  const normalizedTitle = normalizeText(sectionTitle);
  const normalizedContent = normalizeText(stripMarkdown(content));
  if (!normalizedContent) {
    return false;
  }
  if (["Citation", "See Also"].includes(normalizedTitle)) {
    return false;
  }
  if (/^\（?待補充/.test(normalizedContent) || /^\(?待補充/.test(normalizedContent)) {
    return false;
  }
  return true;
}

export function chunkWikiPage(page: WikiPage): RetrievalDocument[] {
  const { prelude, sections } = createSectionTree(page.content);
  const documents: RetrievalDocument[] = [createOverviewChunk(page, prelude.join("\n"))];

  for (const section of sections) {
    if (section.title === "情境解讀" && section.children.length > 0) {
      for (const child of section.children) {
        const childContent = child.lines.join("\n");
        if (shouldIndexSection(child.title, childContent)) {
          documents.push(
            createDocument(page, [section.title, child.title], childContent)
          );
        }
      }
      continue;
    }

    const sectionContent = flattenNodeContent(section);
    if (shouldIndexSection(section.title, sectionContent)) {
      documents.push(createDocument(page, [section.title], sectionContent));
    }
  }

  return documents.filter((document) => document.content.length > 0);
}
