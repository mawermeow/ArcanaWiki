import { writeJsonFile } from "../persistence.ts";
import { searchWiki } from "../search-api.ts";

function getQueryFromArgv(argv: string[]): string {
  const queryArg = argv.find((value) => value.startsWith("--query="));
  if (queryArg) {
    return queryArg.slice("--query=".length);
  }
  return argv.join(" ").trim();
}

async function main(): Promise<void> {
  const query = getQueryFromArgv(process.argv.slice(2));
  if (!query) {
    throw new Error("Missing query. Use `pnpm search:bm25 -- --query=聖杯二逆位`.");
  }

  const response = await searchWiki(query, { topK: 8 });
  await writeJsonFile("debug/retrieval/latest-search.json", response);
  console.log(JSON.stringify(response, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
