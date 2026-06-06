import { buildBm25Index, createRetrievalDocuments } from "../bm25-builder.ts";
import { OpenAiEmbeddingClient } from "../embedding-client.ts";
import { loadWikiPages } from "../wiki-loader.ts";
import { createEmptyVectorCache, buildVectorCache } from "../vector-cache.ts";
import { readVectorCache, writeVectorCache } from "../persistence.ts";

const DEFAULT_CACHE_PATH = "embeddings/vector-cache.json";
const DEFAULT_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

async function main(): Promise<void> {
  const pages = await loadWikiPages("wiki");
  const index = buildBm25Index(pages);
  const documents = createRetrievalDocuments(pages).map((document) => {
    const matching = index.documents.find((indexedDocument) => indexedDocument.chunkId === document.chunkId);
    return matching ?? document;
  });

  let currentCache = createEmptyVectorCache(DEFAULT_MODEL, 0);
  try {
    currentCache = await readVectorCache(DEFAULT_CACHE_PATH);
  } catch {
    currentCache = createEmptyVectorCache(DEFAULT_MODEL, 0);
  }

  const client = new OpenAiEmbeddingClient();
  const { cache, summary } = await buildVectorCache(
    documents,
    currentCache,
    DEFAULT_MODEL,
    client,
    new Date().toISOString()
  );
  await writeVectorCache(DEFAULT_CACHE_PATH, cache);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
