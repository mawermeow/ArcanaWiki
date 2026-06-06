import assert from "node:assert/strict";
import test from "node:test";

import {
  compareTarotCardOptions,
  enrichTarotCardOption,
  formatTarotCardDisplayLabel,
  isSelectableTarotCardDocument,
  sortTarotCardOptions
} from "../../lib/pwa/card-display.ts";

test("formatTarotCardDisplayLabel prefixes major and minor numbered cards", () => {
  assert.equal(
    formatTarotCardDisplayLabel("major-08-strength", "力量（Strength）"),
    "08.力量（Strength）"
  );
  assert.equal(
    formatTarotCardDisplayLabel("cups-02", "聖杯二（Two of Cups）"),
    "02.聖杯二（Two of Cups）"
  );
  assert.equal(
    formatTarotCardDisplayLabel("wands-page", "權杖侍衛（Page of Wands）"),
    "權杖侍衛（Page of Wands）"
  );
});

test("sortTarotCardOptions orders major arcana before minor arcana", () => {
  const sorted = sortTarotCardOptions([
    enrichTarotCardOption({ cardId: "cups-02", title: "聖杯二（Two of Cups）" }),
    enrichTarotCardOption({ cardId: "major-21-world", title: "世界（The World）" }),
    enrichTarotCardOption({ cardId: "major-00-fool", title: "愚人（The Fool）" }),
    enrichTarotCardOption({ cardId: "wands-01", title: "權杖一（Ace of Wands）" })
  ]);

  assert.deepEqual(
    sorted.map((option) => option.cardId),
    ["major-00-fool", "major-21-world", "wands-01", "cups-02"]
  );
});

test("compareTarotCardOptions sorts minor suits and ranks", () => {
  const left = enrichTarotCardOption({ cardId: "cups-02", title: "聖杯二（Two of Cups）" });
  const right = enrichTarotCardOption({ cardId: "cups-10", title: "聖杯十（Ten of Cups）" });
  const court = enrichTarotCardOption({ cardId: "cups-page", title: "聖杯侍衛（Page of Cups）" });

  assert.ok(compareTarotCardOptions(left, right) < 0);
  assert.ok(compareTarotCardOptions(right, court) < 0);
});

test("isSelectableTarotCardDocument excludes wiki meta pages", () => {
  assert.equal(
    isSelectableTarotCardDocument({ pageType: "card", path: "wiki/cards/cups-02.md" }),
    true
  );
  assert.equal(isSelectableTarotCardDocument({ pageType: "card", path: "wiki/index.md" }), false);
  assert.equal(isSelectableTarotCardDocument({ pageType: "card", path: "wiki/log.md" }), false);
});
