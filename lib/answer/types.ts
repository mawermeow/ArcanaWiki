import type { BM25Index, HybridSearchResponse } from "../retrieval/types.ts";

export type TarotCardInput = {
  cardId: string;
  orientation?: "upright" | "reversed" | "unknown";
  position?: string;
};

export type TarotAnswerRequest = {
  question: string;
  cards?: TarotCardInput[];
  spreadId?: string;
  mode?: "gentle" | "direct" | "reflective";
  debug?: boolean;
};

export type TarotAnswerSelectedSource = {
  pageId: string;
  chunkId: string;
  title: string;
  sectionTitle?: string;
};

export type TarotAnswerResponse = {
  answer: string;
  selectedSources: TarotAnswerSelectedSource[];
  diagnostics?: unknown;
  safety: {
    answerValid: boolean;
    cannotConfirmReason?: string;
    citationErrors: string[];
  };
};

export type AnswerSafetyCategory =
  | "self-harm"
  | "violence"
  | "medical"
  | "legal"
  | "financial"
  | "stalking-or-control"
  | "certainty-about-other-person";

export type SafetyAssessment = {
  categories: AnswerSafetyCategory[];
  requiresGuardrail: boolean;
};

export type CitationValidationResult = {
  citedSourceKeys: string[];
  errors: string[];
};

export type AnswerValidationResult = {
  valid: boolean;
  errors: string[];
};

export type AnswerContextChunk = {
  pageId: string;
  chunkId: string;
  title: string;
  sectionTitle: string;
  tags: string[];
  topics: string[];
  content: string;
};

export type AnswerContext = {
  query: string;
  selectedSources: TarotAnswerSelectedSource[];
  chunks: AnswerContextChunk[];
  renderedContext: string;
};

export type OpenAiChatMessage = {
  role: "system" | "user";
  content: string;
};

export type OpenAiChatResult = {
  text: string;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

export type OpenAiChatClient = {
  generate(messages: OpenAiChatMessage[]): Promise<OpenAiChatResult>;
};

export type AnswerPrompt = {
  system: string;
  developer: string;
  user: string;
  messages: OpenAiChatMessage[];
};

export type AnswerDiagnostics = {
  request: TarotAnswerRequest;
  retrieval: {
    query: string;
    selectedSourceCount: number;
    diagnostics: HybridSearchResponse["diagnostics"];
  };
  safety: SafetyAssessment;
  citations?: CitationValidationResult;
  answerValidation?: AnswerValidationResult;
  model?: {
    name: string;
    usage?: OpenAiChatResult["usage"];
  };
  promptPreview?: {
    system: string;
    developer: string;
    user: string;
  };
};

export type TarotAnswerServiceDependencies = {
  loadIndex: () => Promise<BM25Index>;
  loadCache: () => Promise<import("../retrieval/types.ts").VectorCache>;
  loadGraph: () => Promise<import("../retrieval/types.ts").RelationGraph>;
  client: OpenAiChatClient;
};
