import { runHybridEvaluation } from "../hybrid-evaluation.ts";

function parseArgs(argv: string[]) {
  const args = new Set(argv);
  return {
    liveQueryEmbedding: args.has("--live-query-embedding")
  };
}

async function main(): Promise<void> {
  const { liveQueryEmbedding } = parseArgs(process.argv.slice(2));
  const report = await runHybridEvaluation({
    datasetPath: "eval/retrieval/bm25-evaluation-dataset.json",
    indexPath: "embeddings/bm25-index.json",
    cachePath: "embeddings/vector-cache.json",
    graphPath: "relations/graph.json",
    reportPath: "reports/hybrid-eval.json",
    summaryPath: "reports/hybrid-summary.md",
    inspectorPath: "debug/retrieval/hybrid-eval-traces.json",
    liveQueryEmbedding
  });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
