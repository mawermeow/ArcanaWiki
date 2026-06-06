import { answerTarotQuestion } from "../index.ts";

function parseArgs(argv: string[]) {
  const args = new Set(argv);
  const question = argv.filter((value) => !value.startsWith("--")).join(" ").trim();

  return {
    question,
    debug: args.has("--debug")
  };
}

async function main(): Promise<void> {
  const { question, debug } = parseArgs(process.argv.slice(2));
  if (!question) {
    throw new Error("Missing question. Use `pnpm answer -- \"聖杯二逆位，對方最近很冷淡，這段關係還有希望嗎？\"`.");
  }

  const response = await answerTarotQuestion({
    question,
    debug
  });

  console.log("# Tarot Answer");
  console.log("");
  console.log(response.answer);
  console.log("");
  console.log("selected sources:");
  for (const source of response.selectedSources) {
    console.log(`- ${source.pageId}#${source.chunkId} | ${source.title}${source.sectionTitle ? ` | ${source.sectionTitle}` : ""}`);
  }
  console.log("");
  console.log("safety:");
  console.log(`- answerValid: ${response.safety.answerValid}`);
  console.log(`- cannotConfirmReason: ${response.safety.cannotConfirmReason ?? ""}`);
  console.log(`- citationErrors: ${response.safety.citationErrors.length}`);

  if (debug) {
    console.log("");
    console.log("diagnostics:");
    console.log(JSON.stringify(response.diagnostics, null, 2));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
