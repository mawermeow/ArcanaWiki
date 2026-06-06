import assert from "node:assert/strict";
import test from "node:test";

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import React from "react";
import { TarotChatClient } from "../../components/tarot-chat-client.tsx";

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/"
  });

  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    HTMLInputElement: { configurable: true, value: dom.window.HTMLInputElement },
    HTMLTextAreaElement: { configurable: true, value: dom.window.HTMLTextAreaElement },
    HTMLSelectElement: { configurable: true, value: dom.window.HTMLSelectElement },
    Event: { configurable: true, value: dom.window.Event },
    MouseEvent: { configurable: true, value: dom.window.MouseEvent }
  });

  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  return () => {
    cleanup();
    dom.window.close();
  };
}

test("UI basic render shows form and guidance", async () => {
  const restore = installDom();

  const view = render(
    <TarotChatClient
      cardOptions={[{ cardId: "cups-02", title: "聖杯二（Two of Cups）" }]}
      debugEnabled={false}
    />
  );

  assert.ok(view.getByText("ArcanaWiki PWA"));
  assert.ok(view.getByLabelText("問題"));
  assert.ok(view.getByRole("button", { name: "送出問題" }));

  restore();
});

test("submit flow renders answer and selected source summary", async () => {
  const restore = installDom();
  let seenBody = "";

  const view = render(
    <TarotChatClient
      cardOptions={[{ cardId: "cups-02", title: "聖杯二（Two of Cups）" }]}
      debugEnabled={false}
      requestChat={async (payload) => {
        seenBody = String(payload.body ?? "");
        return new Response(
          JSON.stringify({
            answer: "這比較像是在提醒你回看互動的平衡。",
            selectedSources: [
              {
                pageId: "cups-02",
                title: "聖杯二（Two of Cups）",
                sectionTitle: "逆位意義",
                chunkId: "cups-02::逆位意義",
                summary: "關係中不和諧的因素,不平等的關係,溝通不暢,分離、分手。"
              }
            ],
            safety: {
              answerValid: true,
              citationErrors: []
            }
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }}
    />
  );

  const questionInput = view.getByLabelText("問題") as HTMLTextAreaElement;
  const cardInput = view.getByLabelText("牌卡 1") as HTMLInputElement;

  fireEvent.input(questionInput, {
    target: { value: "聖杯二逆位，對方最近很冷淡。" }
  });
  fireEvent.input(cardInput, {
    target: { value: "cups-02" }
  });

  assert.equal(questionInput.value, "聖杯二逆位，對方最近很冷淡。");
  assert.equal(cardInput.value, "cups-02");

  await new Promise((resolve) => setTimeout(resolve, 0));
  fireEvent.click(view.getByRole("button", { name: "送出問題" }));

  await waitFor(() => {
    assert.ok(view.getByText("這比較像是在提醒你回看互動的平衡。"));
  });

  assert.ok(seenBody.length > 0);
  assert.ok(view.getAllByText("聖杯二（Two of Cups）").length >= 1);
  assert.ok(view.getByText("逆位意義"));
  assert.ok(view.getByText("關係中不和諧的因素,不平等的關係,溝通不暢,分離、分手。"));
  assert.ok(view.getByText("cups-02#cups-02::逆位意義"));
  const sourceLink = view.getByRole("link", { name: "聖杯二（Two of Cups）" });
  assert.equal(sourceLink.getAttribute("href"), "/wiki/cups-02");
  assert.equal(sourceLink.getAttribute("target"), "_blank");
  assert.equal(
    (view.getByAltText("聖杯二（Two of Cups）") as HTMLImageElement).getAttribute("src"),
    "/cards/Cups02.jpg"
  );

  restore();
});

test("UI shows error state when submit fails", async () => {
  const restore = installDom();

  const view = render(
    <TarotChatClient
      cardOptions={[]}
      debugEnabled={false}
      requestChat={async () =>
        new Response(
          JSON.stringify({
            error: "目前無法完成回應，請稍後再試。"
          }),
          {
            status: 500,
            headers: {
              "content-type": "application/json"
            }
          }
        )
      }
    />
  );

  fireEvent.change(view.getByLabelText("問題"), {
    target: { value: "test question" }
  });
  fireEvent.click(view.getByRole("button", { name: "送出問題" }));

  await waitFor(() => {
    assert.ok(view.getByText("目前無法完成回應，請稍後再試。"));
  });

  restore();
});

test("auto draw option submits flag and renders generated reading", async () => {
  const restore = installDom();
  let seenBody = "";

  const view = render(
    <TarotChatClient
      cardOptions={[{ cardId: "cups-02", title: "聖杯二（Two of Cups）" }]}
      debugEnabled={false}
      requestChat={async (payload) => {
        seenBody = String(payload.body ?? "");
        return new Response(
          JSON.stringify({
            answer: "先從關係裡最卡住的地方開始看。",
            selectedSources: [],
            generatedReading: {
              spreadId: "spread-love-tree",
              spreadTitle: "愛情樹牌陣",
              cards: [
                {
                  cardId: "cups-02",
                  title: "聖杯二（Two of Cups）",
                  orientation: "reversed",
                  position: "目前關係狀態"
                }
              ]
            },
            safety: {
              answerValid: true,
              citationErrors: []
            }
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }}
    />
  );

  fireEvent.change(view.getByLabelText("問題"), {
    target: { value: "對方最近很冷淡，我該怎麼理解這段關係？" }
  });
  fireEvent.click(view.getByRole("checkbox"));
  fireEvent.submit(view.container.querySelector("form") as HTMLFormElement);

  await waitFor(() => {
    assert.ok(view.getByText("愛情樹牌陣"));
  });

  assert.match(seenBody, /"autoDraw":true/);
  assert.ok(view.getByText("目前關係狀態"));
  assert.ok(view.getAllByText("逆位").length >= 1);
  assert.equal(
    (view.getByAltText("聖杯二（Two of Cups）") as HTMLImageElement).getAttribute("src"),
    "/cards/Cups02.jpg"
  );
  assert.ok(
    (view.getByAltText("聖杯二（Two of Cups）") as HTMLImageElement).className.includes("rotate-180")
  );

  restore();
});
