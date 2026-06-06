import { randomInt } from "node:crypto";

import { readBm25Index } from "../retrieval/persistence.ts";
import type { TarotCardInput } from "../answer/types.ts";

const DEFAULT_INDEX_PATH = "embeddings/bm25-index.json";

type SpreadPlan = {
  spreadId: string;
  fallbackTitle: string;
  positions: string[];
};

type AutoReadingContext = {
  question: string;
};

export type GeneratedReadingCard = TarotCardInput & {
  title: string;
};

export type GeneratedReading = {
  spreadId: string;
  spreadTitle: string;
  cards: GeneratedReadingCard[];
};

const SPREAD_PLANS: Record<string, SpreadPlan> = {
  "spread-three-card": {
    spreadId: "spread-three-card",
    fallbackTitle: "三張牌占卜法",
    positions: ["現況", "核心張力", "溫和建議"]
  },
  "spread-either-or": {
    spreadId: "spread-either-or",
    fallbackTitle: "二選一牌陣",
    positions: ["選項 A 的走向", "選項 B 的走向", "選擇提醒"]
  },
  "spread-love-tree": {
    spreadId: "spread-love-tree",
    fallbackTitle: "愛情樹牌陣",
    positions: ["目前關係狀態", "核心癥結", "可調整方向"]
  },
  "spread-lover-reunion": {
    spreadId: "spread-lover-reunion",
    fallbackTitle: "情人復合牌陣",
    positions: ["目前距離", "未解課題", "連結可能", "行動提醒"]
  },
  "spread-time-flow": {
    spreadId: "spread-time-flow",
    fallbackTitle: "時間流牌陣",
    positions: ["過去脈絡", "現在狀態", "接下來的走向"]
  },
  "spread-four-elements": {
    spreadId: "spread-four-elements",
    fallbackTitle: "四元素牌陣",
    positions: ["想法", "情緒", "現實條件", "整合提醒"]
  }
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function chooseSpreadPlan(context: AutoReadingContext): SpreadPlan {
  const text = normalizeText(context.question);

  if (includesAny(text, ["復合", "重新開始", "回頭", "還有機會復合"])) {
    return SPREAD_PLANS["spread-lover-reunion"];
  }

  if (includesAny(text, ["還是", "或是", "二選一", "該不該", "選哪個", "選擇"])) {
    return SPREAD_PLANS["spread-either-or"];
  }

  if (includesAny(text, ["冷淡", "疏遠", "曖昧", "感情", "關係", "戀愛"])) {
    return SPREAD_PLANS["spread-love-tree"];
  }

  if (includesAny(text, ["之後", "接下來", "未來", "走向", "趨勢", "這週", "本週"])) {
    return SPREAD_PLANS["spread-time-flow"];
  }

  if (includesAny(text, ["自我", "內在", "靈性", "我真正想要", "怎麼理解自己"])) {
    return SPREAD_PLANS["spread-four-elements"];
  }

  return SPREAD_PLANS["spread-three-card"];
}

export async function generateAutoReading(options: {
  question: string;
  indexPath?: string;
}): Promise<GeneratedReading> {
  const index = await readBm25Index(options.indexPath ?? DEFAULT_INDEX_PATH);
  const plan = chooseSpreadPlan({ question: options.question });
  const cardDocuments = index.documents.filter((document) => document.pageType === "card");
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
    cards
  };
}
