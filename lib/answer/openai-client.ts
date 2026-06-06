import type { OpenAiChatClient, OpenAiChatMessage, OpenAiChatResult } from "./types.ts";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_CHAT_MODEL = "gpt-4.1-mini";
const DEFAULT_REQUEST_TIMEOUT_SECONDS = 30;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_COMPLETION_TOKENS = 900;

type ChatCompletionApiResponse = {
  model: string;
  choices: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export function requireOpenAiApiKey(apiKey = process.env.OPENAI_API_KEY): string {
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY. `pnpm answer` requires an API key to call OpenAI Chat API.");
  }
  return apiKey;
}

function parseNumberEnv(rawValue: string | undefined, fallback: number): number {
  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseModelEnv(rawValue: string | undefined, fallback: string): string {
  if (!rawValue) {
    return fallback;
  }

  const value = rawValue.trim();
  const prefix = "OPENAI_CHAT_MODEL=";

  if (value.startsWith(prefix)) {
    return value.slice(prefix.length).trim() || fallback;
  }

  return value;
}

function shouldRetry(responseStatus: number): boolean {
  return responseStatus === 408 || responseStatus === 429 || responseStatus >= 500;
}

function readContent(content: string | Array<{ type?: string; text?: string }> | undefined): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => part.text ?? "")
      .join("")
      .trim();
  }

  return "";
}

export class FetchOpenAiChatClient implements OpenAiChatClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly maxCompletionTokens: number;

  constructor(options: {
    apiKey?: string;
    fetchImpl?: typeof fetch;
    model?: string;
    timeoutSeconds?: number;
    maxRetries?: number;
    maxCompletionTokens?: number;
  } = {}) {
    this.apiKey = requireOpenAiApiKey(options.apiKey);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.model =
      options.model ??
      parseModelEnv(process.env.OPENAI_CHAT_MODEL, DEFAULT_CHAT_MODEL);
    this.timeoutMs =
      (options.timeoutSeconds ??
        parseNumberEnv(process.env.OPENAI_REQUEST_TIMEOUT_SECONDS, DEFAULT_REQUEST_TIMEOUT_SECONDS)) *
      1000;
    this.maxRetries =
      options.maxRetries ?? parseNumberEnv(process.env.OPENAI_MAX_RETRIES, DEFAULT_MAX_RETRIES);
    this.maxCompletionTokens =
      options.maxCompletionTokens ??
      parseNumberEnv(
        process.env.OPENAI_CHAT_MAX_COMPLETION_TOKENS,
        DEFAULT_MAX_COMPLETION_TOKENS
      );
  }

  async generate(messages: OpenAiChatMessage[]): Promise<OpenAiChatResult> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await this.fetchImpl(OPENAI_CHAT_COMPLETIONS_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: this.model,
            messages,
            max_completion_tokens: this.maxCompletionTokens
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          const body = await response.text();
          if (attempt < this.maxRetries && shouldRetry(response.status)) {
            lastError = new Error(`OpenAI chat request failed with ${response.status}: ${body}`);
            continue;
          }
          throw new Error(`OpenAI chat request failed with ${response.status}: ${body}`);
        }

        const payload = (await response.json()) as ChatCompletionApiResponse;
        const text = readContent(payload.choices[0]?.message?.content);

        if (!text) {
          throw new Error("OpenAI chat response did not include message content.");
        }

        return {
          text,
          model: payload.model || this.model,
          usage: {
            promptTokens: payload.usage?.prompt_tokens,
            completionTokens: payload.usage?.completion_tokens,
            totalTokens: payload.usage?.total_tokens
          }
        };
      } catch (error) {
        lastError = error;
        if (attempt >= this.maxRetries) {
          throw error;
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError instanceof Error ? lastError : new Error("OpenAI chat request failed.");
  }
}
