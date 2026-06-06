import type { PublicWikiPage } from "./types.ts";
import { getCardImageSrc } from "../pwa/card-image.ts";

type LinkResolver = {
  resolveById: (
    pageId: string
  ) => Pick<PublicWikiPage, "href" | "title" | "category" | "id"> | null;
};

const HIDDEN_SECTION_TITLES = new Set([
  "Citation",
  "Citations",
  "Sources",
  "Source",
  "Internal Notes",
  "Prompt Hints",
  "Diagnostics",
  "Lint Comments"
]);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ").trim();
}

function slugToPageId(target: string): string | null {
  const clean = target.trim();
  if (!clean) {
    return null;
  }

  const withoutAnchor = clean.split("#")[0] ?? clean;
  const withoutQuery = withoutAnchor.split("?")[0] ?? withoutAnchor;
  const fileName = withoutQuery.split("/").pop() ?? withoutQuery;
  if (!fileName || fileName.startsWith("http://") || fileName.startsWith("https://")) {
    return null;
  }

  return fileName.endsWith(".md") ? fileName.slice(0, -3) : fileName;
}

function resolveHref(target: string, resolver: LinkResolver): { href: string } | null {
  if (target.startsWith("http://") || target.startsWith("https://")) {
    return { href: target };
  }

  const pageId = slugToPageId(target);
  if (!pageId) {
    return null;
  }

  const page = resolver.resolveById(pageId);
  if (!page) {
    return null;
  }

  return { href: page.href };
}

function isCardLinkTarget(target: string, resolver: LinkResolver): boolean {
  if (target.startsWith("http://") || target.startsWith("https://")) {
    return false;
  }

  const pageId = slugToPageId(target);
  if (!pageId) {
    return false;
  }

  const page = resolver.resolveById(pageId);
  return page?.category === "cards";
}

function isCardListItemContent(raw: string, resolver: LinkResolver): boolean {
  const trimmed = raw.trim();
  const markdownLink = trimmed.match(/^\[([^\]]+)\]\(([^)]+)\)/);
  if (markdownLink) {
    return isCardLinkTarget(markdownLink[2], resolver);
  }

  const wikiLink = trimmed.match(/^\[\[([^\]]+)\]\]/);
  if (wikiLink) {
    const page = resolver.resolveById(wikiLink[1].trim());
    return page?.category === "cards";
  }

  return false;
}

function renderWikiLink(
  page: Pick<PublicWikiPage, "href" | "title" | "category" | "id">,
  label: string,
  pageId: string
): string {
  const cardImageSrc = page.category === "cards" ? getCardImageSrc(pageId) : undefined;

  if (!cardImageSrc) {
    return `<a href="${escapeHtml(page.href)}">${escapeHtml(label)}</a>`;
  }

  return [
    `<a class="wiki-card-link" href="${escapeHtml(page.href)}">`,
    `<img alt="" aria-hidden="true" class="wiki-card-link__image" height="62" loading="lazy" src="${escapeHtml(cardImageSrc)}" width="36" />`,
    `<span class="wiki-card-link__label">${escapeHtml(label)}</span>`,
    `</a>`
  ].join("");
}

function renderInline(raw: string, resolver: LinkResolver): string {
  let html = escapeHtml(raw);

  html = html.replace(/\[\[([^\]]+)\]\]/g, (_match, pageId) => {
    const normalizedPageId = String(pageId).trim();
    const page = resolver.resolveById(normalizedPageId);
    if (!page) {
      return escapeHtml(normalizedPageId);
    }
    return renderWikiLink(page, page.title, normalizedPageId);
  });

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, target) => {
    const resolved = resolveHref(String(target), resolver);
    if (!resolved) {
      return escapeHtml(String(label));
    }

    if (resolved.href.startsWith("http")) {
      return `<a href="${escapeHtml(resolved.href)}" target="_blank" rel="noreferrer">${escapeHtml(String(label))}</a>`;
    }

    const pageId = slugToPageId(String(target));
    if (!pageId) {
      return `<a href="${escapeHtml(resolved.href)}">${escapeHtml(String(label))}</a>`;
    }

    const page = resolver.resolveById(pageId);
    if (!page) {
      return `<a href="${escapeHtml(resolved.href)}">${escapeHtml(String(label))}</a>`;
    }

    return renderWikiLink(page, String(label), pageId);
  });

  html = html.replace(/`([^`]+)`/g, (_match, code) => `<code>${escapeHtml(String(code))}</code>`);
  html = html.replace(/\*\*([^*]+)\*\*/g, (_match, bold) => `<strong>${escapeHtml(String(bold))}</strong>`);
  html = html.replace(/\*([^*]+)\*/g, (_match, italic) => `<em>${escapeHtml(String(italic))}</em>`);

  return html;
}

export function stripInternalMarkdown(raw: string): string {
  const withoutComments = raw
    .replace(/<!--\s*internal\s*-->[\s\S]*?<!--\s*\/internal\s*-->/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  const lines = withoutComments.split("\n");
  const kept: string[] = [];
  let hiddenHeadingDepth = 0;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const depth = headingMatch[1].length;
      const title = headingMatch[2].trim();
      if (hiddenHeadingDepth > 0 && depth <= hiddenHeadingDepth) {
        hiddenHeadingDepth = 0;
      }
      if (HIDDEN_SECTION_TITLES.has(title)) {
        hiddenHeadingDepth = depth;
        continue;
      }
    }

    if (hiddenHeadingDepth > 0) {
      continue;
    }

    if (/^>\s*(Sources|Raw):/i.test(line)) {
      continue;
    }

    if (/^\*\*(Card|Spread) ID:\*\*/i.test(line)) {
      continue;
    }

    if (
      /^\s*(source_refs|raw_refs|retrieval_weights|prompt_hints|diagnostics|embeddings|graph_score|lint_comments)\s*:/i.test(
        line
      )
    ) {
      continue;
    }

    kept.push(line);
  }

  return normalizeWhitespace(kept.join("\n"));
}

export function stripMarkdownToText(markdown: string): string {
  return normalizeWhitespace(
    markdown
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^>\s?/gm, "")
      .replace(/^\s*[-*]\s+/gm, "")
      .replace(/\|/g, " ")
  );
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line);
}

function splitTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function renderPublicMarkdown(raw: string, resolver: LinkResolver): string {
  const markdown = stripInternalMarkdown(raw);
  if (!markdown) {
    return "";
  }

  const lines = markdown.split("\n");
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trimEnd();

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const depth = Math.min(6, headingMatch[1].length);
      blocks.push(`<h${depth}>${renderInline(headingMatch[2].trim(), resolver)}</h${depth}>`);
      index += 1;
      continue;
    }

    if (line.startsWith(">")) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trimStart().startsWith(">")) {
        quoteLines.push(lines[index].trimStart().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote><p>${renderInline(quoteLines.join(" "), resolver)}</p></blockquote>`);
      continue;
    }

    if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      const rawItems: string[] = [];
      while (index < lines.length) {
        const itemLine = lines[index].trim();
        if (!itemLine.startsWith("- ") && !itemLine.startsWith("* ")) {
          break;
        }
        rawItems.push(itemLine.slice(2).trim());
        index += 1;
      }

      const isCardList =
        rawItems.length > 0 && rawItems.every((item) => isCardListItemContent(item, resolver));
      const items = rawItems.map((item) => `<li>${renderInline(item, resolver)}</li>`);
      const listClass = isCardList ? ' class="wiki-card-list"' : "";
      blocks.push(`<ul${listClass}>${items.join("")}</ul>`);
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1] ?? "")) {
      const headers = splitTableCells(line);
      index += 2;
      const rows: string[] = [];

      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        const cells = splitTableCells(lines[index]);
        rows.push(
          `<tr>${cells.map((cell) => `<td>${renderInline(cell, resolver)}</td>`).join("")}</tr>`
        );
        index += 1;
      }

      blocks.push(
        `<table><thead><tr>${headers
          .map((header) => `<th>${renderInline(header, resolver)}</th>`)
          .join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const candidate = lines[index].trimEnd();
      if (
        !candidate.trim() ||
        /^(#{1,6})\s+/.test(candidate) ||
        candidate.trimStart().startsWith(">") ||
        candidate.trimStart().startsWith("- ") ||
        candidate.trimStart().startsWith("* ")
      ) {
        break;
      }
      if (candidate.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1] ?? "")) {
        break;
      }
      paragraphLines.push(candidate.trim());
      index += 1;
    }
    blocks.push(`<p>${renderInline(paragraphLines.join(" "), resolver)}</p>`);
  }

  return blocks.join("");
}
