import React from "react";
import { findPublicWikiPageBySlug, loadPublicWikiPages } from "../../../lib/wiki-public/loader.ts";
import type { PublicWikiPage } from "../../../lib/wiki-public/types.ts";

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
    <section className="panel wiki-detail-section">
      <div className="wiki-section-header">
        <div>
          <p className="eyebrow">Related</p>
          <h2>相關頁面</h2>
        </div>
      </div>
      <div className="wiki-related-list">
        {relatedPages.map((page) => (
          <a className="wiki-related-link" href={page.href} key={page.id}>
            <strong>{page.title}</strong>
            <span>{page.summary ?? page.id}</span>
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
      <main className="page">
        <div className="shell">
          <section className="panel wiki-missing-panel">
            <p className="eyebrow">Public Tarot Wiki</p>
            <h1>找不到這個頁面</h1>
            <p className="lede">這個連結可能已變更，或目前沒有對外公開。</p>
            <a className="secondary-button wiki-inline-button" href="/wiki">
              回到列表
            </a>
          </section>
        </div>
      </main>
    );
  }

  const allPages = await loadPublicWikiPages();
  const pagesById = new Map(allPages.map((item) => [item.id, item]));

  return (
    <main className="page">
      <div className="shell">
        <section className="hero wiki-detail-hero">
          <div className="wiki-detail-actions">
            <a className="ghost-link" href="/wiki">
              回到列表
            </a>
            {page.category === "cards" ? (
              <a className="secondary-button wiki-inline-button" href={`/?cardId=${encodeURIComponent(page.id)}`}>
                用這張牌詢問
              </a>
            ) : null}
          </div>
          <p className="eyebrow">Public Tarot Wiki</p>
          <h1>{page.title}</h1>
          {page.summary ? <p className="lede">{page.summary}</p> : null}

          <div className="wiki-pill-row">
            {(page.tags ?? []).map((tag) => (
              <span className="wiki-pill" key={tag}>
                {tag}
              </span>
            ))}
          </div>

          <div className="wiki-pill-row wiki-pill-row-topics">
            {(page.topics ?? []).map((topic) => (
              <span className="wiki-pill wiki-pill-topic" key={topic}>
                {topic}
              </span>
            ))}
          </div>
        </section>

        <section className="panel wiki-detail-content">
          <article
            className="wiki-prose"
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
