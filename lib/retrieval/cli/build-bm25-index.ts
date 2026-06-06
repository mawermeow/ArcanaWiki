import { buildBm25Index } from "../bm25-builder.ts";
import { writeBm25Index } from "../persistence.ts";
import { loadWikiPages } from "../wiki-loader.ts";

async function main(): Promise<void> {
  const pages = await loadWikiPages("wiki");
  const index = buildBm25Index(pages);
  await writeBm25Index("embeddings/bm25-index.json", index);
  console.log(
    JSON.stringify(
      {
        documents: index.metadata.documentCount,
        pages: index.metadata.pageCount,
        terms: index.metadata.termCount,
        averageDocumentLength: Number(index.averageDocumentLength.toFixed(4))
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
