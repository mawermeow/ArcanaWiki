import { readRelationGraph } from "../retrieval/graph-loader.ts";
import { readBm25Index, readVectorCache } from "../retrieval/persistence.ts";
import { searchHybridIndex } from "../retrieval/hybrid-searcher.ts";
import { validateTarotAnswer } from "./answer-validator.ts";
import { buildAnswerContext, buildAnswerQuery } from "./context-builder.ts";
import { attachSelectedSourceCitations, validateCitations } from "./citation-validator.ts";
import { createAnswerDiagnostics } from "./diagnostics.ts";
import { FetchOpenAiChatClient } from "./openai-client.ts";
import { buildAnswerPrompt } from "./prompt-builder.ts";
import { createSafetyFallback, detectSafetyGuardrails } from "./safety.ts";
import type {
  AnswerDiagnostics,
  OpenAiChatClient,
  TarotAnswerRequest,
  TarotAnswerResponse,
  TarotAnswerServiceDependencies
} from "./types.ts";

const DEFAULT_INDEX_PATH = "embeddings/bm25-index.json";
const DEFAULT_VECTOR_CACHE_PATH = "embeddings/vector-cache.json";
const DEFAULT_GRAPH_PATH = "relations/graph.json";

function createNoContextResponse(
  request: TarotAnswerRequest,
  reason: string,
  diagnostics?: AnswerDiagnostics
): TarotAnswerResponse {
  return {
    answer: createSafetyFallback(reason, detectSafetyGuardrails(request.question).categories),
    selectedSources: [],
    diagnostics: request.debug ? diagnostics : undefined,
    safety: {
      answerValid: false,
      cannotConfirmReason: reason,
      citationErrors: []
    }
  };
}

function createInvalidAnswerResponse(options: {
  request: TarotAnswerRequest;
  selectedSources: TarotAnswerResponse["selectedSources"];
  reason: string;
  citationErrors: string[];
  diagnostics?: AnswerDiagnostics;
}): TarotAnswerResponse {
  return {
    answer: createSafetyFallback(options.reason, detectSafetyGuardrails(options.request.question).categories),
    selectedSources: options.selectedSources,
    diagnostics: options.request.debug ? options.diagnostics : undefined,
    safety: {
      answerValid: false,
      cannotConfirmReason: options.reason,
      citationErrors: options.citationErrors
    }
  };
}

function shouldUseLiveQueryEmbedding(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function createDefaultDependencies(): TarotAnswerServiceDependencies {
  return {
    loadIndex: () => readBm25Index(DEFAULT_INDEX_PATH),
    loadCache: () => readVectorCache(DEFAULT_VECTOR_CACHE_PATH),
    loadGraph: () => readRelationGraph(DEFAULT_GRAPH_PATH),
    client: {
      generate(messages) {
        return new FetchOpenAiChatClient().generate(messages);
      }
    }
  };
}

export function createTarotAnswerService(dependencies: TarotAnswerServiceDependencies) {
  return async function answerTarotQuestion(request: TarotAnswerRequest): Promise<TarotAnswerResponse> {
    const [index, cache, graph] = await Promise.all([
      dependencies.loadIndex(),
      dependencies.loadCache(),
      dependencies.loadGraph()
    ]);

    const safety = detectSafetyGuardrails(request.question);
    const query = buildAnswerQuery(request, index);

    const retrieval = await searchHybridIndex(index, cache, graph, query, {
      topK: Number(process.env.TAROT_FINAL_CONTEXT_TOP_K ?? 8),
      liveQueryEmbedding: shouldUseLiveQueryEmbedding()
    });
    const context = buildAnswerContext({
      request,
      index,
      retrieval
    });

    const diagnostics = createAnswerDiagnostics({
      request,
      query: context.query,
      selectedSourceCount: context.selectedSources.length,
      retrieval,
      safety
    });

    if (context.selectedSources.length === 0) {
      return createNoContextResponse(request, "目前資料不足以確認", diagnostics);
    }

    const prompt = buildAnswerPrompt({
      request,
      context,
      safety
    });

    if (request.debug) {
      diagnostics.promptPreview = {
        system: prompt.system,
        developer: prompt.developer,
        user: prompt.user
      };
    }

    const completion = await dependencies.client.generate(prompt.messages);
    diagnostics.model = {
      name: completion.model,
      usage: completion.usage
    };

    const answerWithCitations = attachSelectedSourceCitations(completion.text, context.selectedSources);
    const citationValidation = validateCitations(answerWithCitations, context.selectedSources);
    diagnostics.citations = citationValidation;

    if (citationValidation.errors.length > 0) {
      return createInvalidAnswerResponse({
        request,
        selectedSources: context.selectedSources,
        reason: "引用來源驗證未通過",
        citationErrors: citationValidation.errors,
        diagnostics
      });
    }

    const answerValidation = validateTarotAnswer(answerWithCitations);
    diagnostics.answerValidation = answerValidation;

    if (!answerValidation.valid) {
      return createInvalidAnswerResponse({
        request,
        selectedSources: context.selectedSources,
        reason: "回答未通過安全語氣驗證",
        citationErrors: [],
        diagnostics
      });
    }

    return {
      answer: answerWithCitations,
      selectedSources: context.selectedSources,
      diagnostics: request.debug ? diagnostics : undefined,
      safety: {
        answerValid: true,
        citationErrors: []
      }
    };
  };
}

export const answerTarotQuestion = createTarotAnswerService(createDefaultDependencies());

export type {
  AnswerContext,
  AnswerContextChunk,
  AnswerDiagnostics,
  AnswerPrompt,
  AnswerSafetyCategory,
  CitationValidationResult,
  OpenAiChatClient,
  OpenAiChatMessage,
  OpenAiChatResult,
  SafetyAssessment,
  TarotAnswerRequest,
  TarotAnswerResponse,
  TarotAnswerSelectedSource
} from "./types.ts";
