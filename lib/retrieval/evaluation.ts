import { promises as fs } from "node:fs";

import { loadWikiPages } from "./wiki-loader.ts";
import { buildBm25Index } from "./bm25-builder.ts";
import { normalizeText } from "./normalizer.ts";
import { readBm25Index, writeJsonFile, writeTextFile } from "./persistence.ts";
import { searchWiki } from "./search-api.ts";
import type { BM25Index, EvaluationDataset, RetrievalDocument } from "./types.ts";

function createDocumentMap(index: BM25Index): Map<string, RetrievalDocument> {
  return new Map(index.documents.map((document) => [document.chunkId, document]));
}

function keywordCovered(keyword: string, documents: RetrievalDocument[]): boolean {
  const normalizedKeyword = normalizeText(keyword).toLowerCase();
  return documents.some((document) =>
    document.searchableText.toLowerCase().includes(normalizedKeyword)
  );
}

function topicCovered(topic: string, documents: RetrievalDocument[]): boolean {
  return documents.some((document) => document.topics.includes(topic));
}

export async function ensureBm25Index(indexPath: string): Promise<BM25Index> {
  try {
    return await readBm25Index(indexPath);
  } catch {
    const pages = await loadWikiPages("wiki");
    return buildBm25Index(pages);
  }
}

export async function runBm25Evaluation(options: {
  datasetPath: string;
  indexPath: string;
  reportPath: string;
  summaryPath: string;
  inspectorPath: string;
}): Promise<unknown> {
  const index = await ensureBm25Index(options.indexPath);
  const dataset = JSON.parse(
    await fs.readFile(options.datasetPath, "utf8")
  ) as EvaluationDataset;
  const documentMap = createDocumentMap(index);

  const categorySummaries: Record<string, unknown> = {};
  const traces: unknown[] = [];

  let totalQueries = 0;
  let totalTop1Hits = 0;
  let totalTop3Recall = 0;
  let totalKeywordRecall = 0;
  let totalTopicRecall = 0;

  for (const [category, entries] of Object.entries(dataset.categories)) {
    const querySummaries: unknown[] = [];
    let categoryTop1Hits = 0;
    let categoryTop3Recall = 0;
    let categoryKeywordRecall = 0;
    let categoryTopicRecall = 0;

    for (const entry of entries) {
      totalQueries += 1;
      const response = await searchWiki(entry.query, {
        index,
        topK: 3
      });

      const topResults = response.results;
      const topDocuments = topResults
        .map((result) => documentMap.get(result.chunkId))
        .filter((document): document is RetrievalDocument => document !== undefined);

      const topPageIds = Array.from(new Set(topResults.map((result) => result.pageId)));
      const top1Hit = topResults.length > 0 && entry.expected_cards.includes(topResults[0].pageId);
      const top3CardHits = topPageIds.filter((pageId) => entry.expected_cards.includes(pageId)).length;
      const top3Recall = top3CardHits / (entry.expected_cards.length || 1);
      const keywordHits = entry.expected_keywords.filter((keyword) => keywordCovered(keyword, topDocuments)).length;
      const keywordRecall = keywordHits / (entry.expected_keywords.length || 1);
      const topicHits = entry.expected_topics.filter((topic) => topicCovered(topic, topDocuments)).length;
      const topicRecall = topicHits / (entry.expected_topics.length || 1);

      if (top1Hit) {
        totalTop1Hits += 1;
        categoryTop1Hits += 1;
      }
      totalTop3Recall += top3Recall;
      totalKeywordRecall += keywordRecall;
      totalTopicRecall += topicRecall;
      categoryTop3Recall += top3Recall;
      categoryKeywordRecall += keywordRecall;
      categoryTopicRecall += topicRecall;

      const summary = {
        query: entry.query,
        expectedCards: entry.expected_cards,
        expectedTopics: entry.expected_topics,
        expectedKeywords: entry.expected_keywords,
        top1Hit,
        top3Recall: Number(top3Recall.toFixed(4)),
        keywordRecall: Number(keywordRecall.toFixed(4)),
        topicRecall: Number(topicRecall.toFixed(4)),
        topResults
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
      averageKeywordRecall: Number((categoryKeywordRecall / entries.length).toFixed(4)),
      averageTopicRecall: Number((categoryTopicRecall / entries.length).toFixed(4)),
      queries: querySummaries
    };
  }

  const report = {
    datasetPath: options.datasetPath,
    metrics: {
      queryCount: totalQueries,
      top1HitRate: Number((totalTop1Hits / (totalQueries || 1)).toFixed(4)),
      averageTop3Recall: Number((totalTop3Recall / (totalQueries || 1)).toFixed(4)),
      averageKeywordRecall: Number((totalKeywordRecall / (totalQueries || 1)).toFixed(4)),
      averageTopicRecall: Number((totalTopicRecall / (totalQueries || 1)).toFixed(4))
    },
    categories: categorySummaries
  };

  const summary = [
    "# BM25 Evaluation Summary",
    "",
    `- Dataset: \`${options.datasetPath}\``,
    `- Queries: ${totalQueries}`,
    `- Top1 Hit Rate: ${report.metrics.top1HitRate}`,
    `- Average Top3 Recall: ${report.metrics.averageTop3Recall}`,
    `- Average Keyword Recall: ${report.metrics.averageKeywordRecall}`,
    `- Average Topic Recall: ${report.metrics.averageTopicRecall}`,
    "",
    "## Categories",
    ...Object.entries(categorySummaries).map(
      ([category, metrics]) =>
        `- ${category}: top1=${(metrics as { top1HitRate: number }).top1HitRate}, top3=${(metrics as { averageTop3Recall: number }).averageTop3Recall}, keyword=${(metrics as { averageKeywordRecall: number }).averageKeywordRecall}, topic=${(metrics as { averageTopicRecall: number }).averageTopicRecall}`
    )
  ].join("\n");

  await writeJsonFile(options.reportPath, report);
  await writeTextFile(options.summaryPath, `${summary}\n`);
  await writeJsonFile(options.inspectorPath, traces);

  return report;
}
