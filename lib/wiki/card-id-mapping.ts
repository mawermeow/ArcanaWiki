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
