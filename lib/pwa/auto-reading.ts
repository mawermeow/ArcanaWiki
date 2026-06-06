import { randomInt } from "node:crypto";

import { readBm25Index } from "../retrieval/persistence.ts";
import { isSelectableTarotCardDocument } from "./card-display.ts";
import type { TarotCardInput } from "../answer/types.ts";
import { selectSpreadForQuestion } from "./spread-selection.ts";

const DEFAULT_INDEX_PATH = "embeddings/bm25-index.json";

type AutoReadingContext = {
  question: string;
};

export type GeneratedReadingCard = TarotCardInput & {
  title: string;
};

export type GeneratedReading = {
  spreadId: string;
  spreadTitle: string;
  spreadSelectionReason: string;
  cards: GeneratedReadingCard[];
};

export async function generateAutoReading(options: {
  question: string;
  indexPath?: string;
  selectSpread?: typeof selectSpreadForQuestion;
}): Promise<GeneratedReading> {
  const index = await readBm25Index(options.indexPath ?? DEFAULT_INDEX_PATH);
  const selectSpread = options.selectSpread ?? selectSpreadForQuestion;
  const selection = await selectSpread(options.question, {
    index,
    indexPath: options.indexPath
  });
  const plan = selection.plan;
  const cardDocuments = index.documents.filter((document) => isSelectableTarotCardDocument(document));
  const spreadDocument = index.documents.find(
    (document) => document.pageType === "spread" && document.pageId === plan.spreadId
  );

  const seen = new Set<string>();
  const cards: GeneratedReadingCard[] = [];

  for (const position of plan.positions) {
    let document = cardDocuments[randomInt(cardDocuments.length)];

    while (seen.has(document.pageId) && seen.size < cardDocuments.length) {
      document = cardDocuments[randomInt(cardDocuments.length)];
    }

    seen.add(document.pageId);
    cards.push({
      cardId: document.pageId,
      title: document.title,
      orientation: randomInt(2) === 0 ? "upright" : "reversed",
      position
    });
  }

  return {
    spreadId: plan.spreadId,
    spreadTitle: spreadDocument?.title ?? plan.fallbackTitle,
    spreadSelectionReason: selection.reason,
    cards
  };
}
