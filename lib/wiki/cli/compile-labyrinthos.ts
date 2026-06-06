import fs from "node:fs/promises";

import { compileLabyrinthosCard } from "../compile-labyrinthos.ts";

type Manifest = {
  entries: Array<{
    name: string;
    link: string;
    slug: string;
    sourceUrl: string;
    rawFile: string;
    status: string;
  }>;
};

function parseArgs(argv: string[]): { from?: number; to?: number } {
  let from: number | undefined;
  let to: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--from") {
      from = Number(argv[index + 1]);
      index += 1;
    }
    if (argv[index] === "--to") {
      to = Number(argv[index + 1]);
      index += 1;
    }
  }

  return { from, to };
}

async function main(): Promise<void> {
  const { from, to } = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(
    await fs.readFile("raw/tarot/labyrinthos-manifest.json", "utf8")
  ) as Manifest;

  const entries = manifest.entries.filter((entry) => entry.status === "ok");
  const slice = entries.slice(from ?? 0, to);
  const updated: string[] = [];
  const errors: Array<{ name: string; error: string }> = [];

  for (const entry of slice) {
    try {
      const cardId = await compileLabyrinthosCard(entry);
      updated.push(cardId);
      console.log(`compiled ${cardId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ name: entry.name, error: message });
      console.error(`error ${entry.name}: ${message}`);
    }
  }

  console.log(JSON.stringify({ compiled: updated.length, errors }, null, 2));
  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
