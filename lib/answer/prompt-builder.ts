import type { AnswerContext, AnswerPrompt, SafetyAssessment, TarotAnswerRequest } from "./types.ts";

function renderCards(request: TarotAnswerRequest): string {
  if (!request.cards || request.cards.length === 0) {
    return "未提供抽牌資訊";
  }

  return request.cards
    .map((card) => {
      const orientation =
        card.orientation === "reversed"
          ? "逆位"
          : card.orientation === "upright"
            ? "正位"
            : "未知";
      return `- ${card.cardId} / ${orientation}${card.position ? ` / ${card.position}` : ""}`;
    })
    .join("\n");
}

export function buildAnswerPrompt(options: {
  request: TarotAnswerRequest;
  context: AnswerContext;
  safety: SafetyAssessment;
}): AnswerPrompt {
  const system = "SYSTEM:\n你是溫柔、克制、非宿命論的塔羅解讀助手。";
  const developer = [
    "DEVELOPER:",
    "只能根據提供的 WIKI CONTEXT 解讀。",
    "不要做醫療、法律、財務斷言。",
    "不要說絕對命運。",
    "不要聲稱知道對方真實想法。",
    "不要鼓勵操控、監控、報復、測試對方。",
    "若 context 不足，明確說目前資料不足。",
    "回答要偏向象徵解讀、自我覺察、界線與行動選擇。",
    "回答必須使用繁體中文。",
    "回答請採用以下結構：",
    "1. 簡短總結",
    "2. 牌面/象徵解讀",
    "3. 與問題的關聯",
    "4. 可反思的問題",
    "5. 溫和行動建議",
    "引用來源時必須使用格式 [來源: pageId#chunkId]。",
    "只能引用 WIKI CONTEXT 中實際存在的 source。"
  ];

  if (options.safety.requiresGuardrail) {
    developer.push(
      `此題涉及安全邊界：${options.safety.categories.join(", ")}。`,
      "你可以提供象徵層次的反思，但不能做診斷、判決、保證、監控或控制建議。"
    );
  }

  const user = [
    "USER:",
    `問題：${options.request.question}`,
    `模式：${options.request.mode ?? "gentle"}`,
    `牌陣：${options.request.spreadId ?? "未提供"}`,
    "抽到的牌：",
    renderCards(options.request),
    "",
    "WIKI CONTEXT:",
    options.context.renderedContext
  ].join("\n");

  return {
    system,
    developer: developer.join("\n"),
    user,
    messages: [
      {
        role: "system",
        content: `${system}\n\n${developer.join("\n")}`
      },
      {
        role: "user",
        content: user
      }
    ]
  };
}
