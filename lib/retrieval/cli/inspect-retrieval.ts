import { writeSingleInspectionReport } from "../../retrieval-inspector/inspect-eval.ts";

function parseArgs(argv: string[]) {
  const args = new Set(argv);
  const queryArg = argv.find((value) => value.startsWith("--query="));
  const query = queryArg
    ? queryArg.slice("--query=".length)
    : argv.filter((value) => !value.startsWith("--")).join(" ").trim();

  return {
    query,
    vectorMode: args.has("--offline")
      ? "disabled"
      : args.has("--live-query-embedding")
        ? "live"
        : "auto"
  } as const;
}

async function main(): Promise<void> {
  const { query, vectorMode } = parseArgs(process.argv.slice(2));
  if (!query) {
    throw new Error("Missing query. Use `pnpm inspect:retrieval -- \"對方最近很冷淡\"`.");
  }

  await writeSingleInspectionReport({
    query,
    outputMarkdownPath: "reports/inspector/latest-query.md",
    outputJsonPath: "reports/inspector/latest-query.json",
    vectorMode
  });

  console.log("reports/inspector/latest-query.md");
  console.log("reports/inspector/latest-query.json");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
