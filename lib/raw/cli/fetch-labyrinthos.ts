import fs from "node:fs/promises";
import path from "node:path";

import {
  buildRawMarkdown,
  extractLabyrinthosArticle,
  labyrinthosUrlToSlug
} from "../labyrinthos-html.ts";

type TarotLabCard = {
  name: string;
  detail: string;
  link: string;
};

type ManifestEntry = {
  name: string;
  link: string;
  slug: string;
  sourceUrl: string;
  rawFile: string;
  status: "ok" | "error";
  error?: string;
  fetchedAt: string;
};

type Manifest = {
  collectedDate: string;
  source: string;
  entries: ManifestEntry[];
};

const USER_AGENT = "ArcanaWiki-raw-ingest/1.0 (personal research)";
const CARDS_JSON = "raw/tarot-lab/TarotDB/cards.json";
const OUTPUT_DIR = "raw/tarot";
const MANIFEST_FILE = "raw/tarot/labyrinthos-manifest.json";

function parseArgs(argv: string[]): { limit?: number; delayMs: number; force: boolean } {
  let limit: number | undefined;
  let delayMs = 1500;
  let force = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--force") {
      force = true;
      continue;
    }
    if (arg === "--limit") {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("--limit requires a positive number.");
      }
      limit = value;
      index += 1;
      continue;
    }
    if (arg === "--delay") {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("--delay requires a non-negative number of milliseconds.");
      }
      delayMs = value;
      index += 1;
    }
  }

  return { limit, delayMs, force };
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function dedupeCards(cards: TarotLabCard[]): TarotLabCard[] {
  const seen = new Set<string>();
  const result: TarotLabCard[] = [];

  for (const card of cards) {
    const detail = card.detail?.trim();
    if (!detail || seen.has(detail)) {
      continue;
    }
    seen.add(detail);
    result.push(card);
  }

  return result;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.text();
}

async function main(): Promise<void> {
  const { limit, delayMs, force } = parseArgs(process.argv.slice(2));
  const collectedDate = todayIsoDate();
  const cardsJson = await fs.readFile(CARDS_JSON, "utf8");
  const cards = dedupeCards(JSON.parse(cardsJson) as TarotLabCard[]);
  const selected = typeof limit === "number" ? cards.slice(0, limit) : cards;

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const manifest: Manifest = {
    collectedDate,
    source: CARDS_JSON,
    entries: []
  };

  for (const [index, card] of selected.entries()) {
    const slug = labyrinthosUrlToSlug(card.detail);
    const rawFile = `${OUTPUT_DIR}/${collectedDate}-labyrinthos-${slug}.md`;
    const fetchedAt = new Date().toISOString();

    if (!force) {
      try {
        await fs.access(rawFile);
        manifest.entries.push({
          name: card.name,
          link: card.link,
          slug,
          sourceUrl: card.detail,
          rawFile,
          status: "ok",
          fetchedAt
        });
        console.log(`skip ${slug} (exists)`);
        continue;
      } catch {
        // fetch below
      }
    }

    try {
      if (index > 0 && delayMs > 0) {
        await sleep(delayMs);
      }

      const html = await fetchHtml(card.detail);
      const article = extractLabyrinthosArticle(html);
      const markdown = buildRawMarkdown({
        title: article.title,
        sourceUrl: card.detail,
        collectedDate,
        body: article.markdown,
        cardName: card.name
      });

      await fs.writeFile(rawFile, `${markdown}\n`, "utf8");
      manifest.entries.push({
        name: card.name,
        link: card.link,
        slug,
        sourceUrl: card.detail,
        rawFile,
        status: "ok",
        fetchedAt
      });
      console.log(`saved ${slug}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      manifest.entries.push({
        name: card.name,
        link: card.link,
        slug,
        sourceUrl: card.detail,
        rawFile,
        status: "error",
        error: message,
        fetchedAt
      });
      console.error(`error ${slug}: ${message}`);
    }
  }

  await fs.writeFile(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const okCount = manifest.entries.filter((entry) => entry.status === "ok").length;
  const errorCount = manifest.entries.filter((entry) => entry.status === "error").length;
  console.log(
    JSON.stringify(
      {
        total: manifest.entries.length,
        ok: okCount,
        error: errorCount,
        manifest: MANIFEST_FILE
      },
      null,
      2
    )
  );

  if (errorCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
