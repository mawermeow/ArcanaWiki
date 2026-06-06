export type LabyrinthosOrientation = "upright" | "reversed";

export type LabyrinthosCardContent = {
  uprightKeywords: string;
  reversedKeywords: string;
  description: string;
  uprightSummary: string;
  reversedSummary: string;
  uprightLove: string;
  reversedLove: string;
  uprightCareer: string;
  reversedCareer: string;
  uprightFinances: string;
  reversedFinances: string;
  uprightFeelings: string;
  reversedFeelings: string;
  uprightActions: string;
  reversedActions: string;
};

function sectionText(body: string, headingPattern: RegExp): string {
  const match = body.match(headingPattern);
  if (!match || match.index === undefined) {
    return "";
  }

  const start = match.index + match[0].length;
  const rest = body.slice(start);
  const nextHeading = rest.search(/\n## |\n### /);
  const chunk = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
  return chunk.replace(/^\n+/, "").trim();
}

function subsectionText(body: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return sectionText(body, new RegExp(`^### ${escaped}\\s*$`, "m"));
}

function tableKeywordRow(body: string, heading: string): { upright: string; reversed: string } {
  const section = sectionText(body, new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m"));
  const rows = [...section.matchAll(/^\|([^|\n]+)\|([^|\n]+)\|/gm)];
  const dataRow = rows.find((row) => !row[1].includes("---") && !/keywords/i.test(row[1]));
  return {
    upright: dataRow?.[1]?.trim() ?? "",
    reversed: dataRow?.[2]?.trim() ?? ""
  };
}

function topicTableHints(body: string, orientation: LabyrinthosOrientation): {
  love: string;
  career: string;
  finances: string;
} {
  const heading =
    orientation === "upright" ? /upright .* meaning$/im : /reversed .* meaning$/im;
  const section = sectionText(body, heading);
  const rows = [...section.matchAll(/^\|([^|\n]+)\|([^|\n]+)\|([^|\n]+)\|/gm)];
  const dataRow = rows.find((row) => !row[1].includes("---") && !/meaning/i.test(row[1]));
  return {
    love: dataRow?.[1]?.trim() ?? "",
    career: dataRow?.[2]?.trim() ?? "",
    finances: dataRow?.[3]?.trim() ?? ""
  };
}

export function parseLabyrinthosRaw(markdown: string): LabyrinthosCardContent {
  const body = markdown.replace(/^#[^\n]*\n+/m, "").replace(/^>[^\n]*\n+/gm, "").trim();
  const keywords = tableKeywordRow(body, body.match(/^## ([^\n]*Keywords)/m)?.[1] ?? "Keywords");
  const uprightHints = topicTableHints(body, "upright");
  const reversedHints = topicTableHints(body, "reversed");

  const descriptionHeading = body.match(/^## ([^\n]*Tarot Card Description)/m)?.[1];
  const uprightHeading = body.match(/^## (Upright[^\n]*)/m)?.[1];
  const reversedHeading = body.match(/^## (Reversed[^\n]*)/m)?.[1];

  const findLove = (orientation: LabyrinthosOrientation) => {
    const sections = [...body.matchAll(/^### ([^\n]*Love[^\n]*)/gm)].map((match) => match[1]);
    const target = sections.find((title) =>
      orientation === "upright" ? /upright/i.test(title) : /reversed/i.test(title)
    );
    return target ? subsectionText(body, target) : "";
  };

  const findTopic = (topic: "Career" | "Finances" | "Feelings" | "Actions", orientation: LabyrinthosOrientation) => {
    const sections = [...body.matchAll(/^### ([^\n]*)/gm)].map((match) => match[1]);
    const target = sections.find((title) => {
      const hasTopic = title.includes(topic);
      const hasOrientation =
        orientation === "upright"
          ? /upright/i.test(title) || /- Upright /.test(title)
          : /reversed/i.test(title) || /- Reversed /.test(title);
      return hasTopic && hasOrientation;
    });
    return target ? subsectionText(body, target) : "";
  };

  return {
    uprightKeywords: keywords.upright,
    reversedKeywords: keywords.reversed,
    description: descriptionHeading ? sectionText(body, new RegExp(`^## ${descriptionHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m")) : "",
    uprightSummary: uprightHeading
      ? sectionText(body, new RegExp(`^## ${uprightHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m"))
          .split("\n\n")[0]
          ?.trim() ?? ""
      : "",
    reversedSummary: reversedHeading
      ? sectionText(body, new RegExp(`^## ${reversedHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m"))
          .split("\n\n")[0]
          ?.trim() ?? ""
      : "",
    uprightLove: findLove("upright") || uprightHints.love,
    reversedLove: findLove("reversed") || reversedHints.love,
    uprightCareer: findTopic("Career", "upright") || uprightHints.career,
    reversedCareer: findTopic("Career", "reversed") || reversedHints.career,
    uprightFinances: findTopic("Finances", "upright") || uprightHints.finances,
    reversedFinances: findTopic("Finances", "reversed") || reversedHints.finances,
    uprightFeelings: findTopic("Feelings", "upright"),
    reversedFeelings: findTopic("Feelings", "reversed"),
    uprightActions: findTopic("Actions", "upright"),
    reversedActions: findTopic("Actions", "reversed")
  };
}
