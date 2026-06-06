import type {
  AnswerDiagnostics,
  SafetyAssessment,
  TarotAnswerRequest
} from "./types.ts";
import type { HybridSearchResponse } from "../retrieval/types.ts";

export function createAnswerDiagnostics(options: {
  request: TarotAnswerRequest;
  query: string;
  selectedSourceCount: number;
  retrieval: HybridSearchResponse;
  safety: SafetyAssessment;
}): AnswerDiagnostics {
  return {
    request: options.request,
    retrieval: {
      query: options.query,
      selectedSourceCount: options.selectedSourceCount,
      diagnostics: options.retrieval.diagnostics
    },
    safety: options.safety
  };
}
