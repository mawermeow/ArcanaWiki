const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

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

export class OpenAiEmbeddingClient {
  private readonly apiKey: string;

  constructor(apiKey = process.env.OPENAI_API_KEY) {
    this.apiKey = requireOpenAiApiKey(apiKey);
  }

  async embedTexts(texts: string[], model = process.env.OPENAI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL) {
    if (texts.length === 0) {
      return {
        model,
        vectors: [],
        dimension: 0
      };
    }

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

    const payload = (await response.json()) as EmbeddingApiResponse;
    const vectors = payload.data
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);

    return {
      model: payload.model,
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
