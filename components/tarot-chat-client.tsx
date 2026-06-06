"use client";

import React, { useMemo, useState, type FormEvent } from "react";
import type { ChatApiResponse } from "../lib/pwa/chat-api.ts";
import type { TarotCardOption } from "../lib/pwa/card-catalog.ts";

type CardDraft = {
  id: string;
  cardId: string;
  orientation: "upright" | "reversed" | "unknown";
  position: string;
};

type TarotChatClientProps = {
  cardOptions: TarotCardOption[];
  debugEnabled: boolean;
  requestChat?: (payload: RequestInit) => Promise<Response>;
};

const EMPTY_CARD = (): CardDraft => ({
  id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
  cardId: "",
  orientation: "unknown",
  position: ""
});

export function TarotChatClient({
  cardOptions,
  debugEnabled,
  requestChat
}: TarotChatClientProps) {
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<"gentle" | "direct" | "reflective">("gentle");
  const [cards, setCards] = useState<CardDraft[]>([EMPTY_CARD()]);
  const [debug, setDebug] = useState(false);
  const [result, setResult] = useState<ChatApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sendRequest =
    requestChat ??
    ((payload: RequestInit) =>
      fetch("/api/chat", {
        ...payload,
        headers: {
          "content-type": "application/json"
        }
      }));

  const activeCards = useMemo(
    () =>
      cards
        .map((card) => ({
          cardId: card.cardId.trim(),
          orientation: card.orientation,
          position: card.position.trim()
        }))
        .filter((card) => card.cardId.length > 0)
        .map((card) => ({
          cardId: card.cardId,
          orientation: card.orientation,
          position: card.position || undefined
        })),
    [cards]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await sendRequest({
        method: "POST",
        body: JSON.stringify({
          question,
          cards: activeCards,
          mode,
          debug: debugEnabled ? debug : false
        })
      });

      const payload = (await response.json()) as ChatApiResponse & {
        error?: string;
        issues?: string[];
      };

      if (!response.ok) {
        const issues = payload.issues && payload.issues.length > 0 ? ` ${payload.issues.join(" ")}` : "";
        throw new Error(`${payload.error ?? "提交失敗。"}${issues}`.trim());
      }

      setResult(payload);
    } catch (submitError) {
      setResult(null);
      setError(submitError instanceof Error ? submitError.message : "提交失敗。");
    } finally {
      setLoading(false);
    }
  }

  function updateCard(id: string, patch: Partial<CardDraft>) {
    setCards((current) => current.map((card) => (card.id === id ? { ...card, ...patch } : card)));
  }

  function addCard() {
    setCards((current) => [...current, EMPTY_CARD()]);
  }

  function removeCard(id: string) {
    setCards((current) => (current.length > 1 ? current.filter((card) => card.id !== id) : current));
  }

  return (
    <div className="shell">
      <section className="hero">
        <p className="eyebrow">ArcanaWiki PWA</p>
        <h1>用可引用的 Tarot Wiki，整理一段比較清楚的回應。</h1>
        <p className="lede">
          這個介面只提供本機或小範圍測試使用。解讀偏向象徵、反思與行動選擇，不把牌義包裝成確定命運。
        </p>
      </section>

      <section className="panel">
        <form className="chat-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>問題</span>
            <textarea
              name="question"
              placeholder="例如：聖杯二逆位，對方最近很冷淡，我該怎麼理解這段關係？"
              rows={5}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              required
            />
          </label>

          <div className="mode-grid" role="radiogroup" aria-label="回答模式">
            {[
              ["gentle", "gentle", "偏溫和，適合整理情緒。"],
              ["direct", "direct", "偏直接，聚焦目前張力。"],
              ["reflective", "reflective", "偏反思，保留更多自我觀察。"]
            ].map(([value, label, help]) => (
              <label className={`mode-card${mode === value ? " active" : ""}`} key={value}>
                <input
                  type="radio"
                  name="mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value as "gentle" | "direct" | "reflective")}
                />
                <strong>{label}</strong>
                <span>{help}</span>
              </label>
            ))}
          </div>

          <div className="cards-block">
            <div className="cards-header">
              <div>
                <h2>可選牌卡</h2>
                <p>如果你已經抽牌，可以補上牌名、正逆位與位置。</p>
              </div>
              <button className="secondary-button" type="button" onClick={addCard}>
                新增牌卡
              </button>
            </div>

            {cards.map((card, index) => (
              <div className="card-row" key={card.id}>
                <label className="field">
                  <span>牌卡 {index + 1}</span>
                  <input
                    list="tarot-card-options"
                    value={card.cardId}
                    onChange={(event) => updateCard(card.id, { cardId: event.target.value })}
                    placeholder="例如：cups-02"
                  />
                </label>

                <label className="field">
                  <span>方向</span>
                  <select
                    value={card.orientation}
                    onChange={(event) =>
                      updateCard(card.id, {
                        orientation: event.target.value as CardDraft["orientation"]
                      })
                    }
                  >
                    <option value="unknown">未知</option>
                    <option value="upright">正位</option>
                    <option value="reversed">逆位</option>
                  </select>
                </label>

                <label className="field">
                  <span>位置</span>
                  <input
                    value={card.position}
                    onChange={(event) => updateCard(card.id, { position: event.target.value })}
                    placeholder="例如：現況"
                  />
                </label>

                <button
                  aria-label={`移除第 ${index + 1} 張牌`}
                  className="ghost-button"
                  disabled={cards.length === 1}
                  type="button"
                  onClick={() => removeCard(card.id)}
                >
                  移除
                </button>
              </div>
            ))}

            <datalist id="tarot-card-options">
              {cardOptions.map((option) => (
                <option key={option.cardId} value={option.cardId}>
                  {option.title}
                </option>
              ))}
            </datalist>
          </div>

          {debugEnabled ? (
            <label className="debug-toggle">
              <input checked={debug} type="checkbox" onChange={(event) => setDebug(event.target.checked)} />
              <span>本機 debug mode</span>
            </label>
          ) : null}

          <button className="primary-button" disabled={loading} type="submit">
            {loading ? "解讀中..." : "送出問題"}
          </button>
        </form>
      </section>

      <section className="panel response-panel" aria-live="polite">
        <div className="response-header">
          <h2>回應</h2>
          <p>回答只會顯示使用到的來源摘要，不直接曝露內部檢索內容。</p>
        </div>

        {error ? <p className="error-banner">{error}</p> : null}

        {result ? (
          <div className="response-content">
            <article className="answer-card">
              <h3>直接解讀</h3>
              <p>{result.answer}</p>
            </article>

            <article className="sources-card">
              <h3>來源摘要</h3>
              {result.selectedSources.length > 0 ? (
                <ul className="source-list">
                  {result.selectedSources.map((source) => (
                    <li key={`${source.pageId}-${source.sectionTitle ?? "overview"}`}>
                      <strong>{source.title}</strong>
                      <span>{source.sectionTitle ?? "Overview"}</span>
                      <code>{source.pageId}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">這次沒有足夠的選取來源，因此系統只回傳保守 fallback。</p>
              )}
            </article>

            {debugEnabled && result.diagnostics ? (
              <details className="debug-panel">
                <summary>Debug diagnostics</summary>
                <pre>{JSON.stringify(result.diagnostics, null, 2)}</pre>
              </details>
            ) : null}
          </div>
        ) : (
          <p className="placeholder">送出問題後，這裡會顯示回答與來源摘要。</p>
        )}
      </section>
    </div>
  );
}
