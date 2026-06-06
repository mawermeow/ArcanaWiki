import { answerTarotQuestion } from "../answer/index.ts";
import type {
  TarotAnswerRequest,
  TarotAnswerResponse,
  TarotCardInput
} from "../answer/types.ts";
import { isRetrievalDebugEnabled } from "./env.ts";

export type ChatApiRequest = {
  question: string;
  cards?: TarotCardInput[];
  spreadId?: string;
  mode?: "gentle" | "direct" | "reflective";
  debug?: boolean;
};

export type ChatApiResponse = {
  answer: string;
  selectedSources: Array<{
    pageId: string;
    title: string;
    sectionTitle?: string;
  }>;
  safety: TarotAnswerResponse["safety"];
  diagnostics?: TarotAnswerResponse["diagnostics"];
};

type ChatApiDependencies = {
  answer: (request: TarotAnswerRequest) => Promise<TarotAnswerResponse>;
  debugEnabled: boolean;
};

type ValidationResult =
  | { ok: true; value: ChatApiRequest }
  | { ok: false; issues: string[] };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateCards(rawCards: unknown, issues: string[]): TarotCardInput[] | undefined {
  if (rawCards === undefined) {
    return undefined;
  }

  if (!Array.isArray(rawCards)) {
    issues.push("`cards` must be an array.");
    return undefined;
  }

  return rawCards.flatMap((card, index) => {
    if (!isRecord(card)) {
      issues.push(`cards[${index}] must be an object.`);
      return [];
    }

    const cardId = typeof card.cardId === "string" ? card.cardId.trim() : "";
    if (!cardId) {
      issues.push(`cards[${index}].cardId is required.`);
      return [];
    }

    const orientation = card.orientation;
    if (
      orientation !== undefined &&
      orientation !== "upright" &&
      orientation !== "reversed" &&
      orientation !== "unknown"
    ) {
      issues.push(`cards[${index}].orientation must be upright, reversed, or unknown.`);
      return [];
    }

    const position = typeof card.position === "string" ? card.position.trim() : undefined;

    return [
      {
        cardId,
        orientation,
        position: position || undefined
      }
    ];
  });
}

export function validateChatApiRequest(input: unknown): ValidationResult {
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: ["Request body must be a JSON object."]
    };
  }

  const issues: string[] = [];
  const question = typeof input.question === "string" ? input.question.trim() : "";
  if (!question) {
    issues.push("`question` is required.");
  }

  const mode = input.mode;
  if (
    mode !== undefined &&
    mode !== "gentle" &&
    mode !== "direct" &&
    mode !== "reflective"
  ) {
    issues.push("`mode` must be gentle, direct, or reflective.");
  }

  const spreadId =
    typeof input.spreadId === "string" && input.spreadId.trim().length > 0
      ? input.spreadId.trim()
      : undefined;

  if (input.debug !== undefined && typeof input.debug !== "boolean") {
    issues.push("`debug` must be a boolean.");
  }

  const cards = validateCards(input.cards, issues);

  if (issues.length > 0) {
    return {
      ok: false,
      issues
    };
  }

  return {
    ok: true,
    value: {
      question,
      cards,
      spreadId,
      mode: mode as ChatApiRequest["mode"],
      debug: input.debug as boolean | undefined
    }
  };
}

function sanitizeAnswerResponse(
  response: TarotAnswerResponse,
  allowDiagnostics: boolean
): ChatApiResponse {
  return {
    answer: response.answer,
    selectedSources: response.selectedSources.map((source) => ({
      pageId: source.pageId,
      title: source.title,
      sectionTitle: source.sectionTitle
    })),
    safety: response.safety,
    diagnostics: allowDiagnostics ? response.diagnostics : undefined
  };
}

export async function handleChatRequest(
  request: Request,
  dependencies: Partial<ChatApiDependencies> = {}
): Promise<Response> {
  const answer = dependencies.answer ?? answerTarotQuestion;
  const debugEnabled = dependencies.debugEnabled ?? isRetrievalDebugEnabled();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      {
        error: "Invalid JSON body."
      },
      400
    );
  }

  const validation = validateChatApiRequest(body);
  if (!validation.ok) {
    return jsonResponse(
      {
        error: "Invalid request body.",
        issues: validation.issues
      },
      400
    );
  }

  const allowDiagnostics = debugEnabled && validation.value.debug === true;

  try {
    const response = await answer({
      ...validation.value,
      debug: allowDiagnostics
    });

    return jsonResponse(sanitizeAnswerResponse(response, allowDiagnostics));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message.includes("OPENAI_API_KEY") ? 503 : 500;

    return jsonResponse(
      {
        error:
          status === 503
            ? "目前無法連線到解讀服務，請稍後再試。"
            : "目前無法完成回應，請稍後再試。"
      },
      status
    );
  }
}
