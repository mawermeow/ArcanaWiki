import { runBm25Evaluation } from "../evaluation.ts";

async function main(): Promise<void> {
  const report = await runBm25Evaluation({
    datasetPath: "eval/retrieval/bm25-evaluation-dataset.json",
    indexPath: "embeddings/bm25-index.json",
    reportPath: "reports/bm25-eval.json",
    summaryPath: "reports/bm25-summary.md",
    inspectorPath: "debug/retrieval/eval-traces.json"
  });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
