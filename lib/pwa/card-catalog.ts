import {
  compareTarotCardOptions,
  enrichTarotCardOption,
  isSelectableTarotCardDocument,
  sortTarotCardOptions
} from "./card-display.ts";
import { readBm25Index } from "../retrieval/persistence.ts";

export type TarotCardOption = {
  cardId: string;
  title: string;
  displayLabel: string;
};

const DEFAULT_INDEX_PATH = "embeddings/bm25-index.json";

export async function readTarotCardOptions(
  indexPath = DEFAULT_INDEX_PATH
): Promise<TarotCardOption[]> {
  const index = await readBm25Index(indexPath);
  const seen = new Set<string>();
  const options: TarotCardOption[] = [];

  for (const document of index.documents) {
    if (!isSelectableTarotCardDocument(document) || seen.has(document.pageId)) {
      continue;
    }

    seen.add(document.pageId);
    options.push(
      enrichTarotCardOption({
        cardId: document.pageId,
        title: document.title
      })
    );
  }

  return sortTarotCardOptions(options);
}

export { compareTarotCardOptions, sortTarotCardOptions };
