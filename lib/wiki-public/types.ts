export const PUBLIC_WIKI_CATEGORIES = [
  "cards",
  "concepts",
  "emotions",
  "relationships",
  "patterns"
] as const;

export type PublicWikiCategory = (typeof PUBLIC_WIKI_CATEGORIES)[number];

export type PublicWikiPage = {
  id: string;
  title: string;
  category: PublicWikiCategory;
  summary?: string;
  tags?: string[];
  topics?: string[];
  relatedPageIds?: string[];
  contentHtml: string;
  contentText: string;
  href: string;
  slug: string[];
};

export type PublicWikiBrowseData = {
  pages: PublicWikiPage[];
  tags: string[];
  topics: string[];
  countsByCategory: Record<PublicWikiCategory, number>;
};
