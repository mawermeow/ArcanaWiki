import { runHybridEvaluation } from "../hybrid-evaluation.ts";

async function main(): Promise<void> {
  const report = await runHybridEvaluation({
    datasetPath: "eval/retrieval/bm25-evaluation-dataset.json",
    indexPath: "embeddings/bm25-index.json",
    cachePath: "embeddings/vector-cache.json",
    graphPath: "relations/graph.json",
    reportPath: "reports/hybrid-eval.json",
    summaryPath: "reports/hybrid-summary.md",
    inspectorPath: "debug/retrieval/hybrid-eval-traces.json",
    liveQueryEmbedding: true
  });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
