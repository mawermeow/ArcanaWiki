import { writeJsonFile } from "../persistence.ts";
import { searchWikiHybrid } from "../search-api.ts";

function parseArgs(argv: string[]) {
  const args = new Set(argv);
  const queryArg = argv.find((value) => value.startsWith("--query="));
  const topKArg = argv.find((value) => value.startsWith("--top-k="));
  const query = queryArg ? queryArg.slice("--query=".length) : argv.filter((value) => !value.startsWith("--")).join(" ").trim();
  return {
    query,
    topK: topKArg ? Number(topKArg.slice("--top-k=".length)) : 8,
    liveQueryEmbedding: args.has("--live-query-embedding")
  };
}

async function main(): Promise<void> {
  const { query, topK, liveQueryEmbedding } = parseArgs(process.argv.slice(2));
  if (!query) {
    throw new Error("Missing query. Use `pnpm search:hybrid -- \"聖杯二逆位 感情\"`.");
  }

  const response = await searchWikiHybrid(query, {
    topK,
    liveQueryEmbedding
  });
  await writeJsonFile("debug/retrieval/latest-hybrid-search.json", response);

  console.log(`# Hybrid Search`);
  console.log(`query: ${response.query}`);
  console.log(`topK: ${response.diagnostics.topK}`);
  console.log(`weights: bm25=${response.diagnostics.weights.bm25}, vector=${response.diagnostics.weights.vector}, graph=${response.diagnostics.weights.graph}`);
  console.log("");
  console.log("final results:");
  for (const [index, result] of response.results.entries()) {
    const graphExpansion = result.metadata.graphExpansion as Record<string, unknown> | undefined;
    console.log(
      `${index + 1}. ${result.pageId} :: ${result.sectionTitle} | final=${result.finalScore} | scores=${JSON.stringify(
        result.sourceScores
      )} | sources=${result.sources.join(",")}`
    );
    if (graphExpansion) {
      console.log(
        `   graph: from=${String(graphExpansion.fromPageId)} type=${String(graphExpansion.relationType)} reason=${String(graphExpansion.reason)}`
      );
    }
  }
  console.log("");
  console.log("diagnostics:");
  console.log(`- bm25 results: ${response.diagnostics.bm25Results.length}`);
  console.log(`- vector results: ${response.diagnostics.vectorResults.length}`);
  console.log(`- merged results: ${response.diagnostics.mergedResults.length}`);
  console.log(`- graph expanded results: ${response.diagnostics.graphExpandedResults.length}`);
  console.log(`- rejected results: ${response.diagnostics.rejectedResults.length}`);
  console.log(
    `- timingMs: bm25=${response.diagnostics.timingMs.bm25}, vector=${response.diagnostics.timingMs.vector}, merge=${response.diagnostics.timingMs.merge}, graph=${response.diagnostics.timingMs.graph}, total=${response.diagnostics.timingMs.total}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
