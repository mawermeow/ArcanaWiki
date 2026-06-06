import test from "node:test";
import assert from "node:assert/strict";

import { readBm25Index } from "../../lib/retrieval/persistence.ts";
import type { HybridSearchResponse } from "../../lib/retrieval/types.ts";
import {
  retrieveSpreadCandidates,
  selectSpreadForQuestion
} from "../../lib/pwa/spread-selection.ts";

let cachedIndex: Awaited<ReturnType<typeof readBm25Index>> | undefined;

async function getIndex() {
  cachedIndex ??= await readBm25Index("embeddings/bm25-index.json");
  return cachedIndex;
}

test("retrieveSpreadCandidates ranks supported spreads from retrieval scores", async () => {
  const index = await getIndex();
  const candidates = await retrieveSpreadCandidates("我們還有機會復合嗎？", {
    index,
    hybridSearch: async () =>
      ({
        query: "我們還有機會復合嗎？",
        results: [
          {
            chunkId: "spread-lover-reunion::overview",
            pageId: "spread-lover-reunion",
            title: "情人復合牌陣",
            sectionTitle: "Overview",
            finalScore: 0.82,
            sourceScores: {},
            sources: ["bm25"],
            metadata: {}
          }
        ],
        diagnostics: {
          bm25Results: [],
          vectorResults: [],
          normalizedScores: [],
          mergedResults: [],
          graphExpandedResults: [],
          rejectedResults: [],
          finalResults: [],
          weights: { bm25: 0.45, vector: 0.55, graph: 0.15 },
          topK: 8,
          timingMs: { bm25: 0, vector: 0, merge: 0, graph: 0, total: 0 },
          queryTokens: []
        }
      }) satisfies HybridSearchResponse
  });

  assert.ok(candidates.length >= 1);
  assert.equal(candidates[0]?.spreadId, "spread-lover-reunion");
  assert.ok(candidates.some((candidate) => candidate.spreadId === "spread-three-card"));
});

test("selectSpreadForQuestion uses LLM reason when response is valid", async () => {
  const index = await getIndex();

  const selection = await selectSpreadForQuestion("對方最近很冷淡，我該怎麼理解這段關係？", {
    index,
    hybridSearch: async () =>
      ({
        query: "對方最近很冷淡，我該怎麼理解這段關係？",
        results: [
          {
            chunkId: "spread-love-tree::overview",
            pageId: "spread-love-tree",
            title: "愛情樹牌陣",
            sectionTitle: "Overview",
            finalScore: 0.71,
            sourceScores: {},
            sources: ["bm25"],
            metadata: {}
          }
        ],
        diagnostics: {
          bm25Results: [],
          vectorResults: [],
          normalizedScores: [],
          mergedResults: [],
          graphExpandedResults: [],
          rejectedResults: [],
          finalResults: [],
          weights: { bm25: 0.45, vector: 0.55, graph: 0.15 },
          topK: 8,
          timingMs: { bm25: 0, vector: 0, merge: 0, graph: 0, total: 0 },
          queryTokens: []
        }
      }) satisfies HybridSearchResponse,
    chatClient: {
      async generate() {
        return {
          text: JSON.stringify({
            spreadId: "spread-love-tree",
            reason: "這個問題聚焦在關係互動與距離感，愛情樹牌陣適合檢視現況、癥結與調整方向。"
          }),
          model: "mock-model"
        };
      }
    }
  });

  assert.equal(selection.spreadId, "spread-love-tree");
  assert.equal(selection.method, "llm");
  assert.match(selection.reason, /愛情樹牌陣/);
});

test("selectSpreadForQuestion falls back to retrieval when LLM output is invalid", async () => {
  const index = await getIndex();

  const selection = await selectSpreadForQuestion("我們還有機會復合嗎？", {
    index,
    hybridSearch: async () =>
      ({
        query: "我們還有機會復合嗎？",
        results: [
          {
            chunkId: "spread-lover-reunion::overview",
            pageId: "spread-lover-reunion",
            title: "情人復合牌陣",
            sectionTitle: "Overview",
            finalScore: 0.9,
            sourceScores: {},
            sources: ["bm25"],
            metadata: {}
          }
        ],
        diagnostics: {
          bm25Results: [],
          vectorResults: [],
          normalizedScores: [],
          mergedResults: [],
          graphExpandedResults: [],
          rejectedResults: [],
          finalResults: [],
          weights: { bm25: 0.45, vector: 0.55, graph: 0.15 },
          topK: 8,
          timingMs: { bm25: 0, vector: 0, merge: 0, graph: 0, total: 0 },
          queryTokens: []
        }
      }) satisfies HybridSearchResponse,
    chatClient: {
      async generate() {
        return {
          text: "{\"spreadId\":\"spread-unknown\",\"reason\":\"不合法\"}",
          model: "mock-model"
        };
      }
    }
  });

  assert.equal(selection.spreadId, "spread-lover-reunion");
  assert.equal(selection.method, "retrieval");
  assert.match(selection.reason, /wiki 檢索/);
});

test("selectSpreadForQuestion falls back to keyword rules without retrieval signal", async () => {
  const index = await getIndex();

  const selection = await selectSpreadForQuestion("我該選 A 還是 B？", {
    index,
    hybridSearch: async () =>
      ({
        query: "我該選 A 還是 B？",
        results: [],
        diagnostics: {
          bm25Results: [],
          vectorResults: [],
          normalizedScores: [],
          mergedResults: [],
          graphExpandedResults: [],
          rejectedResults: [],
          finalResults: [],
          weights: { bm25: 0.45, vector: 0.55, graph: 0.15 },
          topK: 8,
          timingMs: { bm25: 0, vector: 0, merge: 0, graph: 0, total: 0 },
          queryTokens: []
        }
      }) satisfies HybridSearchResponse,
    chatClient: {
      async generate() {
        return {
          text: "not json",
          model: "mock-model"
        };
      }
    }
  });

  assert.equal(selection.spreadId, "spread-either-or");
  assert.equal(selection.method, "keyword");
  assert.match(selection.reason, /二選一/);
});
