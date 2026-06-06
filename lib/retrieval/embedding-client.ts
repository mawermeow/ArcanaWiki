const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_EMBEDDING_REQUEST_TOKENS = 100000;
const MAX_EMBEDDING_BATCH_ITEMS = 128;

type EmbeddingApiResponse = {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
};

export function requireOpenAiApiKey(apiKey = process.env.OPENAI_API_KEY): string {
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY. `index:vector` requires an API key to generate embeddings.");
  }
  return apiKey;
}

export function estimateEmbeddingTokens(text: string): number {
  const normalized = text.normalize("NFKC");
  const cjkCount = Array.from(normalized).filter((char) => /[\u3400-\u9fff]/.test(char)).length;
  const nonCjkLength = Math.max(0, normalized.length - cjkCount);
  const estimatedFromCjk = cjkCount;
  const estimatedFromNonCjk = Math.ceil(nonCjkLength / 4);
  return Math.max(1, estimatedFromCjk + estimatedFromNonCjk);
}

export function createEmbeddingBatches(
  texts: string[],
  options: {
    maxTokens?: number;
    maxItems?: number;
  } = {}
): string[][] {
  const maxTokens = options.maxTokens ?? MAX_EMBEDDING_REQUEST_TOKENS;
  const maxItems = options.maxItems ?? MAX_EMBEDDING_BATCH_ITEMS;
  const batches: string[][] = [];
  let currentBatch: string[] = [];
  let currentTokens = 0;

  for (const text of texts) {
    const estimatedTokens = estimateEmbeddingTokens(text);
    const exceedsCurrentBatch =
      currentBatch.length > 0 &&
      (currentTokens + estimatedTokens > maxTokens || currentBatch.length >= maxItems);

    if (exceedsCurrentBatch) {
      batches.push(currentBatch);
      currentBatch = [];
      currentTokens = 0;
    }

    currentBatch.push(text);
    currentTokens += estimatedTokens;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

export class OpenAiEmbeddingClient {
  private readonly apiKey: string;

  constructor(apiKey = process.env.OPENAI_API_KEY) {
    this.apiKey = requireOpenAiApiKey(apiKey);
  }

  private async embedBatch(texts: string[], model: string): Promise<EmbeddingApiResponse> {
    const response = await fetch(OPENAI_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model,
        input: texts
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI embeddings request failed with ${response.status}: ${body}`);
    }

    return (await response.json()) as EmbeddingApiResponse;
  }

  async embedTexts(texts: string[], model = process.env.OPENAI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL) {
    if (texts.length === 0) {
      return {
        model,
        vectors: [],
        dimension: 0
      };
    }

    const batches = createEmbeddingBatches(texts);
    const vectors: number[][] = [];
    let responseModel = model;

    for (const batch of batches) {
      const payload = await this.embedBatch(batch, model);
      responseModel = payload.model;
      vectors.push(
        ...payload.data
          .sort((left, right) => left.index - right.index)
          .map((item) => item.embedding)
      );
    }

    return {
      model: responseModel,
      vectors,
      dimension: vectors[0]?.length ?? 0
    };
  }
}

export async function embedQueryText(text: string, model?: string): Promise<{
  model: string;
  vector: number[];
  dimension: number;
}> {
  const client = new OpenAiEmbeddingClient();
  const response = await client.embedTexts([text], model);
  return {
    model: response.model,
    vector: response.vectors[0] ?? [],
    dimension: response.dimension
  };
}
