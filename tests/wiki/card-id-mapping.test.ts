import assert from "node:assert/strict";
import test from "node:test";

import { cardIdToImageFilename, linkFilenameToCardId } from "../../lib/wiki/card-id-mapping.ts";

test("cardIdToImageFilename maps major and minor arcana cards", () => {
  assert.equal(cardIdToImageFilename("major-00-fool"), "Fool.jpg");
  assert.equal(cardIdToImageFilename("cups-02"), "Cups02.jpg");
  assert.equal(cardIdToImageFilename("wands-knight"), "Wands12.jpg");
  assert.equal(cardIdToImageFilename("pentacles-queen"), "Pents13.jpg");
});

test("card image mapping round-trips with linkFilenameToCardId", () => {
  const filenames = ["Fool.jpg", "Cups02.jpg", "Wands12.jpg", "Pents13.jpg"];

  for (const filename of filenames) {
    const cardId = linkFilenameToCardId(filename);
    assert.ok(cardId);
    assert.equal(cardIdToImageFilename(cardId), filename);
  }
});
