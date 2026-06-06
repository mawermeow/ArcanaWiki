import type { AnswerSafetyCategory, AnswerValidationResult, SafetyAssessment } from "./types.ts";

const SAFETY_PATTERNS: Array<{ category: AnswerSafetyCategory; patterns: RegExp[] }> = [
  {
    category: "self-harm",
    patterns: [/自傷/, /自殺/, /不想活/, /傷害自己/, /結束生命/]
  },
  {
    category: "violence",
    patterns: [/暴力/, /打他/, /報復/, /傷害對方/, /弄死/, /攻擊/]
  },
  {
    category: "medical",
    patterns: [/診斷/, /醫療/, /懷孕/, /癌症/, /憂鬱症/, /要不要看醫生/, /病會不會好/]
  },
  {
    category: "legal",
    patterns: [/法律/, /官司/, /離婚判決/, /犯罪/, /合約/, /告他/]
  },
  {
    category: "financial",
    patterns: [/投資/, /股票/, /虛擬貨幣/, /財務/, /要不要買/, /會不會賺錢/]
  },
  {
    category: "stalking-or-control",
    patterns: [/監控/, /跟蹤/, /試探/, /操控/, /偷看/, /查手機/, /報復/]
  },
  {
    category: "certainty-about-other-person",
    patterns: [/是否出軌/, /有沒有出軌/, /是否愛我/, /還愛不愛我/, /對方真實想法/, /他到底怎麼想/]
  }
];

const ABSOLUTE_LANGUAGE_PATTERNS = [
  /一定會/,
  /命中注定/,
  /絕對會/,
  /百分之百/,
  /對方一定/,
  /他一定/,
  /她一定/,
  /注定/
];

const MANIPULATION_PATTERNS = [/監控/, /跟蹤/, /操控/, /報復/, /試探對方/, /測試對方/];

export function detectSafetyGuardrails(question: string): SafetyAssessment {
  const categories = SAFETY_PATTERNS
    .filter((entry) => entry.patterns.some((pattern) => pattern.test(question)))
    .map((entry) => entry.category);

  return {
    categories,
    requiresGuardrail: categories.length > 0
  };
}

export function createSafetyFallback(reason: string, categories: AnswerSafetyCategory[]): string {
  const needsProfessionalHelp = categories.some((category) =>
    ["self-harm", "violence", "medical", "legal", "financial"].includes(category)
  );

  const supportLine = needsProfessionalHelp
    ? "\n\n如果這題牽涉到立即風險、健康、法律或財務決策，請優先尋求相應專業協助。"
    : "";

  return [
    `目前無法安全確認這個解讀，因為 ${reason}。`,
    "比較穩妥的做法，是先回到可觀察的事實、你的感受、關係界線與下一步溝通選擇。",
    supportLine
  ]
    .filter(Boolean)
    .join("");
}

export function validateAnswerStyle(answer: string): AnswerValidationResult {
  const errors: string[] = [];

  if (ABSOLUTE_LANGUAGE_PATTERNS.some((pattern) => pattern.test(answer))) {
    errors.push("Answer contains absolute or fatalistic language.");
  }

  if (MANIPULATION_PATTERNS.some((pattern) => pattern.test(answer))) {
    errors.push("Answer contains manipulative or surveillance-oriented advice.");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
