import fs from "node:fs/promises";
import path from "node:path";

import { linkFilenameToCardId } from "./card-id-mapping.ts";
import { LABYRINTHOS_SITUATION_OVERRIDES } from "./labyrinthos-situation-overrides.ts";
import { parseLabyrinthosRaw, type LabyrinthosCardContent } from "./labyrinthos-parse.ts";

type ManifestEntry = {
  name: string;
  link: string;
  slug: string;
  sourceUrl: string;
  rawFile: string;
};

const UPDATED_DATE = "2026-06-06";

function distillParagraph(text: string, maxSentences = 2): string {
  if (!text.trim()) {
    return "";
  }

  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return sentences.slice(0, maxSentences).join(" ");
}

const HINT_GLOSSARY: Record<string, string> = {
  "new relationship": "新關係的萌芽",
  "fun light romance": "輕鬆浪漫的氛圍",
  "new job": "新工作機會",
  "new business": "新事業起步",
  "breath of fresh air at work": "職場上的新鮮感",
  "spontaneous spending": "較隨性的支出",
  "financial opportunities": "財務上的新機會",
  "lack of commitment": "承諾感不足",
  "risky relationship": "風險較高的關係",
  "stale and boring job": "乏味停滯的工作",
  "reckless actions at work": "職場上的魯莽行動",
  "caution around financial opportunities": "對財務機會需謹慎評估",
  "foolish purchases": "衝動或不智的消費",
  "creating opportunities for love": "主動創造戀愛機會",
  "being proactive in love": "在感情中採取主動",
  "harnessing career opportunities": "把握職涯機會",
  "determination and drive": "決心與推進力",
  "pursuing financial opportunity": "追尋財務機會",
  "making use of skills": "運用自身技能",
  "romantic illusion": "浪漫幻覺",
  "romantic trickery": "感情中的欺瞞或話術",
  "low willpower for love": "在感情中意志薄弱",
  "wasted talent": "才華未被善用",
  "unwillingness to take chances": "不願承擔風險",
  "workplace deception": "職場中的欺瞞",
  "missed financial opportunity": "錯過財務機會",
  "not using skills for financial gain": "未將技能轉為財務收益",
  "remain patient in love": "感情中保持耐心",
  "calm exterior with inner passion": "外表平靜、內在熱情",
  intimacy: "親密感加深",
  education: "進修或學習",
  "creative inspiration": "創意靈感",
  guide: "導師或指引",
  mentor: "良師益友",
  "use instincts": "運用直覺",
  "keeping your financial situation private": "財務狀況宜保持低調",
  "ignoring intuition in romance": "忽略感情直覺",
  "hiding true self with lover": "對伴侶隱藏真實自我",
  "feeling isolated": "感到孤立",
  "lacking project information": "缺乏專案資訊",
  "rejecting intuition": "拒絕直覺訊號",
  "lack of information": "資訊不足",
  "not knowing all the facts": "尚未掌握全貌",
  nurturing: "滋養與關懷",
  "supportive lover": "支持性的伴侶",
  "sensual committed relationship": "感性且願承諾的關係",
  "nurturing colleagues": "互相支持的同事",
  "freshening up office": "工作環境煥然一新",
  "creative period at work": "職場創意旺盛期",
  "material comfort": "物質上的舒適",
  giving: "願意給予",
  "sharing material wealth": "分享物質資源",
  generosity: "慷慨之心",
  "lack of self worth": "自我價值感不足",
  jealous: "嫉妒心",
  "clingy lover": "過度依戀的伴侶",
  "lack of progress in love": "感情停滯",
  "feeling insecure at work": "職場不安全感",
  "not growing skills": "技能未成長",
  "stale job": "工作乏味",
  "feeling insecure about finances": "對財務感到不安",
  "despite being stable": "儘管表面穩定",
  "traditional relationship": "較傳統的關係模式",
  "use logic in love": "以理性面對感情",
  "unexpressed emotions": "情感尚未表達",
  "creating processes": "建立流程與制度",
  structure: "結構化",
  discipline: "紀律",
  routine: "例行規律",
  "being disciplined about money": "對金錢較有紀律",
  "power struggle": "權力拉扯",
  competitiveness: "競爭心態",
  "overbearing partner": "過於強勢的伴侶",
  "low concentration or focus": "注意力分散",
  bureaucracy: "官僚僵化",
  "bad boss": "不佳的上司",
  "not disciplined about money": "金錢紀律不足",
  "out of control finances": "財務失控"
};

function hintToZh(hint: string): string {
  if (!hint.trim() || hint.includes("|")) {
    return "";
  }

  return hint
    .split(",")
    .map((part) => HINT_GLOSSARY[part.trim().toLowerCase()] ?? "")
    .filter(Boolean)
    .join("、");
}

function isTableHint(text: string): boolean {
  return /^\|[^|\n]+\|[^|\n]+\|[^|\n]+\|$/.test(text.trim());
}

function synthesizeFromDetail(text: string, orientation: "正位" | "逆位"): string {
  if (!text.trim() || isTableHint(text)) {
    return "";
  }

  const lower = text.toLowerCase();
  const clauses: string[] = [];

  const add = (condition: boolean, upright: string, reversed: string) => {
    if (condition) {
      clauses.push(orientation === "正位" ? upright : reversed);
    }
  };

  add(/new adventure|new journey|embark|new beginning/i.test(lower),
    "可以理解為願意以好奇心踏出新的步伐，對未知保持開放。",
    "可能提醒你放慢腳步，先評估風險再前行，避免衝動決定。");
  add(/patience|trust.*intuition|listen.*gut/i.test(lower),
    "宜保持耐心，信任直覺給你的細微訊號，而非只看表面。",
    "可能象徵直覺被壓抑或忽略，宜重新傾聽內在聲音。");
  add(/honest|honesty|truth/i.test(lower),
    "誠實面對自己與對方，可能有助於關係深化。",
    "需留意是否為取悅他人而說違心之語，或對真相有所迴避。");
  add(/manifest|create|skill|resourceful|determination/i.test(lower),
    "可能象徵你已具備將意圖化為行動的資源與技巧，關鍵在於專注運用。",
    "可能暗示才華未發揮、方向模糊，或需辨識是否存在幻覺與欺瞞。");
  add(/nurtur|abundance|creativ|self-care|generous/i.test(lower),
    "可能象徵滋養、創造與豐饒的能量流動，宜照顧自己與所珍視之人事物。",
    "可能提醒你觀察是否過度付出、控制，或與自身感受斷聯。");
  add(/structure|discipline|routine|authority|boundar/i.test(lower),
    "可能象徵需要建立清楚的界線、規律與責任感，以穩固當下局面。",
    "可能暗示僵化、控制過度，或紀律失衡導致局勢失序。");
  add(/education|learn|mentor|inspir/i.test(lower),
    "可能適合進修、尋求導師，或從新靈感中汲取方向。",
    "可能象徵資訊不足、孤立感，或直覺與外在資訊之間有落差。");
  add(/financ|money|spend|invest|bank/i.test(lower),
    "財務面向宜留意直覺與事實是否一致，謹慎評估再決定。",
    "可能提醒你避免衝動消費，或釐清尚未掌握的財務細節。");
  add(/spontane|adventure|explor|curious/i.test(lower),
    "可能邀請你以較輕盈、好奇的心態嘗試，拓展視野。",
    "可能提醒你過度隨性或準備不足，宜先釐清意圖。");
  add(/reckless|careless|naive|gullible|stale|dull/i.test(lower),
    "",
    "可能象徵魯莽、分心或停滯，宜提高覺察、避免輕信表面誘因。");
  add(/feelings|emotion|inner|self-reflect/i.test(lower),
    "這也是觀察內在感受的好時機：你真正渴望的是什麼？",
    "可能反映自我懷疑或情緒混亂，宜給自己安靜空間整理。");

  if (clauses.length === 0) {
    return "";
  }

  return clauses.slice(0, 2).join("");
}

function buildTopicBlock(
  orientation: "正位" | "逆位",
  hints: string,
  detail: string
): string {
  const tableHint = isTableHint(detail) ? detail : hints;
  const hintZh = hintToZh(tableHint);
  const synthesis = synthesizeFromDetail(isTableHint(detail) ? "" : detail, orientation);
  const parts: string[] = [];

  if (hintZh) {
    parts.push(`${orientation}時，可能象徵${hintZh}。`);
  }
  if (synthesis) {
    parts.push(synthesis);
  }
  if (parts.length === 0) {
    return `${orientation}時，可回到牌義核心關鍵字觀察當下脈絡。`;
  }
  return parts.join("");
}

function synthesizeSymbolismZh(_description: string): string {
  return "";
}

function synthesizeSpiritual(content: LabyrinthosCardContent): string {
  const upright = synthesizeFromDetail(content.uprightSummary, "正位");
  const reversed = synthesizeFromDetail(content.reversedSummary, "逆位");

  const uprightPart = upright
    ? `正位時，${upright}`
    : "正位時，這張牌可能邀請你以較開放的心面對未知，把旅程本身視為學習與成長。";
  const reversedPart = reversed
    ? `逆位時，${reversed}`
    : "逆位時，則提醒你留意是否逃避覺察、或把自由當成不去承擔後果的藉口。";

  return `${uprightPart} ${reversedPart}`;
}

function synthesizeAction(text: string, orientation: "正位" | "逆位"): string {
  const synthesis = synthesizeFromDetail(text, orientation);
  if (synthesis) {
    return synthesis.replace(/^可能/, "").replace(/^可以理解為/, "宜");
  }
  return orientation === "正位"
    ? "保持好奇，以小步嘗試拓展視野，同時留意周遭提醒。"
    : "先放慢腳步，釐清意圖與界線，再採取行動。";
}

export function buildSituationReading(content: LabyrinthosCardContent): string {
  const uprightLoveHints = isTableHint(content.uprightLove) ? content.uprightLove : "";
  const reversedLoveHints = isTableHint(content.reversedLove) ? content.reversedLove : "";

  const love = `### 感情

${buildTopicBlock("正位", uprightLoveHints, content.uprightLove)}

${buildTopicBlock("逆位", reversedLoveHints, content.reversedLove)}`;

  const work = `### 工作

${buildTopicBlock("正位", "", content.uprightCareer)}

${buildTopicBlock("逆位", "", content.reversedCareer)}`;

  const finance = `### 財務

${buildTopicBlock("正位", "", content.uprightFinances)}

${buildTopicBlock("逆位", "", content.reversedFinances)}`;

  const self = `### 自我探索

${buildTopicBlock("正位", "", content.uprightFeelings)}

${buildTopicBlock("逆位", "", content.reversedFeelings)}

**行動提醒（正位）：** ${synthesizeAction(content.uprightActions, "正位")}

**行動提醒（逆位）：** ${synthesizeAction(content.reversedActions, "逆位")}`;

  const spiritual = `### 靈性

${synthesizeSpiritual(content)}`;

  return [love, work, finance, self, spiritual].join("\n\n");
}

function replaceSection(body: string, heading: string, replacement: string): string {
  const pattern = new RegExp(`(## ${heading}\\s*\\n)([\\s\\S]*?)(?=\\n## |$)`);
  if (!pattern.test(body)) {
    return body;
  }
  return body.replace(pattern, `$1${replacement.trim()}\n`);
}

function updateFrontmatter(raw: string, labyrinthosRawRef: string): string {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return raw;
  }

  let frontmatter = match[1];
  frontmatter = frontmatter.replace(/^updated:.*$/m, `updated: ${UPDATED_DATE}`);

  if (!frontmatter.includes(labyrinthosRawRef)) {
    if (/^raw_refs:\n/m.test(frontmatter)) {
      frontmatter = frontmatter.replace(
        /^(raw_refs:\n(?:  - .+\n)*)/m,
        `$1  - ${labyrinthosRawRef}\n`
      );
    } else {
      frontmatter += `\nraw_refs:\n  - ${labyrinthosRawRef}\n`;
    }
  }

  if (!/labyrinthos\.co/.test(frontmatter)) {
    if (/^source_refs:\n/m.test(frontmatter)) {
      frontmatter = frontmatter.replace(
        /^(source_refs:\n(?:  - .+\n)*)/m,
        `$1  - labyrinthos.co\n`
      );
    } else {
      frontmatter += `\nsource_refs:\n  - labyrinthos.co\n`;
    }
  }

  if (!/^  - 財務/m.test(frontmatter) && /^topics:\n/m.test(frontmatter)) {
    frontmatter = frontmatter.replace(
      /^(topics:\n(?:  - .+\n)*)(  - 工作\n)/m,
      "$1$2  - 財務\n"
    );
  }

  return raw.replace(/^---\n[\s\S]*?\n---/, `---\n${frontmatter.trim()}\n---`);
}

function updateRawMetadata(body: string, slug: string): string {
  const labyrinthosLink = `[labyrinthos ${slug}](../../raw/tarot/${UPDATED_DATE}-labyrinthos-${slug}.md)`;
  if (body.includes(labyrinthosLink)) {
    return body;
  }

  return body.replace(
    /(> Raw: [^\n]+)/,
    (line) => (line.includes("labyrinthos") ? line : `${line}; ${labyrinthosLink}`)
  );
}

function enrichSymbolism(body: string, _description: string): string {
  const sectionMatch = body.match(/## 牌面象徵\s*\n([\s\S]*?)(?=\n## |$)/);
  const existing = (sectionMatch?.[1] ?? "")
    .replace(/\n\n（Labyrinthos 補充）[\s\S]*$/m, "")
    .trim();

  if (existing === sectionMatch?.[1]?.trim()) {
    return body;
  }

  return replaceSection(body, "牌面象徵", existing);
}

function fixUndefinedText(body: string): string {
  return body.replace(/\bundefined\b/g, "（待補充）");
}

export async function compileLabyrinthosCard(entry: ManifestEntry): Promise<string> {
  const cardId = linkFilenameToCardId(entry.link);
  if (!cardId) {
    throw new Error(`Unable to map link ${entry.link} to cardId.`);
  }

  const wikiPath = path.join("wiki", "cards", `${cardId}.md`);
  const rawMarkdown = await fs.readFile(entry.rawFile, "utf8");
  const content = parseLabyrinthosRaw(rawMarkdown);
  const situationReading =
    LABYRINTHOS_SITUATION_OVERRIDES[cardId] ?? buildSituationReading(content);

  let wiki = await fs.readFile(wikiPath, "utf8");
  wiki = updateFrontmatter(wiki, entry.rawFile);
  wiki = updateRawMetadata(wiki, entry.slug);
  wiki = enrichSymbolism(wiki, content.description);
  wiki = replaceSection(wiki, "情境解讀", situationReading);
  wiki = fixUndefinedText(wiki);

  if (!wiki.includes(entry.sourceUrl)) {
    wiki = wiki.replace(
      /(## Citation\n[\s\S]*?)(?=\n## |\n*$)/,
      (section) => `${section.trim()}\n- Labyrinthos: ${entry.sourceUrl}\n`
    );
  }

  await fs.writeFile(wikiPath, wiki.endsWith("\n") ? wiki : `${wiki}\n`, "utf8");
  return cardId;
}
