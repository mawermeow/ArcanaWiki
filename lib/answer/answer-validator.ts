import { validateAnswerStyle } from "./safety.ts";
import type { AnswerValidationResult } from "./types.ts";

export function validateTarotAnswer(answer: string): AnswerValidationResult {
  return validateAnswerStyle(answer);
}
