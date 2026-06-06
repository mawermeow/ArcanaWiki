import assert from "node:assert/strict";
import test from "node:test";

import { handleChatRequest, validateChatApiRequest } from "../../lib/pwa/chat-api.ts";
import type { TarotAnswerResponse } from "../../lib/answer/types.ts";

function createRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

test("chat API validation rejects empty question", async () => {
  const validation = validateChatApiRequest({
    question: "   "
  });

  assert.equal(validation.ok, false);
  if (!validation.ok) {
    assert.ok(validation.issues.includes("`question` is required."));
  }

  const response = await handleChatRequest(createRequest({ question: "" }), {
    answer: async () => {
      throw new Error("should not be called");
    },
    debugEnabled: false
  });

  assert.equal(response.status, 400);
  const payload = await readJson(response);
  assert.equal(payload.error, "Invalid request body.");
});

test("chat API hides diagnostics by default", async () => {
  let seenDebug = true;

  const response = await handleChatRequest(
    createRequest({
      question: "聖杯二逆位",
      debug: true
    }),
    {
      answer: async (request) => {
        seenDebug = request.debug ?? false;
        return {
          answer: "可能象徵關係裡的失衡。",
          selectedSources: [
            {
              pageId: "cups-02",
              chunkId: "cups-02::逆位意義",
              title: "聖杯二（Two of Cups）",
              sectionTitle: "逆位意義"
            }
          ],
          diagnostics: {
            hidden: true
          },
          safety: {
            answerValid: true,
            citationErrors: []
          }
        } satisfies TarotAnswerResponse;
      },
      debugEnabled: false
    }
  );

  assert.equal(seenDebug, false);
  const payload = await readJson(response);
  assert.equal(payload.diagnostics, undefined);
  assert.deepEqual(payload.selectedSources, [
    {
      pageId: "cups-02",
      title: "聖杯二（Two of Cups）",
      sectionTitle: "逆位意義"
    }
  ]);
});

test("debug diagnostics are gated by env flag", async () => {
  let seenDebug = false;

  const response = await handleChatRequest(
    createRequest({
      question: "對方最近很冷淡",
      debug: true
    }),
    {
      answer: async (request) => {
        seenDebug = request.debug ?? false;
        return {
          answer: "目前可以先回到溝通節奏本身。",
          selectedSources: [],
          diagnostics: {
            retrieval: {
              topK: 3
            }
          },
          safety: {
            answerValid: false,
            cannotConfirmReason: "目前資料不足以確認",
            citationErrors: []
          }
        } satisfies TarotAnswerResponse;
      },
      debugEnabled: true
    }
  );

  assert.equal(seenDebug, true);
  const payload = await readJson(response);
  assert.deepEqual(payload.diagnostics, {
    retrieval: {
      topK: 3
    }
  });
});

test("no selected sources fallback stays minimal", async () => {
  const response = await handleChatRequest(
    createRequest({
      question: "完全不存在的牌義"
    }),
    {
      answer: async () => ({
        answer: "目前資料不足以確認。",
        selectedSources: [],
        safety: {
          answerValid: false,
          cannotConfirmReason: "目前資料不足以確認",
          citationErrors: []
        }
      }),
      debugEnabled: false
    }
  );

  assert.equal(response.status, 200);
  const payload = await readJson(response);
  assert.deepEqual(payload.selectedSources, []);
  assert.equal(payload.answer, "目前資料不足以確認。");
});
