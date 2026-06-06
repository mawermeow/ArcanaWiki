import assert from "node:assert/strict";
import test from "node:test";

import {
  findPublicWikiPageBySlug,
  getPublicWikiBrowseData,
  loadPublicWikiPages
} from "../../lib/wiki-public/loader.ts";
import { filterPublicWikiPages } from "../../lib/wiki-public/search.ts";

const FIXTURE_WIKI_ROOT = "tests/fixtures/wiki-public/wiki";

test("public wiki loader reads allowed categories and frontmatter", async () => {
  const pages = await loadPublicWikiPages(FIXTURE_WIKI_ROOT);

  assert.equal(pages.length, 2);
  assert.deepEqual(
    pages.map((page) => page.category),
    ["cards", "concepts"]
  );
  assert.equal(pages[0]?.id, "test-card");
  assert.equal(pages[0]?.summary, "這是一張用來驗證 public wiki 的測試牌。");
});

test("public wiki loader filters internal fields and internal block content", async () => {
  const [page] = await loadPublicWikiPages(FIXTURE_WIKI_ROOT);
  assert.ok(page);
  assert.ok(!page.contentHtml.includes("hidden-source"));
  assert.ok(!page.contentHtml.includes("hidden/raw.md"));
  assert.ok(!page.contentHtml.includes("內部註記"));
  assert.ok(!page.contentHtml.includes("Citation"));
});

test("public wiki markdown rendering supports headings, blockquotes, tables, and wiki links", async () => {
  const [page] = await loadPublicWikiPages(FIXTURE_WIKI_ROOT);
  assert.ok(page);
  assert.match(page.contentHtml, /<h1>測試牌卡<\/h1>/);
  assert.match(page.contentHtml, /<blockquote><p>/);
  assert.match(page.contentHtml, /<table>/);
  assert.match(page.contentHtml, /href="\/wiki\/concepts\/test-concept"/);
});

test("public wiki browse data returns category listings, tags, and topics", async () => {
  const browseData = await getPublicWikiBrowseData(FIXTURE_WIKI_ROOT);
  assert.equal(browseData.countsByCategory.cards, 1);
  assert.equal(browseData.countsByCategory.concepts, 1);
  assert.ok(browseData.tags.includes("測試"));
  assert.ok(browseData.topics.includes("感情"));
});

test("missing page fallback resolver returns null", async () => {
  const page = await findPublicWikiPageBySlug(["cards", "missing-page"], FIXTURE_WIKI_ROOT);
  assert.equal(page, null);
});

test("search filtering matches visible content, tags, and topic", async () => {
  const pages = await loadPublicWikiPages(FIXTURE_WIKI_ROOT);

  const byQuery = filterPublicWikiPages(pages, { query: "公開 摘要" });
  assert.equal(byQuery.length, 1);
  assert.equal(byQuery[0]?.id, "test-card");

  const byTag = filterPublicWikiPages(pages, { tag: "牌卡" });
  assert.equal(byTag.length, 1);
  assert.equal(byTag[0]?.id, "test-card");

  const byTopic = filterPublicWikiPages(pages, { topic: "自我探索" });
  assert.equal(byTopic.length, 1);
  assert.equal(byTopic[0]?.id, "test-concept");
});
