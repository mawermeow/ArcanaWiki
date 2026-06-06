import path from "node:path";
import { promises as fs } from "node:fs";

import { renderPublicMarkdown, stripInternalMarkdown, stripMarkdownToText } from "./markdown.ts";
import {
  PUBLIC_WIKI_CATEGORIES,
  type PublicWikiBrowseData,
  type PublicWikiCategory,
  type PublicWikiPage
} from "./types.ts";

type Frontmatter = Record<string, string | string[]>;

const CATEGORY_SET = new Set<string>(PUBLIC_WIKI_CATEGORIES);

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, "zh-Hant")
  );
}

async function walkMarkdownFiles(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        return walkMarkdownFiles(fullPath);
      }
      return entry.name.endsWith(".md") ? [fullPath] : [];
    })
  );
  return nested.flat();
}

function arrayify(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (!value) {
    return [];
  }
  return [String(value)];
}

function parseFrontmatter(raw: string): { frontmatter: Frontmatter; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { frontmatter: {}, body: raw };
  }

  const frontmatter: Frontmatter = {};
  let currentKey: string | null = null;

  for (const line of match[1].split("\n")) {
    const keyMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (keyMatch) {
      const key = keyMatch[1];
      const value = keyMatch[2];
      if (!value) {
        frontmatter[key] = [];
        currentKey = key;
      } else {
        frontmatter[key] = value;
        currentKey = null;
      }
      continue;
    }

    const itemMatch = line.match(/^\s*-\s+(.*)$/);
    if (itemMatch && currentKey) {
      const currentValue = frontmatter[currentKey];
      const currentItems = Array.isArray(currentValue) ? currentValue : [];
      currentItems.push(itemMatch[1]);
      frontmatter[currentKey] = currentItems;
    }
  }

  return {
    frontmatter,
    body: raw.slice(match[0].length)
  };
}

function extractPageIdFromTarget(target: string): string | null {
  const cleaned = target.split("#")[0]?.split("?")[0]?.trim() ?? "";
  if (!cleaned || cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
    return null;
  }
  const fileName = cleaned.split("/").pop() ?? cleaned;
  const pageId = fileName.endsWith(".md") ? fileName.slice(0, -3) : fileName;
  return pageId || null;
}

function extractRelatedPageIds(markdown: string): string[] {
  const pageIds = [
    ...markdown.matchAll(/\[\[([^\]]+)\]\]/g),
    ...markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)
  ]
    .map((match) => extractPageIdFromTarget(match[1] ?? ""))
    .filter((value): value is string => Boolean(value));

  return uniqueSorted(pageIds);
}

function deriveCategory(filePath: string, wikiRoot: string): PublicWikiCategory | null {
  const relative = path.relative(wikiRoot, filePath);
  const category = relative.split(path.sep)[0] ?? "";
  return CATEGORY_SET.has(category) ? (category as PublicWikiCategory) : null;
}

function buildHref(category: PublicWikiCategory, pageId: string): string {
  return `/wiki/${category}/${pageId}`;
}

type DraftPublicWikiPage = Omit<PublicWikiPage, "contentHtml"> & {
  rawContent: string;
};

export async function loadPublicWikiPages(wikiRoot = "wiki"): Promise<PublicWikiPage[]> {
  const files = (await walkMarkdownFiles(wikiRoot))
    .filter((filePath) => deriveCategory(filePath, wikiRoot) !== null)
    .sort((left, right) => left.localeCompare(right, "en"));

  const drafts: DraftPublicWikiPage[] = [];

  for (const filePath of files) {
    const category = deriveCategory(filePath, wikiRoot);
    if (!category) {
      continue;
    }

    const raw = await fs.readFile(filePath, "utf8");
    const { frontmatter, body } = parseFrontmatter(raw);
    const pageId = String(frontmatter.pageId ?? frontmatter.id ?? path.basename(filePath, ".md")).trim();
    const visibleMarkdown = stripInternalMarkdown(body);
    const relatedFromBody = extractRelatedPageIds(visibleMarkdown).filter((id) => id !== pageId);

    drafts.push({
      id: pageId,
      title: String(frontmatter.title ?? pageId).trim(),
      category,
      summary: String(frontmatter.summary ?? "").trim() || undefined,
      tags: uniqueSorted(arrayify(frontmatter.tags)),
      topics: uniqueSorted(arrayify(frontmatter.topics)),
      relatedPageIds: uniqueSorted([
        ...arrayify(frontmatter.related_cards),
        ...arrayify(frontmatter.related_spreads),
        ...relatedFromBody
      ]),
      contentText: stripMarkdownToText(visibleMarkdown),
      rawContent: visibleMarkdown,
      href: buildHref(category, pageId),
      slug: [category, pageId]
    });
  }

  const pageMap = new Map(
    drafts.map((page) => [
      page.id,
      {
        href: page.href,
        title: page.title
      }
    ])
  );

  return drafts
    .map(({ rawContent, ...page }) => ({
      ...page,
      relatedPageIds: page.relatedPageIds?.filter((pageId) => pageMap.has(pageId)) ?? [],
      contentHtml: renderPublicMarkdown(rawContent, {
        resolveById: (pageId) => pageMap.get(pageId) ?? null
      })
    }))
    .sort((left, right) => left.title.localeCompare(right.title, "zh-Hant"));
}

export async function getPublicWikiBrowseData(wikiRoot = "wiki"): Promise<PublicWikiBrowseData> {
  const pages = await loadPublicWikiPages(wikiRoot);
  return {
    pages,
    tags: uniqueSorted(pages.flatMap((page) => page.tags ?? [])),
    topics: uniqueSorted(pages.flatMap((page) => page.topics ?? [])),
    countsByCategory: PUBLIC_WIKI_CATEGORIES.reduce(
      (counts, category) => ({
        ...counts,
        [category]: pages.filter((page) => page.category === category).length
      }),
      {} as Record<PublicWikiCategory, number>
    )
  };
}

export async function findPublicWikiPageBySlug(
  slug: string[],
  wikiRoot = "wiki"
): Promise<PublicWikiPage | null> {
  const pages = await loadPublicWikiPages(wikiRoot);
  if (slug.length === 0) {
    return null;
  }

  if (slug.length === 1) {
    return pages.find((page) => page.id === slug[0]) ?? null;
  }

  const [category, pageId] = slug;
  if (!CATEGORY_SET.has(category)) {
    return pages.find((page) => page.id === pageId) ?? null;
  }

  return pages.find((page) => page.category === category && page.id === pageId) ?? null;
}
