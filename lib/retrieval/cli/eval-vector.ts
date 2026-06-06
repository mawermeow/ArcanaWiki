import { runVectorEvaluation } from "../vector-evaluation.ts";

async function main(): Promise<void> {
  const report = await runVectorEvaluation({
    datasetPath: "eval/retrieval/bm25-evaluation-dataset.json",
    cachePath: "embeddings/vector-cache.json",
    reportPath: "reports/vector-eval.json",
    summaryPath: "reports/vector-summary.md",
    inspectorPath: "debug/retrieval/vector-eval-traces.json",
    liveQueryEmbedding: true
  });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
