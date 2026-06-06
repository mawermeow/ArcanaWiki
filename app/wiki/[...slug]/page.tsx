import React from "react";
import { TarotCardThumb } from "../../../components/tarot-card-thumb.tsx";
import { SiteBrand } from "../../../components/site-brand.tsx";
import { findPublicWikiPageBySlug, loadPublicWikiPages } from "../../../lib/wiki-public/loader.ts";
import type { PublicWikiPage } from "../../../lib/wiki-public/types.ts";
import {
  cn,
  contentSectionTitleClass,
  ghostLinkClass,
  heroClass,
  mutedTextClass,
  pageClass,
  panelPaddingClass,
  secondaryButtonClass,
  sectionEyebrowClass,
  wikiPageTitleClass,
  wikiProseClass
} from "../../../lib/ui/classes.ts";
import { PUBLIC_WIKI_CATEGORY_LABELS } from "../../../lib/wiki-public/types.ts";

function RelatedPages({
  relatedPageIds,
  pagesById
}: {
  relatedPageIds: string[];
  pagesById: Map<string, PublicWikiPage>;
}) {
  const relatedPages = relatedPageIds
    .map((pageId) => pagesById.get(pageId))
    .filter((page): page is PublicWikiPage => Boolean(page));

  if (relatedPages.length === 0) {
    return null;
  }

  return (
    <section className={cn(panelPaddingClass, "grid gap-[18px]")}>
      <div className="flex items-start justify-between gap-3.5 max-[920px]:flex-col max-[920px]:items-start">
        <div>
          <p className={sectionEyebrowClass}>Related</p>
          <h2 className={contentSectionTitleClass}>相關頁面</h2>
        </div>
      </div>
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
        {relatedPages.map((page) => (
          <a
            className="flex h-full min-w-0 items-start gap-3.5 rounded-md border border-line bg-surface-muted p-[18px] no-underline max-[640px]:flex-col max-[640px]:items-start"
            href={page.href}
            key={page.id}
          >
            {page.category === "cards" ? (
              <TarotCardThumb cardId={page.id} className="shrink-0" size="sm" title={page.title} />
            ) : null}
            <div className="grid min-w-0 flex-1 gap-2.5">
              <strong className="no-underline">{page.title}</strong>
              <span className="text-muted">{page.summary ?? page.id}</span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

export default async function PublicWikiDetailPage({
  params
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug = [] } = await params;
  const page = await findPublicWikiPageBySlug(slug);

  if (!page) {
    return (
      <main className={pageClass}>
        <div className="grid gap-5">
          <section className={cn(panelPaddingClass, "grid gap-[18px]")}>
            <SiteBrand />
            <h1>找不到這個頁面</h1>
            <p className={mutedTextClass}>這個連結可能已變更，或目前沒有對外公開。</p>
            <a className={cn(secondaryButtonClass, "no-underline")} href="/wiki">
              回到列表
            </a>
          </section>
        </div>
      </main>
    );
  }

  const allPages = await loadPublicWikiPages();
  const pagesById = new Map(allPages.map((item) => [item.id, item]));

  const wikiChipClass = "rounded-full border border-line bg-surface-soft px-3.5 py-2 text-[0.92rem] text-ink";

  return (
    <main className={pageClass}>
      <div className="grid gap-5">
        <section className={cn(heroClass, "grid gap-[18px]")}>
          <div className="flex items-start justify-between gap-3.5 max-[920px]:flex-col max-[920px]:items-start">
            <a className={ghostLinkClass} href="/wiki">
              回到列表
            </a>
            {page.category === "cards" ? (
              <a
                className={cn(secondaryButtonClass, "no-underline")}
                href={`/?cardId=${encodeURIComponent(page.id)}`}
              >
                用這張牌詢問
              </a>
            ) : null}
          </div>
          <SiteBrand />
          <div className="flex items-start gap-6 max-[640px]:flex-col">
            {page.category === "cards" ? (
              <TarotCardThumb cardId={page.id} className="shrink-0" size="lg" title={page.title} />
            ) : null}
            <div className="grid min-w-0 flex-1 gap-[18px]">
              <div className="grid gap-1 border-b border-line pb-4">
                <p className={sectionEyebrowClass}>{PUBLIC_WIKI_CATEGORY_LABELS[page.category]}</p>
                <h1 className={wikiPageTitleClass}>{page.title}</h1>
              </div>
              {page.summary ? <p className={mutedTextClass}>{page.summary}</p> : null}

              <div className="flex flex-wrap gap-2.5">
                {(page.tags ?? []).map((tag) => (
                  <span className={wikiChipClass} key={tag}>
                    {tag}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap gap-2.5">
                {(page.topics ?? []).map((topic) => (
                  <span className={cn(wikiChipClass, "bg-bg-accent/58")} key={topic}>
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={cn(panelPaddingClass, "grid gap-[18px]")}>
          <article
            className={wikiProseClass}
            dangerouslySetInnerHTML={{
              __html: page.contentHtml
            }}
          />
        </section>

        <RelatedPages pagesById={pagesById} relatedPageIds={page.relatedPageIds ?? []} />
      </div>
    </main>
  );
}
