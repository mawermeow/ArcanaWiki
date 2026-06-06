import { promises as fs } from "node:fs";

import { readVectorCache, writeJsonFile, writeTextFile } from "./persistence.ts";
import { searchWikiVector } from "./vector-search-api.ts";
import type { EvaluationDataset, VectorCache, VectorSearchResult } from "./types.ts";

function topicCovered(topic: string, results: VectorSearchResult[]): boolean {
  return results.some((result) => Array.isArray(result.metadata?.topics) && result.metadata.topics.includes(topic));
}

function cardCovered(cardId: string, results: VectorSearchResult[]): boolean {
  return results.some((result) => result.pageId === cardId);
}

export async function runVectorEvaluation(options: {
  datasetPath: string;
  cachePath: string;
  reportPath: string;
  summaryPath: string;
  inspectorPath: string;
  liveQueryEmbedding?: boolean;
  embedQuery?: (text: string, model: string) => Promise<number[]>;
}): Promise<unknown> {
  const cache = await readVectorCache(options.cachePath);
  const dataset = JSON.parse(await fs.readFile(options.datasetPath, "utf8")) as EvaluationDataset;

  const categorySummaries: Record<string, unknown> = {};
  const traces: unknown[] = [];
  let totalQueries = 0;
  let totalTop1Hits = 0;
  let totalTop3Recall = 0;
  let totalTop5Recall = 0;
  let totalTopicRecall = 0;
  let totalCardRecall = 0;

  for (const [category, entries] of Object.entries(dataset.categories)) {
    const querySummaries: unknown[] = [];
    let categoryTop1Hits = 0;
    let categoryTop3Recall = 0;
    let categoryTop5Recall = 0;
    let categoryTopicRecall = 0;
    let categoryCardRecall = 0;

    for (const entry of entries) {
      totalQueries += 1;
      const response = await searchWikiVector(entry.query, {
        cache,
        topK: 5,
        liveQueryEmbedding: options.liveQueryEmbedding,
        embedQuery: options.embedQuery
      });

      const top1Hit = response.results.length > 0 && entry.expected_cards.includes(response.results[0].pageId);
      const top3Recall =
        entry.expected_cards.filter((cardId) => cardCovered(cardId, response.results.slice(0, 3))).length /
        (entry.expected_cards.length || 1);
      const top5Recall =
        entry.expected_cards.filter((cardId) => cardCovered(cardId, response.results.slice(0, 5))).length /
        (entry.expected_cards.length || 1);
      const topicRecall =
        entry.expected_topics.filter((topic) => topicCovered(topic, response.results)).length /
        (entry.expected_topics.length || 1);
      const cardRecall =
        entry.expected_cards.filter((cardId) => cardCovered(cardId, response.results)).length /
        (entry.expected_cards.length || 1);

      if (top1Hit) {
        totalTop1Hits += 1;
        categoryTop1Hits += 1;
      }
      totalTop3Recall += top3Recall;
      totalTop5Recall += top5Recall;
      totalTopicRecall += topicRecall;
      totalCardRecall += cardRecall;
      categoryTop3Recall += top3Recall;
      categoryTop5Recall += top5Recall;
      categoryTopicRecall += topicRecall;
      categoryCardRecall += cardRecall;

      const summary = {
        query: entry.query,
        expectedCards: entry.expected_cards,
        expectedTopics: entry.expected_topics,
        top1Hit,
        top3Recall: Number(top3Recall.toFixed(4)),
        top5Recall: Number(top5Recall.toFixed(4)),
        topicRecall: Number(topicRecall.toFixed(4)),
        cardRecall: Number(cardRecall.toFixed(4)),
        topResults: response.results
      };
      querySummaries.push(summary);
      traces.push({ category, ...summary, diagnostics: response.diagnostics });
    }

    categorySummaries[category] = {
      queryCount: entries.length,
      top1HitRate: Number((categoryTop1Hits / entries.length).toFixed(4)),
      averageTop3Recall: Number((categoryTop3Recall / entries.length).toFixed(4)),
      averageTop5Recall: Number((categoryTop5Recall / entries.length).toFixed(4)),
      averageTopicRecall: Number((categoryTopicRecall / entries.length).toFixed(4)),
      averageCardRecall: Number((categoryCardRecall / entries.length).toFixed(4)),
      queries: querySummaries
    };
  }

  const report = {
    datasetPath: options.datasetPath,
    embeddingModel: cache.embeddingModel,
    metrics: {
      queryCount: totalQueries,
      top1HitRate: Number((totalTop1Hits / (totalQueries || 1)).toFixed(4)),
      averageTop3Recall: Number((totalTop3Recall / (totalQueries || 1)).toFixed(4)),
      averageTop5Recall: Number((totalTop5Recall / (totalQueries || 1)).toFixed(4)),
      averageTopicRecall: Number((totalTopicRecall / (totalQueries || 1)).toFixed(4)),
      averageCardRecall: Number((totalCardRecall / (totalQueries || 1)).toFixed(4))
    },
    categories: categorySummaries
  };

  const summary = [
    "# Vector Evaluation Summary",
    "",
    `- Dataset: \`${options.datasetPath}\``,
    `- Embedding Model: ${cache.embeddingModel}`,
    `- Queries: ${totalQueries}`,
    `- Top1 Hit Rate: ${report.metrics.top1HitRate}`,
    `- Average Top3 Recall: ${report.metrics.averageTop3Recall}`,
    `- Average Top5 Recall: ${report.metrics.averageTop5Recall}`,
    `- Average Topic Recall: ${report.metrics.averageTopicRecall}`,
    `- Average Card Recall: ${report.metrics.averageCardRecall}`,
    "",
    "## Categories",
    ...Object.entries(categorySummaries).map(
      ([category, metrics]) =>
        `- ${category}: top1=${(metrics as { top1HitRate: number }).top1HitRate}, top3=${(metrics as { averageTop3Recall: number }).averageTop3Recall}, top5=${(metrics as { averageTop5Recall: number }).averageTop5Recall}, topic=${(metrics as { averageTopicRecall: number }).averageTopicRecall}, card=${(metrics as { averageCardRecall: number }).averageCardRecall}`
    )
  ].join("\n");

  await writeJsonFile(options.reportPath, report);
  await writeTextFile(options.summaryPath, `${summary}\n`);
  await writeJsonFile(options.inspectorPath, traces);
  return report;
}
