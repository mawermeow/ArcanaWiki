import assert from "node:assert/strict";
import test from "node:test";

import { renderPublicMarkdown } from "../../lib/wiki-public/markdown.ts";

test("public wiki markdown renders card lists with equal-width grid class", () => {
  const resolver = {
    resolveById: (pageId: string) => {
      if (pageId !== "cups-02" && pageId !== "cups-04") {
        return null;
      }

      return {
        id: pageId,
        href: `/wiki/cards/${pageId}`,
        title: pageId === "cups-02" ? "聖杯二（Two of Cups）" : "聖杯四（Four of Cups）",
        category: "cards" as const
      };
    }
  };

  const html = renderPublicMarkdown(
    [
      "- [聖杯二](../cards/cups-02.md) — 連結",
      "- [聖杯四](../cards/cups-04.md) — 距離"
    ].join("\n"),
    resolver
  );

  assert.match(html, /<ul class="wiki-card-list">/);
  assert.match(html, /wiki-card-link/);
});

test("public wiki markdown keeps regular lists without card grid class", () => {
  const html = renderPublicMarkdown(
    ["- 一般項目一", "- 一般項目二"].join("\n"),
    {
      resolveById: () => null
    }
  );

  assert.doesNotMatch(html, /wiki-card-list/);
  assert.match(html, /<ul><li>/);
});

test("public wiki markdown renders card links with thumbnail images", () => {
  const html = renderPublicMarkdown("請回看 [聖杯二](../cards/cups-02.md)。", {
    resolveById: (pageId) => {
      if (pageId !== "cups-02") {
        return null;
      }

      return {
        id: "cups-02",
        href: "/wiki/cards/cups-02",
        title: "聖杯二（Two of Cups）",
        category: "cards"
      };
    }
  });

  assert.match(html, /class="wiki-card-link"/);
  assert.match(html, /src="\/cards\/Cups02\.jpg"/);
  assert.match(html, /聖杯二/);
});

test("public wiki markdown keeps plain links for non-card pages", () => {
  const html = renderPublicMarkdown("請回看 [測試概念](../concepts/test-concept.md)。", {
    resolveById: (pageId) => {
      if (pageId !== "test-concept") {
        return null;
      }

      return {
        id: "test-concept",
        href: "/wiki/concepts/test-concept",
        title: "測試概念",
        category: "concepts"
      };
    }
  });

  assert.doesNotMatch(html, /wiki-card-link/);
  assert.match(html, /href="\/wiki\/concepts\/test-concept"/);
});
