import path from "node:path";
import { promises as fs } from "node:fs";

import { normalizeText, splitKeywordLine, stripMarkdown, uniqueSorted } from "./normalizer.ts";
import type { WikiHeading, WikiPage, WikiPageFrontmatter } from "./types.ts";

const RETRIEVAL_WIKI_DIRECTORIES = new Set([
  "cards",
  "concepts",
  "emotions",
  "relationships",
  "patterns"
]);

async function walkMarkdownFiles(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .sort((a, b) => a.name.localeCompare(b.name, "en"))
      .map(async (entry) => {
        const fullPath = path.join(rootDir, entry.name);
        if (entry.isDirectory()) {
          return walkMarkdownFiles(fullPath);
        }
        return entry.name.endsWith(".md") ? [fullPath] : [];
      })
  );
  return files.flat();
}

function arrayify(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (value === undefined || value === null || value === "") {
    return [];
  }
  return [String(value)];
}

function parseFrontmatter(raw: string): {
  frontmatter: WikiPageFrontmatter;
  body: string;
} {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { frontmatter: {}, body: raw };
  }

  const frontmatter: WikiPageFrontmatter = {};
  const mutableFrontmatter = frontmatter as Record<string, unknown>;
  let currentKey: keyof WikiPageFrontmatter | null = null;
  for (const line of match[1].split("\n")) {
    const keyMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (keyMatch) {
      const key = keyMatch[1] as keyof WikiPageFrontmatter;
      const value = keyMatch[2];
      if (value === "") {
        mutableFrontmatter[key] = [];
        currentKey = key;
      } else {
        mutableFrontmatter[key] = value;
        currentKey = null;
      }
      continue;
    }
    const itemMatch = line.match(/^\s*-\s+(.*)$/);
    if (itemMatch && currentKey) {
      const current = frontmatter[currentKey];
      if (Array.isArray(current)) {
        current.push(itemMatch[1]);
      }
    }
  }

  return { frontmatter, body: raw.slice(match[0].length) };
}

function extractHeadings(content: string): WikiHeading[] {
  return content
    .split("\n")
    .map((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.*)$/);
      if (!match) {
        return null;
      }
      return {
        depth: match[1].length,
        title: normalizeText(match[2]),
        line: index + 1
      };
    })
    .filter((heading): heading is WikiHeading => heading !== null);
}

function extractSectionBody(content: string, sectionTitle: string): string {
  const lines = content.split("\n");
  let capture = false;
  const result: string[] = [];
  for (const line of lines) {
    if (line.startsWith(`## ${sectionTitle}`)) {
      capture = true;
      continue;
    }
    if (capture && /^##\s+/.test(line)) {
      break;
    }
    if (capture) {
      result.push(line);
    }
  }
  return normalizeText(result.join("\n"));
}

function extractRelatedLinks(content: string, sectionTitle: string): string[] {
  const lines = extractSectionBody(content, sectionTitle).split("\n");
  const matches = lines
    .map((line) => line.match(/\]\(([^)]+)\)/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => path.basename(match[1], ".md"));
  return uniqueSorted(matches);
}

function extractInlineKeywords(content: string): string[] {
  const section = extractSectionBody(content, "核心關鍵字");
  return uniqueSorted(splitKeywordLine(stripMarkdown(section)));
}

function isRetrievalWikiFile(filePath: string, wikiRoot: string): boolean {
  const relativePath = path.relative(wikiRoot, filePath);
  const [topLevelDirectory] = relativePath.split(path.sep);
  return RETRIEVAL_WIKI_DIRECTORIES.has(topLevelDirectory ?? "");
}

export async function loadWikiPages(wikiRoot = "wiki"): Promise<WikiPage[]> {
  const files = (await walkMarkdownFiles(wikiRoot))
    .filter((filePath) => isRetrievalWikiFile(filePath, wikiRoot))
    .sort((a, b) => a.localeCompare(b, "en"));

  const pages = await Promise.all(
    files.map(async (filePath) => {
      const raw = await fs.readFile(filePath, "utf8");
      const { frontmatter, body } = parseFrontmatter(raw);
      const pageId = String(frontmatter.pageId ?? frontmatter.id ?? path.basename(filePath, ".md"));
      const title = String(frontmatter.title ?? pageId);
      const tags = uniqueSorted(arrayify(frontmatter.tags).map((value) => normalizeText(String(value))));
      const topics = uniqueSorted(arrayify(frontmatter.topics).map((value) => normalizeText(String(value))));
      const relatedCards = uniqueSorted([
        ...arrayify(frontmatter.related_cards),
        ...extractRelatedLinks(body, "相關牌卡"),
        ...extractRelatedLinks(body, "相關牌卡／概念")
      ]);
      const relatedSpreads = uniqueSorted([
        ...arrayify(frontmatter.related_spreads),
        ...extractRelatedLinks(body, "相關牌陣")
      ]);
      const keywords = uniqueSorted([
        ...tags,
        ...topics,
        ...extractInlineKeywords(body)
      ]);

      return {
        id: pageId,
        pageId,
        path: filePath,
        type: String(frontmatter.type ?? (filePath.includes("/patterns/") ? "spread" : "card")),
        title,
        titleEn: frontmatter.titleEn ? String(frontmatter.titleEn) : undefined,
        titleZh: frontmatter.titleZh ? String(frontmatter.titleZh) : undefined,
        summary: normalizeText(String(frontmatter.summary ?? "")),
        tags,
        topics,
        keywords,
        relatedCards,
        relatedSpreads,
        frontmatter,
        content: normalizeText(body),
        headings: extractHeadings(body)
      } satisfies WikiPage;
    })
  );

  return pages.sort((a, b) => a.pageId.localeCompare(b.pageId, "en"));
}
