import { promises as fs } from "node:fs";

import { normalizeText } from "./normalizer.ts";
import { readBm25Index, readVectorCache, writeJsonFile, writeTextFile } from "./persistence.ts";
import { readRelationGraph } from "./graph-loader.ts";
import { searchWikiHybrid } from "./search-api.ts";
import type { EvaluationDataset, HybridSearchResult } from "./types.ts";

function cardCovered(cardId: string, results: HybridSearchResult[]): boolean {
  return results.some((result) => result.pageId === cardId);
}

function topicCovered(topic: string, results: HybridSearchResult[]): boolean {
  return results.some((result) => {
    const topics = result.metadata.topics;
    return Array.isArray(topics) && topics.includes(topic);
  });
}

function keywordCovered(keyword: string, results: HybridSearchResult[]): boolean {
  const normalizedKeyword = normalizeText(keyword).toLowerCase();
  return results.some((result) => {
    const haystacks = [
      result.title,
      result.sectionTitle,
      ...(Array.isArray(result.matchedTerms) ? result.matchedTerms : []),
      ...(Array.isArray(result.metadata.tags) ? result.metadata.tags : []),
      ...(Array.isArray(result.metadata.topics) ? result.metadata.topics : []),
      ...(Array.isArray(result.metadata.keywords) ? result.metadata.keywords : [])
    ]
      .map((value) => normalizeText(String(value)).toLowerCase())
      .filter(Boolean);
    return haystacks.some((value) => value.includes(normalizedKeyword));
  });
}

async function readOptionalJson(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function runHybridEvaluation(options: {
  datasetPath: string;
  indexPath: string;
  cachePath: string;
  graphPath: string;
  reportPath: string;
  summaryPath: string;
  inspectorPath: string;
  liveQueryEmbedding?: boolean;
  queryVectorByQuery?: Record<string, number[]>;
  embedQuery?: (text: string, model: string) => Promise<number[]>;
}): Promise<unknown> {
  const [index, cache, graph] = await Promise.all([
    readBm25Index(options.indexPath),
    readVectorCache(options.cachePath),
    readRelationGraph(options.graphPath)
  ]);
  const dataset = JSON.parse(await fs.readFile(options.datasetPath, "utf8")) as EvaluationDataset;

  const categorySummaries: Record<string, unknown> = {};
  const traces: unknown[] = [];
  let totalQueries = 0;
  let totalTop1Hits = 0;
  let totalTop3Recall = 0;
  let totalTop5Recall = 0;
  let totalCardRecall = 0;
  let totalTopicRecall = 0;
  let totalKeywordRecall = 0;

  for (const [category, entries] of Object.entries(dataset.categories)) {
    let categoryTop1Hits = 0;
    let categoryTop3Recall = 0;
    let categoryTop5Recall = 0;
    let categoryCardRecall = 0;
    let categoryTopicRecall = 0;
    let categoryKeywordRecall = 0;
    const querySummaries: unknown[] = [];

    for (const entry of entries) {
      totalQueries += 1;
      const response = await searchWikiHybrid(entry.query, {
        index,
        cache,
        graph,
        topK: 5,
        liveQueryEmbedding: options.liveQueryEmbedding,
        queryVector: options.queryVectorByQuery?.[entry.query],
        embedQuery: options.embedQuery
      });

      const top1Hit = response.results.length > 0 && entry.expected_cards.includes(response.results[0].pageId);
      const top3Recall =
        entry.expected_cards.filter((cardId) => cardCovered(cardId, response.results.slice(0, 3))).length /
        (entry.expected_cards.length || 1);
      const top5Recall =
        entry.expected_cards.filter((cardId) => cardCovered(cardId, response.results.slice(0, 5))).length /
        (entry.expected_cards.length || 1);
      const cardRecall =
        entry.expected_cards.filter((cardId) => cardCovered(cardId, response.results)).length /
        (entry.expected_cards.length || 1);
      const topicRecall =
        entry.expected_topics.filter((topic) => topicCovered(topic, response.results)).length /
        (entry.expected_topics.length || 1);
      const keywordRecall =
        entry.expected_keywords.filter((keyword) => keywordCovered(keyword, response.results)).length /
        (entry.expected_keywords.length || 1);

      if (top1Hit) {
        totalTop1Hits += 1;
        categoryTop1Hits += 1;
      }

      totalTop3Recall += top3Recall;
      totalTop5Recall += top5Recall;
      totalCardRecall += cardRecall;
      totalTopicRecall += topicRecall;
      totalKeywordRecall += keywordRecall;

      categoryTop3Recall += top3Recall;
      categoryTop5Recall += top5Recall;
      categoryCardRecall += cardRecall;
      categoryTopicRecall += topicRecall;
      categoryKeywordRecall += keywordRecall;

      const summary = {
        query: entry.query,
        expectedCards: entry.expected_cards,
        expectedTopics: entry.expected_topics,
        expectedKeywords: entry.expected_keywords,
        top1Hit,
        top3Recall: Number(top3Recall.toFixed(4)),
        top5Recall: Number(top5Recall.toFixed(4)),
        cardRecall: Number(cardRecall.toFixed(4)),
        topicRecall: Number(topicRecall.toFixed(4)),
        keywordRecall: Number(keywordRecall.toFixed(4)),
        topResults: response.results
      };

      querySummaries.push(summary);
      traces.push({
        category,
        ...summary,
        diagnostics: response.diagnostics
      });
    }

    categorySummaries[category] = {
      queryCount: entries.length,
      top1HitRate: Number((categoryTop1Hits / entries.length).toFixed(4)),
      averageTop3Recall: Number((categoryTop3Recall / entries.length).toFixed(4)),
      averageTop5Recall: Number((categoryTop5Recall / entries.length).toFixed(4)),
      averageCardRecall: Number((categoryCardRecall / entries.length).toFixed(4)),
      averageTopicRecall: Number((categoryTopicRecall / entries.length).toFixed(4)),
      averageKeywordRecall: Number((categoryKeywordRecall / entries.length).toFixed(4)),
      queries: querySummaries
    };
  }

  const comparisons = {
    bm25: await readOptionalJson("reports/bm25-eval.json"),
    vector: await readOptionalJson("reports/vector-eval.json")
  };
  const bm25Metrics = reportMetrics(comparisons.bm25);
  const vectorMetrics = reportMetrics(comparisons.vector);

  const report = {
    datasetPath: options.datasetPath,
    embeddingModel: cache.embeddingModel,
    evaluationMode: options.liveQueryEmbedding ? "hybrid_with_live_query_embeddings" : "hybrid_offline_bm25_plus_graph",
    metrics: {
      queryCount: totalQueries,
      top1HitRate: Number((totalTop1Hits / (totalQueries || 1)).toFixed(4)),
      averageTop3Recall: Number((totalTop3Recall / (totalQueries || 1)).toFixed(4)),
      averageTop5Recall: Number((totalTop5Recall / (totalQueries || 1)).toFixed(4)),
      averageCardRecall: Number((totalCardRecall / (totalQueries || 1)).toFixed(4)),
      averageTopicRecall: Number((totalTopicRecall / (totalQueries || 1)).toFixed(4)),
      averageKeywordRecall: Number((totalKeywordRecall / (totalQueries || 1)).toFixed(4))
    },
    comparedAgainst: {
      bm25: bm25Metrics
        ? {
            top1HitRateDelta: 0,
            averageTop3RecallDelta: 0,
            averageTopicRecallDelta: 0,
            averageKeywordRecallDelta: 0
          }
        : null,
      vector: vectorMetrics
        ? {
            top1HitRateDelta: 0,
            averageTop3RecallDelta: 0,
            averageTop5RecallDelta: 0,
            averageCardRecallDelta: 0,
            averageTopicRecallDelta: 0
          }
        : null
    },
    categories: categorySummaries
  };

  report.comparedAgainst.bm25 = bm25Metrics
    ? {
        top1HitRateDelta: Number((report.metrics.top1HitRate - bm25Metrics.top1HitRate).toFixed(4)),
        averageTop3RecallDelta: Number((report.metrics.averageTop3Recall - bm25Metrics.averageTop3Recall).toFixed(4)),
        averageTopicRecallDelta: Number((report.metrics.averageTopicRecall - bm25Metrics.averageTopicRecall).toFixed(4)),
        averageKeywordRecallDelta: Number((report.metrics.averageKeywordRecall - bm25Metrics.averageKeywordRecall).toFixed(4))
      }
    : null;
  report.comparedAgainst.vector = vectorMetrics
    ? {
        top1HitRateDelta: Number((report.metrics.top1HitRate - vectorMetrics.top1HitRate).toFixed(4)),
        averageTop3RecallDelta: Number((report.metrics.averageTop3Recall - vectorMetrics.averageTop3Recall).toFixed(4)),
        averageTop5RecallDelta: Number((report.metrics.averageTop5Recall - vectorMetrics.averageTop5Recall).toFixed(4)),
        averageCardRecallDelta: Number((report.metrics.averageCardRecall - vectorMetrics.averageCardRecall).toFixed(4)),
        averageTopicRecallDelta: Number((report.metrics.averageTopicRecall - vectorMetrics.averageTopicRecall).toFixed(4))
      }
    : null;

  const summary = [
    "# Hybrid Evaluation Summary",
    "",
    `- Dataset: \`${options.datasetPath}\``,
    `- Embedding Model: ${cache.embeddingModel}`,
    `- Mode: ${report.evaluationMode}`,
    `- Queries: ${totalQueries}`,
    `- Top1 Hit Rate: ${report.metrics.top1HitRate}`,
    `- Average Top3 Recall: ${report.metrics.averageTop3Recall}`,
    `- Average Top5 Recall: ${report.metrics.averageTop5Recall}`,
    `- Average Card Recall: ${report.metrics.averageCardRecall}`,
    `- Average Topic Recall: ${report.metrics.averageTopicRecall}`,
    `- Average Keyword Recall: ${report.metrics.averageKeywordRecall}`,
    "",
    "## Comparisons",
    report.comparedAgainst.bm25
      ? `- vs BM25: top1=${report.comparedAgainst.bm25.top1HitRateDelta}, top3=${report.comparedAgainst.bm25.averageTop3RecallDelta}, topic=${report.comparedAgainst.bm25.averageTopicRecallDelta}, keyword=${report.comparedAgainst.bm25.averageKeywordRecallDelta}`
      : "- vs BM25: unavailable",
    report.comparedAgainst.vector
      ? `- vs Vector: top1=${report.comparedAgainst.vector.top1HitRateDelta}, top3=${report.comparedAgainst.vector.averageTop3RecallDelta}, top5=${report.comparedAgainst.vector.averageTop5RecallDelta}, card=${report.comparedAgainst.vector.averageCardRecallDelta}, topic=${report.comparedAgainst.vector.averageTopicRecallDelta}`
      : "- vs Vector: unavailable",
    "",
    "## Categories",
    ...Object.entries(categorySummaries).map(
      ([category, metrics]) =>
        `- ${category}: top1=${(metrics as { top1HitRate: number }).top1HitRate}, top3=${(metrics as { averageTop3Recall: number }).averageTop3Recall}, top5=${(metrics as { averageTop5Recall: number }).averageTop5Recall}, card=${(metrics as { averageCardRecall: number }).averageCardRecall}, topic=${(metrics as { averageTopicRecall: number }).averageTopicRecall}, keyword=${(metrics as { averageKeywordRecall: number }).averageKeywordRecall}`
    )
  ].join("\n");

  await writeJsonFile(options.reportPath, report);
  await writeTextFile(options.summaryPath, `${summary}\n`);
  await writeJsonFile(options.inspectorPath, traces);
  return report;
}

function reportMetrics(report: Record<string, unknown> | null): Record<string, number> | null {
  if (!report || typeof report !== "object" || !report.metrics || typeof report.metrics !== "object") {
    return null;
  }

  const metrics = report.metrics as Record<string, unknown>;
  const parseMetric = (key: string) => Number(metrics[key] ?? 0);

  return {
    top1HitRate: parseMetric("top1HitRate"),
    averageTop3Recall: parseMetric("averageTop3Recall"),
    averageTop5Recall: parseMetric("averageTop5Recall"),
    averageCardRecall: parseMetric("averageCardRecall"),
    averageTopicRecall: parseMetric("averageTopicRecall"),
    averageKeywordRecall: parseMetric("averageKeywordRecall")
  };
}
