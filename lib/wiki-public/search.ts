import type { PublicWikiCategory, PublicWikiPage } from "./types.ts";

export type PublicWikiSearchParams = {
  category?: PublicWikiCategory | "all";
  query?: string;
  tag?: string;
  topic?: string;
};

function includesNormalized(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase("zh-Hant").includes(needle.toLocaleLowerCase("zh-Hant"));
}

export function filterPublicWikiPages(
  pages: PublicWikiPage[],
  { category = "all", query = "", tag = "", topic = "" }: PublicWikiSearchParams
): PublicWikiPage[] {
  const terms = query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);

  return pages.filter((page) => {
    if (category !== "all" && page.category !== category) {
      return false;
    }

    if (tag && !page.tags?.includes(tag)) {
      return false;
    }

    if (topic && !page.topics?.includes(topic)) {
      return false;
    }

    if (terms.length === 0) {
      return true;
    }

    const searchable = [
      page.title,
      page.summary ?? "",
      ...(page.tags ?? []),
      ...(page.topics ?? []),
      page.contentText
    ].join("\n");

    return terms.every((term) => includesNormalized(searchable, term));
  });
}
