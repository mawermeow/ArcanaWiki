import { runRetrievalEvalInspection } from "../../retrieval-inspector/inspect-eval.ts";

function parseArgs(argv: string[]) {
  const args = new Set(argv);
  return {
    vectorMode: args.has("--offline")
      ? "disabled"
      : args.has("--live-query-embedding")
        ? "live"
        : "auto"
  } as const;
}

async function main(): Promise<void> {
  const { vectorMode } = parseArgs(process.argv.slice(2));
  await runRetrievalEvalInspection({
    outputMarkdownPath: "reports/inspector/retrieval-eval-inspection.md",
    outputJsonPath: "reports/inspector/retrieval-eval-inspection.json",
    vectorMode
  });

  console.log("reports/inspector/retrieval-eval-inspection.md");
  console.log("reports/inspector/retrieval-eval-inspection.json");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
