import { promises as fs } from "node:fs";

import type { EvaluationDataset } from "../retrieval/types.ts";
import { readBm25Index, readVectorCache, writeJsonFile, writeTextFile } from "../retrieval/persistence.ts";
import { readRelationGraph } from "../retrieval/graph-loader.ts";
import { inspectRetrievalQuery } from "./inspect-query.ts";
import { renderEvalInspectionMarkdown, renderQueryInspectionMarkdown } from "./report.ts";
import type { RetrievalEvalInspectionReport } from "./types.ts";

const DEFAULT_DATASET_PATH = "eval/retrieval/bm25-evaluation-dataset.json";
const DEFAULT_INDEX_PATH = "embeddings/bm25-index.json";
const DEFAULT_VECTOR_CACHE_PATH = "embeddings/vector-cache.json";
const DEFAULT_GRAPH_PATH = "relations/graph.json";

function countHits(values: boolean[]): number {
  return values.filter(Boolean).length;
}

export async function writeSingleInspectionReport(options: {
  query: string;
  outputMarkdownPath: string;
  outputJsonPath: string;
  vectorMode?: "auto" | "live" | "disabled";
}): Promise<void> {
  const inspection = await inspectRetrievalQuery({
    query: options.query,
    vectorMode: options.vectorMode
  });

  await writeTextFile(options.outputMarkdownPath, renderQueryInspectionMarkdown(inspection));
  await writeJsonFile(options.outputJsonPath, inspection);
}

export async function runRetrievalEvalInspection(options: {
  datasetPath?: string;
  indexPath?: string;
  cachePath?: string;
  graphPath?: string;
  outputMarkdownPath: string;
  outputJsonPath: string;
  vectorMode?: "auto" | "live" | "disabled";
}): Promise<RetrievalEvalInspectionReport> {
  const datasetPath = options.datasetPath ?? DEFAULT_DATASET_PATH;
  const [index, cache, graph, rawDataset] = await Promise.all([
    readBm25Index(options.indexPath ?? DEFAULT_INDEX_PATH),
    readVectorCache(options.cachePath ?? DEFAULT_VECTOR_CACHE_PATH),
    readRelationGraph(options.graphPath ?? DEFAULT_GRAPH_PATH),
    fs.readFile(datasetPath, "utf8")
  ]);
  const dataset = JSON.parse(rawDataset) as EvaluationDataset;
  const queries = [];

  for (const [category, entries] of Object.entries(dataset.categories)) {
    for (const entry of entries) {
      const inspection = await inspectRetrievalQuery({
        query: entry.query,
        expected: {
          cards: entry.expected_cards,
          topics: entry.expected_topics,
          keywords: entry.expected_keywords
        },
        index,
        cache,
        graph,
        vectorMode: options.vectorMode ?? "auto",
        topK: 5
      });

      queries.push({
        category,
        inspection,
        bm25: inspection.bm25.hitStatus,
        vector: inspection.vector.hitStatus,
        hybrid: inspection.hybrid.hitStatus,
        likelyCause: inspection.analysis.failureCauses
      });
    }
  }

  const report: RetrievalEvalInspectionReport = {
    generatedAt: new Date().toISOString(),
    datasetPath,
    vectorMode: options.vectorMode ?? "auto",
    queryCount: queries.length,
    summary: {
      bm25: {
        top1: countHits(queries.map((entry) => entry.bm25.top1)),
        top3: countHits(queries.map((entry) => entry.bm25.top3)),
        top5: countHits(queries.map((entry) => entry.bm25.top5))
      },
      vector: {
        top1: countHits(queries.map((entry) => entry.vector.top1)),
        top3: countHits(queries.map((entry) => entry.vector.top3)),
        top5: countHits(queries.map((entry) => entry.vector.top5))
      },
      hybrid: {
        top1: countHits(queries.map((entry) => entry.hybrid.top1)),
        top3: countHits(queries.map((entry) => entry.hybrid.top3)),
        top5: countHits(queries.map((entry) => entry.hybrid.top5))
      }
    },
    failureCases: queries
      .filter((entry) => !entry.hybrid.top5)
      .map((entry) => ({
        category: entry.category,
        query: entry.inspection.query,
        likelyCause: entry.likelyCause,
        notes: entry.inspection.analysis.notes
      })),
    queries
  };

  await writeTextFile(options.outputMarkdownPath, renderEvalInspectionMarkdown(report));
  await writeJsonFile(options.outputJsonPath, report);
  return report;
}
