const MAJOR_LINK_TO_ID: Record<string, string> = {
  "Fool.jpg": "major-00-fool",
  "Magician.jpg": "major-01-magician",
  "High_Priestess.jpg": "major-02-high-priestess",
  "Empress.jpg": "major-03-empress",
  "Emperor.jpg": "major-04-emperor",
  "Hierophant.jpg": "major-05-hierophant",
  "Lovers.jpg": "major-06-lovers",
  "Chariot.jpg": "major-07-chariot",
  "Strength.jpg": "major-08-strength",
  "Hermit.jpg": "major-09-hermit",
  "Wheel_of_Fortune.jpg": "major-10-wheel-of-fortune",
  "Justice.jpg": "major-11-justice",
  "Hanged_Man.jpg": "major-12-hanged-man",
  "Death.jpg": "major-13-death",
  "Temperance.jpg": "major-14-temperance",
  "Devil.jpg": "major-15-devil",
  "Tower.jpg": "major-16-tower",
  "Star.jpg": "major-17-star",
  "Moon.jpg": "major-18-moon",
  "Sun.jpg": "major-19-sun",
  "Judgement.jpg": "major-20-judgement",
  "World.jpg": "major-21-world"
};

const SUIT_PREFIX: Record<string, string> = {
  Wands: "wands",
  Cups: "cups",
  Swords: "swords",
  Pents: "pentacles"
};

const COURT_RANK: Record<string, string> = {
  "11": "page",
  "12": "knight",
  "13": "queen",
  "14": "king"
};

const ID_TO_SUIT_PREFIX = Object.fromEntries(
  Object.entries(SUIT_PREFIX).map(([filenamePrefix, cardIdPrefix]) => [cardIdPrefix, filenamePrefix])
) as Record<string, string>;

const COURT_RANK_TO_FILENAME: Record<string, string> = {
  page: "11",
  knight: "12",
  queen: "13",
  king: "14"
};

const ID_TO_MAJOR_FILENAME = Object.fromEntries(
  Object.entries(MAJOR_LINK_TO_ID).map(([filename, cardId]) => [cardId, filename])
) as Record<string, string>;

export function cardIdToImageFilename(cardId: string): string | undefined {
  const normalized = cardId.trim();
  if (!normalized) {
    return undefined;
  }

  const majorFilename = ID_TO_MAJOR_FILENAME[normalized];
  if (majorFilename) {
    return majorFilename;
  }

  const match = normalized.match(/^(wands|cups|swords|pentacles)-(page|knight|queen|king|\d{2})$/);
  if (!match) {
    return undefined;
  }

  const suitPrefix = ID_TO_SUIT_PREFIX[match[1]];
  const rank = COURT_RANK_TO_FILENAME[match[2]] ?? match[2];
  return `${suitPrefix}${rank}.jpg`;
}

export function linkFilenameToCardId(link: string): string | undefined {
  const filename = link.trim();
  if (MAJOR_LINK_TO_ID[filename]) {
    return MAJOR_LINK_TO_ID[filename];
  }

  const match = filename.match(/^(Wands|Cups|Swords|Pents)(\d{2})\.jpg$/);
  if (!match) {
    return undefined;
  }

  const suit = SUIT_PREFIX[match[1]];
  const rank = match[2];
  const court = COURT_RANK[rank];
  if (court) {
    return `${suit}-${court}`;
  }

  return `${suit}-${rank}`;
}
