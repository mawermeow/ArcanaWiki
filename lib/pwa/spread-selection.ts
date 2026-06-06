import { FetchOpenAiChatClient } from "../answer/openai-client.ts";
import type { OpenAiChatClient } from "../answer/types.ts";
import { searchBm25Index } from "../retrieval/bm25-searcher.ts";
import { readBm25Index } from "../retrieval/persistence.ts";
import { searchWikiHybrid } from "../retrieval/search-api.ts";
import type { BM25Index, HybridSearchResponse, RetrievalDocument } from "../retrieval/types.ts";
import {
  AUTO_DRAW_SPREAD_IDS,
  chooseSpreadPlanByKeyword,
  getSpreadPlan,
  type SpreadPlan
} from "./spread-plans.ts";

const DEFAULT_INDEX_PATH = "embeddings/bm25-index.json";
const DEFAULT_CANDIDATE_LIMIT = 5;

export type SpreadCandidate = {
  spreadId: string;
  title: string;
  summary: string;
  topics: string[];
  positions: string[];
  retrievalScore: number;
};

export type SpreadSelectionMethod = "llm" | "retrieval" | "keyword";

export type SpreadSelectionResult = {
  spreadId: string;
  plan: SpreadPlan;
  reason: string;
  method: SpreadSelectionMethod;
  candidates: SpreadCandidate[];
};

type SpreadSelectionDependencies = {
  index?: BM25Index;
  indexPath?: string;
  chatClient?: OpenAiChatClient;
  hybridSearch?: (query: string, options?: { index?: BM25Index; topK?: number }) => Promise<HybridSearchResponse>;
};

function summarizeSpreadContent(content: string): string {
  const normalized = content
    .replace(/^#\s+.+\n+/u, "")
    .replace(/\[[^\]]+\]\([^)]+\)/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  const summaryMatch = normalized.match(/摘要[：:]\s*([^#]+)/u);
  if (summaryMatch?.[1]) {
    return summaryMatch[1].trim().slice(0, 160);
  }

  const sentence = normalized.split(/(?<=[。！？.!?])\s+/u)[0] ?? normalized;
  return sentence.trim().slice(0, 160);
}

function findRepresentativeSpreadDocument(
  index: BM25Index,
  spreadId: string
): RetrievalDocument | undefined {
  const documents = index.documents.filter(
    (document) => document.pageType === "spread" && document.pageId === spreadId
  );

  return (
    documents.find((document) => document.sectionTitle === "Overview") ??
    documents.sort((left, right) => left.chunkId.localeCompare(right.chunkId, "en"))[0]
  );
}

function buildSpreadCandidate(
  index: BM25Index,
  spreadId: string,
  retrievalScore: number
): SpreadCandidate {
  const plan = getSpreadPlan(spreadId);
  const document = findRepresentativeSpreadDocument(index, spreadId);

  return {
    spreadId,
    title: document?.title ?? plan?.fallbackTitle ?? spreadId,
    summary: document ? summarizeSpreadContent(document.content) : plan?.fallbackTitle ?? "",
    topics: document?.topics ?? [],
    positions: plan?.positions ?? [],
    retrievalScore
  };
}

async function collectRetrievalScores(
  index: BM25Index,
  question: string,
  hybridSearch: SpreadSelectionDependencies["hybridSearch"]
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();

  const bumpScore = (spreadId: string, score: number) => {
    if (!AUTO_DRAW_SPREAD_IDS.includes(spreadId)) {
      return;
    }
    const previous = scores.get(spreadId) ?? 0;
    if (score > previous) {
      scores.set(spreadId, score);
    }
  };

  if (hybridSearch) {
    const hybrid = await hybridSearch(question, { index, topK: 20 });
    for (const result of hybrid.results) {
      bumpScore(result.pageId, result.finalScore);
    }
  }

  const bm25 = searchBm25Index(index, question, { topK: 20 });
  for (const result of bm25.results) {
    bumpScore(result.pageId, result.score);
  }

  return scores;
}

export async function retrieveSpreadCandidates(
  question: string,
  options: SpreadSelectionDependencies & { candidateLimit?: number } = {}
): Promise<SpreadCandidate[]> {
  const index = options.index ?? (await readBm25Index(options.indexPath ?? DEFAULT_INDEX_PATH));
  const hybridSearch = options.hybridSearch ?? searchWikiHybrid;
  const scores = await collectRetrievalScores(index, question, hybridSearch);

  const rankedIds = AUTO_DRAW_SPREAD_IDS.map((spreadId) => ({
    spreadId,
    score: scores.get(spreadId) ?? 0
  })).sort((left, right) => right.score - left.score);

  const candidateLimit = options.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT;
  const selectedIds = rankedIds
    .filter((entry) => entry.score > 0)
    .slice(0, candidateLimit)
    .map((entry) => entry.spreadId);

  if (!selectedIds.includes("spread-three-card")) {
    selectedIds.push("spread-three-card");
  }

  const uniqueIds = Array.from(new Set(selectedIds)).slice(0, candidateLimit + 1);
  if (uniqueIds.length === 0) {
    return AUTO_DRAW_SPREAD_IDS.map((spreadId) => buildSpreadCandidate(index, spreadId, 0));
  }

  return uniqueIds.map((spreadId) => buildSpreadCandidate(index, spreadId, scores.get(spreadId) ?? 0));
}

function buildRetrievalReason(candidate: SpreadCandidate): string {
  if (candidate.retrievalScore > 0) {
    return `依 wiki 檢索，「${candidate.title}」與你的問題語意最接近，因此選用此牌陣。`;
  }

  return `「${candidate.title}」是較通用的牌陣，適合先從多個面向理解你的問題。`;
}

function buildKeywordReason(plan: SpreadPlan): string {
  const reasons: Record<string, string> = {
    "spread-lover-reunion": "你的問題涉及復合或重新連結，較適合逐層檢視距離、課題與可能性的牌陣。",
    "spread-either-or": "你的問題像是在兩種選項之間猶豫，因此選用二選一牌陣。",
    "spread-love-tree": "你的問題聚焦在關係狀態與互動，因此選用愛情樹牌陣。",
    "spread-time-flow": "你的問題關心時間走向，因此選用時間流牌陣。",
    "spread-four-elements": "你的問題偏向自我理解與內在整合，因此選用四元素牌陣。",
    "spread-three-card": "你的問題適合先用彈性的三張牌陣，從現況、張力與溫和建議切入。"
  };

  return reasons[plan.spreadId] ?? `依問題主題，選用「${plan.fallbackTitle}」。`;
}

function renderCandidatesForPrompt(candidates: SpreadCandidate[]): string {
  return candidates
    .map((candidate, index) =>
      [
        `${index + 1}. spreadId: ${candidate.spreadId}`,
        `   title: ${candidate.title}`,
        `   summary: ${candidate.summary || "（無摘要）"}`,
        `   topics: ${candidate.topics.join("、") || "（無）"}`,
        `   positions: ${candidate.positions.join("、")}`,
        `   retrievalScore: ${candidate.retrievalScore.toFixed(4)}`
      ].join("\n")
    )
    .join("\n\n");
}

function parseSpreadSelectionJson(
  text: string
): { spreadId?: string; reason?: string } | null {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed) as { spreadId?: string; reason?: string };
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/u);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]) as { spreadId?: string; reason?: string };
    } catch {
      return null;
    }
  }
}

async function selectSpreadWithLlm(options: {
  question: string;
  candidates: SpreadCandidate[];
  chatClient: OpenAiChatClient;
}): Promise<{ spreadId: string; reason: string } | null> {
  const allowedIds = new Set(options.candidates.map((candidate) => candidate.spreadId));
  const response = await options.chatClient.generate([
    {
      role: "system",
      content: [
        "你是塔羅牌陣選擇助手。",
        "只能從提供的候選牌陣中選一個 spreadId。",
        "理由需溫和、具體，說明為何此牌陣適合使用者的問題。",
        "不要預言結果，不要做醫療/法律/財務斷言。",
        "只回傳 JSON，格式：{\"spreadId\":\"...\",\"reason\":\"...\"}",
        "reason 使用繁體中文，1 到 2 句。"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `使用者問題：${options.question}`,
        "",
        "候選牌陣：",
        renderCandidatesForPrompt(options.candidates)
      ].join("\n")
    }
  ]);

  const parsed = parseSpreadSelectionJson(response.text);
  const spreadId = typeof parsed?.spreadId === "string" ? parsed.spreadId.trim() : "";
  const reason = typeof parsed?.reason === "string" ? parsed.reason.trim() : "";

  if (!spreadId || !allowedIds.has(spreadId) || !reason) {
    return null;
  }

  return { spreadId, reason };
}

function resolveSpreadSelection(options: {
  spreadId: string;
  reason: string;
  method: SpreadSelectionMethod;
  candidates: SpreadCandidate[];
}): SpreadSelectionResult {
  const plan = getSpreadPlan(options.spreadId) ?? chooseSpreadPlanByKeyword("");

  return {
    spreadId: plan.spreadId,
    plan,
    reason: options.reason,
    method: options.method,
    candidates: options.candidates
  };
}

export async function selectSpreadForQuestion(
  question: string,
  dependencies: SpreadSelectionDependencies = {}
): Promise<SpreadSelectionResult> {
  const trimmedQuestion = question.trim();
  const candidates = await retrieveSpreadCandidates(trimmedQuestion, dependencies);

  const chatClient =
    dependencies.chatClient ??
    (process.env.OPENAI_API_KEY ? new FetchOpenAiChatClient() : undefined);

  if (chatClient) {
    try {
      const llmSelection = await selectSpreadWithLlm({
        question: trimmedQuestion,
        candidates,
        chatClient
      });

      if (llmSelection) {
        return resolveSpreadSelection({
          spreadId: llmSelection.spreadId,
          reason: llmSelection.reason,
          method: "llm",
          candidates
        });
      }
    } catch {
      // Fall through to retrieval / keyword fallback.
    }
  }

  const topCandidate = [...candidates].sort(
    (left, right) => right.retrievalScore - left.retrievalScore
  )[0];

  if (topCandidate && topCandidate.retrievalScore > 0) {
    return resolveSpreadSelection({
      spreadId: topCandidate.spreadId,
      reason: buildRetrievalReason(topCandidate),
      method: "retrieval",
      candidates
    });
  }

  const keywordPlan = chooseSpreadPlanByKeyword(trimmedQuestion);
  return resolveSpreadSelection({
    spreadId: keywordPlan.spreadId,
    reason: buildKeywordReason(keywordPlan),
    method: "keyword",
    candidates
  });
}
