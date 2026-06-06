import test from "node:test";
import assert from "node:assert/strict";

import { readRelationGraph } from "../../lib/retrieval/graph-loader.ts";
import { readBm25Index, readVectorCache } from "../../lib/retrieval/persistence.ts";
import { validateTarotAnswer } from "../../lib/answer/answer-validator.ts";
import { buildAnswerContext, buildAnswerQuery } from "../../lib/answer/context-builder.ts";
import {
  attachSelectedSourceCitations,
  formatAnswerForDisplay,
  validateCitations
} from "../../lib/answer/citation-validator.ts";
import { createTarotAnswerService } from "../../lib/answer/index.ts";
import { FetchOpenAiChatClient } from "../../lib/answer/openai-client.ts";
import { buildAnswerPrompt } from "../../lib/answer/prompt-builder.ts";
import { detectSafetyGuardrails } from "../../lib/answer/safety.ts";
import type {
  BM25Index,
  HybridSearchResponse,
  RelationGraph,
  VectorCache
} from "../../lib/retrieval/types.ts";
import type { OpenAiChatClient } from "../../lib/answer/types.ts";

let cachedFixtures: Promise<{
  index: BM25Index;
  cache: VectorCache;
  graph: RelationGraph;
}>;

async function getFixtures() {
  cachedFixtures ??= Promise.all([
    readBm25Index("embeddings/bm25-index.json"),
    readVectorCache("embeddings/vector-cache.json"),
    readRelationGraph("relations/graph.json")
  ]).then(([index, cache, graph]) => ({ index, cache, graph }));
  return cachedFixtures;
}

function createEmptyFixtures() {
  const index: BM25Index = {
    metadata: {
      version: 1,
      deterministic: true,
      sourcePattern: "wiki/**/*.md",
      documentCount: 0,
      pageCount: 0,
      termCount: 0,
      averageDocumentLength: 0,
      bm25: { k1: 1.2, b: 0.75 },
      tokenizer: {
        protectedPhrases: [],
        notes: []
      },
      pageIds: [],
      tags: [],
      topics: []
    },
    documents: [],
    termFrequencies: {},
    documentFrequencies: {},
    averageDocumentLength: 0
  };

  const cache: VectorCache = {
    embeddingModel: "text-embedding-3-small",
    embeddingDimension: 0,
    generatedAt: "2026-06-06T00:00:00.000Z",
    documents: []
  };

  const graph: RelationGraph = {
    generatedAt: "2026-06-06T00:00:00.000Z",
    nodes: [],
    relationships: []
  };

  return { index, cache, graph };
}

test("prompt builder keeps layered SYSTEM / DEVELOPER / USER structure", async () => {
  const { index } = await getFixtures();
  const retrieval: HybridSearchResponse = {
    query: "聖杯二逆位 感情",
    results: [
      {
        chunkId: "cups-02::逆位意義",
        pageId: "cups-02",
        title: "聖杯二（Two of Cups）",
        sectionTitle: "逆位意義",
        finalScore: 0.99,
        sourceScores: { bm25: 1 },
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
      topK: 5,
      timingMs: { bm25: 0, vector: 0, merge: 0, graph: 0, total: 0 },
      queryTokens: ["聖杯二", "逆位", "感情"]
    }
  };
  const context = buildAnswerContext({
    request: {
      question: "這段關係還有希望嗎？",
      cards: [{ cardId: "cups-02", orientation: "reversed" }]
    },
    index,
    retrieval
  });

  const prompt = buildAnswerPrompt({
    request: {
      question: "這段關係還有希望嗎？",
      cards: [{ cardId: "cups-02", orientation: "reversed" }]
    },
    context,
    safety: { categories: [], requiresGuardrail: false }
  });

  assert.match(prompt.system, /^SYSTEM:/);
  assert.match(prompt.developer, /^DEVELOPER:/);
  assert.match(prompt.user, /^USER:/);
  assert.match(prompt.user, /WIKI CONTEXT:/);
});

test("context builder selects retrieval chunks and renders source contract", async () => {
  const { index } = await getFixtures();
  const retrieval: HybridSearchResponse = {
    query: "聖杯二逆位 感情",
    results: [
      {
        chunkId: "cups-02::逆位意義",
        pageId: "cups-02",
        title: "聖杯二（Two of Cups）",
        sectionTitle: "逆位意義",
        finalScore: 0.99,
        sourceScores: { bm25: 1 },
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
      topK: 5,
      timingMs: { bm25: 0, vector: 0, merge: 0, graph: 0, total: 0 },
      queryTokens: ["聖杯二", "逆位", "感情"]
    }
  };

  const context = buildAnswerContext({
    request: {
      question: "對方最近很冷淡",
      cards: [{ cardId: "cups-02", orientation: "reversed", position: "現況" }]
    },
    index,
    retrieval
  });

  assert.equal(context.selectedSources.length, 1);
  assert.match(context.renderedContext, /SOURCE: cups-02#cups-02::逆位意義/);
  assert.equal(buildAnswerQuery({
    question: "對方最近很冷淡",
    cards: [{ cardId: "cups-02", orientation: "reversed", position: "現況" }]
  }, index).includes("聖杯二"), true);
});

test("citation validator accepts selected sources and rejects unknown sources", () => {
  const selectedSources = [
    {
      pageId: "cups-02",
      chunkId: "cups-02::逆位意義",
      title: "聖杯二（Two of Cups）",
      sectionTitle: "逆位意義"
    }
  ];

  const valid = validateCitations("可能反映關係失衡。[來源: cups-02#cups-02::逆位意義]", selectedSources);
  assert.deepEqual(valid.errors, []);

  const invalid = validateCitations("可能反映關係失衡。[來源: fake#fake]", selectedSources);
  assert.ok(invalid.errors.some((error) => error.includes("Invalid citation")));
});

test("formatAnswerForDisplay removes inline citations and trailing citation block", () => {
  const answer = [
    "可能反映關係失衡。[來源: cups-02#cups-02::逆位意義]",
    "",
    "引用來源：",
    "- 聖杯二（Two of Cups） / 逆位意義 [來源: cups-02#cups-02::逆位意義]"
  ].join("\n");

  assert.equal(formatAnswerForDisplay(answer), "可能反映關係失衡。");
});

test("formatAnswerForDisplay removes citation blocks without deleting later interpretation sections", () => {
  const answer = [
    "先從壓力感開始看。",
    "",
    "引用來源：",
    "- 寶劍九（Nine of Swords） / 工作 [來源: swords-09#swords-09::情境解讀::工作]",
    "",
    "與問題的關聯",
    "這段關係目前比較像需要重新整理節奏。",
    "",
    "引用來源：",
    "- 命運之輪（The Wheel of Fortune） / 適用範圍 [來源: major-10-wheel-of-fortune#major-10-wheel-of-fortune::適用範圍]"
  ].join("\n");

  assert.equal(
    formatAnswerForDisplay(answer),
    ["先從壓力感開始看。", "", "與問題的關聯", "這段關係目前比較像需要重新整理節奏。"].join("\n")
  );
});

test("formatAnswerForDisplay removes duplicated citation blocks from model output", () => {
  const answer = [
    "先從壓力感開始看。",
    "",
    "引用來源：",
    "- 寶劍九（Nine of Swords） / 工作 [來源: swords-09#swords-09::情境解讀::工作]",
    "- 聖杯三（Three of Cups） / 核心關鍵字 [來源: cups-03#cups-03::核心關鍵字]",
    "",
    "引用來源：",
    "- 命運之輪（The Wheel of Fortune） / 適用範圍 [來源: major-10-wheel-of-fortune#major-10-wheel-of-fortune::適用範圍]"
  ].join("\n");

  assert.equal(formatAnswerForDisplay(answer), "先從壓力感開始看。");
});

test("attachSelectedSourceCitations replaces model citation block with selected sources", () => {
  const selectedSources = [
    {
      pageId: "cups-02",
      chunkId: "cups-02::逆位意義",
      title: "聖杯二（Two of Cups）",
      sectionTitle: "逆位意義"
    }
  ];

  const normalized = attachSelectedSourceCitations(
    [
      "可能反映關係失衡。",
      "",
      "引用來源：",
      "- 寶劍九（Nine of Swords） / 工作 [來源: swords-09#swords-09::情境解讀::工作]"
    ].join("\n"),
    selectedSources
  );

  assert.equal(
    formatAnswerForDisplay(normalized),
    "可能反映關係失衡。"
  );
  assert.match(normalized, /引用來源：/);
  assert.match(normalized, /\[來源: cups-02#cups-02::逆位意義\]/);
});

test("citation helper strips model citations and appends selected sources deterministically", () => {
  const selectedSources = [
    {
      pageId: "cups-02",
      chunkId: "cups-02::逆位意義",
      title: "聖杯二（Two of Cups）",
      sectionTitle: "逆位意義"
    }
  ];

  const normalized = attachSelectedSourceCitations(
    "可能反映關係失衡。[來源: fake#fake]",
    selectedSources
  );

  assert.match(normalized, /引用來源：/);
  assert.match(normalized, /\[來源: cups-02#cups-02::逆位意義\]/);
  assert.ok(!normalized.includes("[來源: fake#fake]"));
});

test("invalid citation fallback marks answer invalid", async () => {
  const { index, cache, graph } = await getFixtures();
  const service = createTarotAnswerService({
    loadIndex: async () => index,
    loadCache: async () => cache,
    loadGraph: async () => graph,
    client: {
      async generate() {
        return {
          text: "這段關係可能有拉扯。[來源: fake#fake]",
          model: "mock-model"
        };
      }
    }
  });

  const response = await service({
    question: "聖杯二逆位，對方最近很冷淡，這段關係還有希望嗎？"
  });

  assert.equal(response.safety.answerValid, true);
  assert.match(response.answer, /\[來源: /);
});

test("no selected sources fallback does not call OpenAI", async () => {
  const { index, cache, graph } = createEmptyFixtures();
  let called = false;
  const service = createTarotAnswerService({
    loadIndex: async () => index,
    loadCache: async () => cache,
    loadGraph: async () => graph,
    client: {
      async generate() {
        called = true;
        return {
          text: "should not happen",
          model: "mock-model"
        };
      }
    }
  });

  const response = await service({
    question: "完全不存在的問題與牌"
  });

  assert.equal(called, false);
  assert.equal(response.safety.answerValid, false);
  assert.equal(response.safety.cannotConfirmReason, "目前資料不足以確認");
});

test("safety guardrail detection catches high-risk and certainty-seeking queries", () => {
  const safety = detectSafetyGuardrails("他是否出軌？我要不要監控他的手機？");

  assert.ok(safety.categories.includes("certainty-about-other-person"));
  assert.ok(safety.categories.includes("stalking-or-control"));
  assert.equal(safety.requiresGuardrail, true);
});

test("request/response shape stays stable with mocked OpenAI client", async () => {
  const { index, cache, graph } = await getFixtures();
  const client: OpenAiChatClient = {
    async generate() {
      return {
        text: [
          "1. 簡短總結：這張牌比較像是在提醒你觀察關係失衡，而不是立刻下結論。[來源: cups-02#cups-02::逆位意義]",
          "2. 牌面/象徵解讀：聖杯二逆位常指向不平等、溝通不暢或分離感。[來源: cups-02#cups-02::逆位意義]",
          "3. 與問題的關聯：冷淡感可能與互動失衡有關，但目前資料不足以直接確認對方內心。[來源: cups-02#cups-02::逆位意義]",
          "4. 可反思的問題：你真正需要被回應的是什麼？[來源: cups-02#cups-02::逆位意義]",
          "5. 溫和行動建議：先觀察互動是否仍有雙向尊重，再決定是否進一步溝通。[來源: cups-02#cups-02::逆位意義]"
        ].join("\n"),
        model: "mock-model",
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30
        }
      };
    }
  };

  const service = createTarotAnswerService({
    loadIndex: async () => index,
    loadCache: async () => cache,
    loadGraph: async () => graph,
    client
  });

  const response = await service({
    question: "聖杯二逆位，對方最近很冷淡，這段關係還有希望嗎？",
    debug: true
  });

  assert.equal(typeof response.answer, "string");
  assert.ok(response.selectedSources.length > 0);
  assert.equal(response.safety.answerValid, true);
  assert.equal(typeof response.diagnostics, "object");
});

test("answer validator rejects fatalistic language", () => {
  const validation = validateTarotAnswer("你們命中注定一定會復合。[來源: cups-02#cups-02::逆位意義]");

  assert.equal(validation.valid, false);
  assert.ok(validation.errors.length > 0);
});

test("OpenAI chat client wrapper sends request and parses response", async () => {
  let requestBody = "";
  const client = new FetchOpenAiChatClient({
    apiKey: "test-key",
    fetchImpl: async (_url, init) => {
      requestBody = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          model: "gpt-4.1-mini",
          choices: [
            {
              message: {
                content: "測試回答"
              }
            }
          ],
          usage: {
            prompt_tokens: 11,
            completion_tokens: 22,
            total_tokens: 33
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }
  });

  const result = await client.generate([
    { role: "system", content: "SYSTEM" },
    { role: "user", content: "USER" }
  ]);

  assert.match(requestBody, /"model":"gpt-4.1-mini"/);
  assert.equal(result.text, "測試回答");
  assert.equal(result.usage?.totalTokens, 33);
});

test("OpenAI chat client normalizes malformed OPENAI_CHAT_MODEL env", async () => {
  let requestBody = "";
  const previousModel = process.env.OPENAI_CHAT_MODEL;
  process.env.OPENAI_CHAT_MODEL = "OPENAI_CHAT_MODEL=gpt-4.1-mini";

  try {
    const client = new FetchOpenAiChatClient({
      apiKey: "test-key",
      fetchImpl: async (_url, init) => {
        requestBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            model: "gpt-4.1-mini",
            choices: [
              {
                message: {
                  content: "測試回答"
                }
              }
            ]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }
    });

    await client.generate([
      { role: "system", content: "SYSTEM" },
      { role: "user", content: "USER" }
    ]);
  } finally {
    if (previousModel === undefined) {
      delete process.env.OPENAI_CHAT_MODEL;
    } else {
      process.env.OPENAI_CHAT_MODEL = previousModel;
    }
  }

  assert.match(requestBody, /"model":"gpt-4.1-mini"/);
});
