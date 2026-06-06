import test from "node:test";
import assert from "node:assert/strict";

import { classifyFailureCauses } from "../../lib/retrieval-inspector/analysis.ts";
import {
  renderEvalInspectionMarkdown,
  renderQueryInspectionMarkdown
} from "../../lib/retrieval-inspector/report.ts";
import type {
  RetrievalEvalInspectionReport,
  RetrievalInspection
} from "../../lib/retrieval-inspector/types.ts";

function createInspection(overrides: Partial<RetrievalInspection> = {}): RetrievalInspection {
  return {
    query: "對方最近很冷淡",
    tokenizedQuery: ["對方", "最近", "很", "冷淡"],
    expected: {
      cards: ["major-18-moon"],
      topics: ["感情"],
      keywords: ["冷淡"]
    },
    bm25: {
      response: {
        query: "對方最近很冷淡",
        results: [],
        diagnostics: {
          tokenizedQuery: ["對方", "最近", "很", "冷淡"],
          rawScores: [],
          rejectedResults: [],
          topK: 5,
          averageScore: 0
        }
      },
      topResults: [],
      rejectedResults: [],
      hitStatus: {
        any: false,
        cardHit: false,
        topicHit: false,
        keywordHit: false,
        top1: false,
        top3: false,
        top5: false
      },
      diagnostics: {}
    },
    vector: {
      response: {
        query: "對方最近很冷淡",
        results: [],
        diagnostics: {
          queryEmbeddingModel: "",
          candidateCount: 0,
          rawScores: [],
          rejectedResults: [],
          topK: 5,
          minScore: 0
        }
      },
      available: false,
      mode: "disabled",
      topResults: [],
      rejectedResults: [],
      hitStatus: {
        any: false,
        cardHit: false,
        topicHit: false,
        keywordHit: false,
        top1: false,
        top3: false,
        top5: false
      },
      diagnostics: {}
    },
    hybrid: {
      response: {
        query: "對方最近很冷淡",
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
          topK: 5,
          timingMs: { bm25: 0, vector: 0, merge: 0, graph: 0, total: 0 },
          queryTokens: ["對方", "最近", "很", "冷淡"]
        }
      },
      topResults: [],
      graphExpandedResults: [],
      selectedChunksPreview: [],
      scoreBreakdown: [],
      rejectedResults: [],
      hitStatus: {
        any: false,
        cardHit: false,
        topicHit: false,
        keywordHit: false,
        top1: false,
        top3: false,
        top5: false
      },
      diagnostics: {}
    },
    analysis: {
      passed: false,
      failureCauses: ["unknown"],
      notes: ["Hybrid search returned no final results."]
    },
    ...overrides
  };
}

test("markdown report generation includes required retrieval sections", () => {
  const inspection = createInspection();
  const markdown = renderQueryInspectionMarkdown(inspection);

  assert.match(markdown, /# Retrieval Inspector Report/);
  assert.match(markdown, /## BM25 Top Results/);
  assert.match(markdown, /## Vector Top Results/);
  assert.match(markdown, /## Hybrid Final Results/);
  assert.match(markdown, /## Graph-expanded Results/);
  assert.match(markdown, /## Possible Issues/);
});

test("json report contract keeps query and analysis fields", () => {
  const inspection = createInspection();

  assert.equal(inspection.query, "對方最近很冷淡");
  assert.deepEqual(inspection.analysis.failureCauses, ["unknown"]);
  assert.equal(inspection.hybrid.response.query, "對方最近很冷淡");
});

test("failure cause classification detects missing wiki content", () => {
  const inspection = createInspection({
    analysis: {
      passed: false,
      failureCauses: [],
      notes: []
    }
  });

  const causes = classifyFailureCauses({
    inspection,
    expected: inspection.expected,
    documents: []
  });

  assert.ok(causes.includes("missing-wiki-content"));
});

test("empty result handling renders explicit no results markers", () => {
  const markdown = renderQueryInspectionMarkdown(createInspection());
  assert.match(markdown, /_No results\._/);
});

test("hybrid diagnostics rendering includes score breakdown section", () => {
  const inspection = createInspection({
    hybrid: {
      ...createInspection().hybrid,
      scoreBreakdown: [
        {
          pageId: "major-18-moon",
          chunkId: "major-18-moon::overview",
          source: "bm25",
          rawScore: 3.2,
          normalizedScore: 0.91
        }
      ]
    }
  });

  const markdown = renderQueryInspectionMarkdown(inspection);
  assert.match(markdown, /## Score Breakdown/);
  assert.match(markdown, /normalized=0.91/);
});

test("eval dataset aggregation markdown includes failure cases and per-query stats", () => {
  const inspection = createInspection();
  const report: RetrievalEvalInspectionReport = {
    generatedAt: "2026-06-06T00:00:00.000Z",
    datasetPath: "eval/retrieval/bm25-evaluation-dataset.json",
    vectorMode: "disabled",
    queryCount: 1,
    summary: {
      bm25: { top1: 0, top3: 0, top5: 0 },
      vector: { top1: 0, top3: 0, top5: 0 },
      hybrid: { top1: 0, top3: 0, top5: 0 }
    },
    failureCases: [
      {
        category: "感情問題",
        query: inspection.query,
        likelyCause: ["unknown"],
        notes: inspection.analysis.notes
      }
    ],
    queries: [
      {
        category: "感情問題",
        inspection,
        bm25: inspection.bm25.hitStatus,
        vector: inspection.vector.hitStatus,
        hybrid: inspection.hybrid.hitStatus,
        likelyCause: ["unknown"]
      }
    ]
  };

  const markdown = renderEvalInspectionMarkdown(report);
  assert.match(markdown, /## Failure Cases/);
  assert.match(markdown, /## Per Query/);
  assert.match(markdown, /bm25 hit: false/);
});
