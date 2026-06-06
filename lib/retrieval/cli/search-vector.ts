import { writeJsonFile } from "../persistence.ts";
import { searchWikiVector } from "../vector-search-api.ts";

function parseArgs(argv: string[]) {
  const args = new Set(argv);
  const queryArg = argv.find((value) => value.startsWith("--query="));
  const query = queryArg ? queryArg.slice("--query=".length) : argv.filter((value) => !value.startsWith("--")).join(" ").trim();
  return {
    query,
    liveQueryEmbedding: args.has("--live-query-embedding")
  };
}

async function main(): Promise<void> {
  const { query, liveQueryEmbedding } = parseArgs(process.argv.slice(2));
  if (!query) {
    throw new Error("Missing query. Use `pnpm search:vector -- --query=\"對方最近很冷淡\" --live-query-embedding`.");
  }
  const response = await searchWikiVector(query, {
    topK: 8,
    liveQueryEmbedding
  });
  await writeJsonFile("debug/retrieval/latest-vector-search.json", response);
  console.log(JSON.stringify(response, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
