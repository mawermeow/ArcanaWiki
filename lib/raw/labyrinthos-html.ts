import { JSDOM } from "jsdom";

const PROMO_HEADING_PATTERN =
  /join \d+ million|download app|looking for more insight|now available at dk|tarot: your tool|advertisement/i;

const PROMO_TEXT_PATTERN =
  /join \d+ million|download app|order the book|sign up for free tarot classes/i;

export function labyrinthosUrlToSlug(url: string): string {
  const last = new URL(url).pathname.split("/").pop() ?? "unknown";
  return last
    .replace(/-meaning-major-arcana-tarot-card-meanings$/, "")
    .replace(/-meaning-tarot-card-meanings$/, "");
}

export function extractLabyrinthosArticle(html: string): { title: string; markdown: string } {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const title =
    document.querySelector(".article-title h1")?.textContent?.trim() ??
    document.querySelector("h1")?.textContent?.trim() ??
    "Untitled Labyrinthos Article";

  const rte = document.querySelector(".rte.content") ?? document.querySelector(".rte");
  if (!rte) {
    throw new Error("Could not find article body (.rte.content).");
  }

  const lines: string[] = [];
  let stop = false;

  for (const node of [...rte.children]) {
    if (stop) {
      break;
    }

    const tag = node.tagName.toUpperCase();
    const text = normalizeWhitespace(node.textContent ?? "");

    if (!text && tag !== "TABLE") {
      continue;
    }

    if (tag === "DIV" || tag === "FIGURE" || tag === "SCRIPT" || tag === "STYLE") {
      continue;
    }

    if (tag === "H2" && /cheat sheet/i.test(text)) {
      stop = true;
      continue;
    }

    if ((tag === "H2" || tag === "H3") && PROMO_HEADING_PATTERN.test(text)) {
      continue;
    }

    if (PROMO_TEXT_PATTERN.test(text)) {
      continue;
    }

    if (tag === "H2") {
      lines.push("", `## ${text}`, "");
      continue;
    }

    if (tag === "H3") {
      lines.push("", `### ${text}`, "");
      continue;
    }

    if (tag === "H4") {
      lines.push("", `#### ${text}`, "");
      continue;
    }

    if (tag === "P" || tag === "BLOCKQUOTE") {
      lines.push(text, "");
      continue;
    }

    if (tag === "TABLE") {
      const table = tableToMarkdown(node as HTMLTableElement);
      if (table) {
        lines.push(table, "");
      }
      continue;
    }

    if (tag === "UL" || tag === "OL") {
      const list = listToMarkdown(node as HTMLUListElement | HTMLOListElement);
      if (list) {
        lines.push(list, "");
      }
    }
  }

  const markdown = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!markdown) {
    throw new Error("Extracted article body is empty.");
  }

  return { title, markdown };
}

function tableToMarkdown(table: HTMLTableElement): string {
  const rows = [...table.querySelectorAll("tr")]
    .map((row) =>
      [...row.querySelectorAll("th, td")].map((cell) =>
        normalizeWhitespace(cell.textContent ?? "").replace(/\|/g, "\\|")
      )
    )
    .filter((row) => !row.some((cell) => /^skip to /i.test(cell)));

  if (rows.length === 0) {
    return "";
  }

  const header = rows[0];
  const body = rows.slice(1);
  const headerLine = `| ${header.join(" | ")} |`;
  const separator = `| ${header.map(() => "---").join(" | ")} |`;
  const bodyLines = body.map((row) => `| ${row.join(" | ")} |`);

  return [headerLine, separator, ...bodyLines].join("\n");
}

function listToMarkdown(list: HTMLUListElement | HTMLOListElement): string {
  const items = [...list.querySelectorAll(":scope > li")];
  return items
    .map((item, index) => {
      const prefix = list.tagName === "OL" ? `${index + 1}.` : "-";
      return `${prefix} ${normalizeWhitespace(item.textContent ?? "")}`;
    })
    .join("\n");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function buildRawMarkdown(input: {
  title: string;
  sourceUrl: string;
  collectedDate: string;
  body: string;
  cardName?: string;
}): string {
  const cardLine = input.cardName ? `> Card: ${input.cardName}\n` : "";
  return `# ${input.title}

> Source: ${input.sourceUrl}
> Collected: ${input.collectedDate}
> Published: Unknown
${cardLine}
${input.body}
`;
}
