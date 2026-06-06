import type { TarotCardOption } from "./card-catalog.ts";

const MAJOR_CARD_ID = /^major-(\d{2})-/;
const MINOR_NUMBERED_CARD_ID = /^(wands|cups|swords|pentacles)-(\d{2})$/;
const MINOR_COURT_CARD_ID = /^(wands|cups|swords|pentacles)-(page|knight|queen|king)$/;

export function isSelectableTarotCardDocument(document: {
  pageType: string;
  path: string;
}): boolean {
  return document.pageType === "card" && document.path.startsWith("wiki/cards/");
}

export function isSelectableTarotCardPageId(cardId: string, path?: string): boolean {
  if (path) {
    return isSelectableTarotCardDocument({ pageType: "card", path });
  }

  return (
    MAJOR_CARD_ID.test(cardId) ||
    MINOR_NUMBERED_CARD_ID.test(cardId) ||
    MINOR_COURT_CARD_ID.test(cardId)
  );
}

const SUIT_ORDER: Record<string, number> = {
  wands: 0,
  cups: 1,
  swords: 2,
  pentacles: 3
};

const COURT_RANK_ORDER: Record<string, number> = {
  page: 11,
  knight: 12,
  queen: 13,
  king: 14
};

export function formatTarotCardDisplayLabel(cardId: string, title: string): string {
  const majorMatch = cardId.match(MAJOR_CARD_ID);
  if (majorMatch) {
    return `${majorMatch[1]}.${title}`;
  }

  const numberedMatch = cardId.match(MINOR_NUMBERED_CARD_ID);
  if (numberedMatch) {
    return `${numberedMatch[2]}.${title}`;
  }

  return title;
}

function getTarotCardSortKey(cardId: string): [number, number, number] {
  const majorMatch = cardId.match(MAJOR_CARD_ID);
  if (majorMatch) {
    return [0, Number.parseInt(majorMatch[1], 10), 0];
  }

  const numberedMatch = cardId.match(MINOR_NUMBERED_CARD_ID);
  if (numberedMatch) {
    return [1, SUIT_ORDER[numberedMatch[1]] ?? 99, Number.parseInt(numberedMatch[2], 10)];
  }

  const courtMatch = cardId.match(MINOR_COURT_CARD_ID);
  if (courtMatch) {
    return [1, SUIT_ORDER[courtMatch[1]] ?? 99, COURT_RANK_ORDER[courtMatch[2]] ?? 99];
  }

  return [2, 99, 99];
}

export function compareTarotCardOptions(left: TarotCardOption, right: TarotCardOption): number {
  const leftKey = getTarotCardSortKey(left.cardId);
  const rightKey = getTarotCardSortKey(right.cardId);

  for (let index = 0; index < leftKey.length; index += 1) {
    if (leftKey[index] !== rightKey[index]) {
      return leftKey[index] - rightKey[index];
    }
  }

  return left.cardId.localeCompare(right.cardId);
}

export function sortTarotCardOptions(options: TarotCardOption[]): TarotCardOption[] {
  return [...options].sort(compareTarotCardOptions);
}

export function enrichTarotCardOption(option: Pick<TarotCardOption, "cardId" | "title">): TarotCardOption {
  return {
    ...option,
    displayLabel: formatTarotCardDisplayLabel(option.cardId, option.title)
  };
}
