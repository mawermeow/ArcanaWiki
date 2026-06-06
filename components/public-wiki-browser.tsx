"use client";

import React, { useMemo, useState } from "react";
import { TarotCardThumb } from "./tarot-card-thumb.tsx";
import { filterPublicWikiPages } from "../lib/wiki-public/search.ts";
import {
  PUBLIC_WIKI_CATEGORIES,
  PUBLIC_WIKI_CATEGORY_LABELS,
  type PublicWikiBrowseData,
  type PublicWikiCategory,
  type PublicWikiPage
} from "../lib/wiki-public/types.ts";
import {
  cn,
  contentSectionTitleClass,
  eyebrowClass,
  fieldClass,
  fieldLabelClass,
  heroClass,
  mutedTextClass,
  panelPaddingClass,
  sectionEyebrowClass
} from "../lib/ui/classes.ts";

const wikiChipClass =
  "rounded-full border border-line bg-surface-soft px-3.5 py-2 text-ink";

function renderEmptyCopy(category: PublicWikiCategory) {
  switch (category) {
    case "cards":
      return "目前沒有可顯示的牌卡頁面。";
    case "concepts":
      return "概念頁仍在整理中。";
    case "emotions":
      return "情緒頁仍在整理中。";
    case "relationships":
      return "關係頁仍在整理中。";
    case "patterns":
      return "目前沒有可顯示的模式或牌陣頁面。";
  }
}

function PageList({
  pages,
  category
}: {
  pages: PublicWikiPage[];
  category: PublicWikiCategory;
}) {
  return (
    <section className={cn(panelPaddingClass, "grid gap-[18px]")}>
      <div className="flex items-start justify-between gap-3.5 max-[920px]:flex-col max-[920px]:items-start">
        <div>
          <p className={sectionEyebrowClass}>Category</p>
          <h2 className={contentSectionTitleClass}>{PUBLIC_WIKI_CATEGORY_LABELS[category]}</h2>
        </div>
        <p>{pages.length} 篇</p>
      </div>

      {pages.length === 0 ? (
        <p className="m-0 text-muted">{renderEmptyCopy(category)}</p>
      ) : (
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))] max-[640px]:grid-cols-1">
          {pages.map((page) => (
            <article
              className="grid gap-2.5 rounded-md border border-line bg-surface-muted p-[18px]"
              key={page.id}
            >
              <div className="flex items-start gap-3.5">
                {page.category === "cards" ? (
                  <TarotCardThumb cardId={page.id} className="shrink-0" size="sm" title={page.title} />
                ) : null}
                <div className="grid min-w-0 flex-1 gap-2.5">
                  <p className="m-0 text-[0.8rem] font-bold tracking-[0.08em] text-accent uppercase">
                    {PUBLIC_WIKI_CATEGORY_LABELS[page.category]}
                  </p>
                  <h3 className="text-[1.08rem]">
                    <a className="no-underline" href={page.href}>
                      {page.title}
                    </a>
                  </h3>
                  {page.summary ? (
                    <p className="m-0 text-muted">{page.summary}</p>
                  ) : (
                    <p className="m-0 text-muted">{page.contentText.slice(0, 120)}...</p>
                  )}
                  <div className="flex flex-wrap gap-2.5">
                    {(page.tags ?? []).slice(0, 3).map((tag) => (
                      <span className={cn(wikiChipClass, "text-[0.92rem]")} key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function PublicWikiBrowser({
  pages,
  tags,
  topics,
  countsByCategory
}: PublicWikiBrowseData) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<PublicWikiCategory | "all">("all");
  const [tag, setTag] = useState("");
  const [topic, setTopic] = useState("");

  const filteredPages = useMemo(
    () =>
      filterPublicWikiPages(pages, {
        category,
        query,
        tag,
        topic
      }),
    [category, pages, query, tag, topic]
  );

  const groupedPages = useMemo(
    () =>
      PUBLIC_WIKI_CATEGORIES.map((currentCategory) => ({
        category: currentCategory,
        pages: filteredPages.filter((page) => page.category === currentCategory)
      })),
    [filteredPages]
  );

  return (
    <div className="grid gap-5">
      <section className={cn(heroClass, "grid gap-[18px]")}>
        <p className={eyebrowClass}>Public Tarot Wiki</p>
        <h1>從牌義、概念與牌陣之間，慢慢讀出脈絡。</h1>
        <p className={mutedTextClass}>
          這裡只呈現可公開閱讀的 wiki 內容，不顯示 retrieval diagnostics、raw prompt、embedding 或內部備註。
        </p>
        <div className="flex flex-wrap gap-2.5" aria-label="分類列表">
          <button
            className={cn(
              wikiChipClass,
              "cursor-pointer",
              category === "all" && "border-accent/38 bg-accent-soft text-accent"
            )}
            type="button"
            onClick={() => setCategory("all")}
          >
            全部
          </button>
          {PUBLIC_WIKI_CATEGORIES.map((item) => (
            <button
              className={cn(
                wikiChipClass,
                "cursor-pointer",
                category === item && "border-accent/38 bg-accent-soft text-accent"
              )}
              key={item}
              type="button"
              onClick={() => setCategory(item)}
            >
              {PUBLIC_WIKI_CATEGORY_LABELS[item]} {countsByCategory[item]}
            </button>
          ))}
        </div>
      </section>

      <section className={cn(panelPaddingClass, "grid gap-[18px]")}>
        <div className="grid grid-cols-[minmax(0,2fr)_repeat(2,minmax(180px,1fr))] gap-3.5 max-[920px]:grid-cols-1">
          <label className={fieldClass}>
            <span className={fieldLabelClass}>搜尋</span>
            <input
              aria-label="搜尋 wiki"
              placeholder="搜尋標題、摘要、tags、topics 或內文"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <label className={fieldClass}>
            <span className={fieldLabelClass}>Tag</span>
            <select aria-label="tags filter" value={tag} onChange={(event) => setTag(event.target.value)}>
              <option value="">全部 tags</option>
              {tags.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className={fieldClass}>
            <span className={fieldLabelClass}>Topic</span>
            <select aria-label="topics filter" value={topic} onChange={(event) => setTopic(event.target.value)}>
              <option value="">全部 topics</option>
              {topics.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className={mutedTextClass}>目前篩選後共有 {filteredPages.length} 篇公開頁面。</p>
      </section>

      {groupedPages.map((group) => (
        <PageList category={group.category} key={group.category} pages={group.pages} />
      ))}
    </div>
  );
}
