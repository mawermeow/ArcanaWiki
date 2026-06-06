import test from "node:test";
import assert from "node:assert/strict";

import { buildBm25Index } from "../../lib/retrieval/bm25-builder.ts";
import { searchBm25Index } from "../../lib/retrieval/bm25-searcher.ts";
import { loadWikiPages } from "../../lib/retrieval/wiki-loader.ts";

let cachedIndex: Awaited<ReturnType<typeof buildIndex>>;

async function buildIndex() {
  const pages = await loadWikiPages("wiki");
  return buildBm25Index(pages);
}

async function getIndex() {
  if (!cachedIndex) {
    cachedIndex = await buildIndex();
  }
  return cachedIndex;
}

test("中文 query finds emotional relationship material", async () => {
  const index = await getIndex();
  const response = searchBm25Index(index, "對方最近很冷淡", { topK: 5 });
  assert.ok(response.results.length > 0);
  assert.ok(
    response.results.some((result) =>
      ["cups-queen", "cups-king", "major-18-moon", "swords-02"].includes(result.pageId)
    )
  );
});

test("reversed query preserves tarot phrase matching", async () => {
  const index = await getIndex();
  const response = searchBm25Index(index, "聖杯二逆位", { topK: 5 });
  assert.ok(response.diagnostics.tokenizedQuery.includes("聖杯二逆位"));
  assert.equal(response.results[0]?.pageId, "cups-02");
});

test("english query supports mixed-language retrieval", async () => {
  const index = await getIndex();
  const response = searchBm25Index(index, "The Hermit love", { topK: 5 });
  assert.ok(response.results.length > 0);
  assert.equal(response.results[0]?.pageId, "major-09-hermit");
});

test("relationship query surfaces reunion-related pages", async () => {
  const index = await getIndex();
  const response = searchBm25Index(index, "復合", { topK: 5 });
  assert.ok(response.results.length > 0);
  assert.ok(
    response.results.some((result) =>
      ["spread-lover-reunion", "spread-love-tree", "spread-love-greater-cross"].includes(
        result.pageId
      )
    )
  );
});

test("emotional query surfaces escape and withdrawal material", async () => {
  const index = await getIndex();
  const response = searchBm25Index(index, "逃避", { topK: 5 });
  assert.ok(response.results.length > 0);
  assert.ok(
    response.results.some((result) =>
      ["major-09-hermit", "cups-08", "major-12-hanged-man", "swords-02", "swords-06"].includes(
        result.pageId
      )
    )
  );
});

test("mixed-language reversed query keeps orientation tokens", async () => {
  const index = await getIndex();
  const response = searchBm25Index(index, "Temperance reversed 工作", { topK: 5 });
  assert.ok(response.diagnostics.tokenizedQuery.includes("reversed"));
  assert.ok(response.results.some((result) => result.pageId === "major-14-temperance"));
});
