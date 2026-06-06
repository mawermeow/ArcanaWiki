"use client";

import React, { useMemo, useState, type FormEvent } from "react";
import { formatAnswerForDisplay } from "../lib/answer/citation-validator.ts";
import type { ChatApiResponse } from "../lib/pwa/chat-api.ts";
import type { TarotCardOption } from "../lib/pwa/card-catalog.ts";
import { TarotCardThumb } from "./tarot-card-thumb.tsx";

type CardDraft = {
  id: string;
  cardId: string;
  orientation: "upright" | "reversed" | "unknown";
  position: string;
};

type TarotChatClientProps = {
  cardOptions: TarotCardOption[];
  debugEnabled: boolean;
  initialCardId?: string;
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
  initialCardId,
  requestChat
}: TarotChatClientProps) {
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<"gentle" | "direct" | "reflective">("gentle");
  const [cards, setCards] = useState<CardDraft[]>(() => [
    {
      ...EMPTY_CARD(),
      cardId: initialCardId?.trim() ?? ""
    }
  ]);
  const [debug, setDebug] = useState(false);
  const [autoDraw, setAutoDraw] = useState(false);
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
          cards: autoDraw ? [] : activeCards,
          mode,
          autoDraw,
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
        <p className="hero-link-row">
          <a className="ghost-link" href="/wiki">
            瀏覽 Public Tarot Wiki
          </a>
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

          <label className="auto-draw-card">
            <input
              checked={autoDraw}
              type="checkbox"
              onChange={(event) => setAutoDraw(event.target.checked)}
            />
            <div>
              <strong>沒有手邊的牌，請系統幫我選牌陣並抽牌</strong>
              <span>系統會根據問題挑一個合適的牌陣，再自動抽牌作為這次解讀的起點。</span>
            </div>
          </label>

          <div className={`cards-block${autoDraw ? " disabled" : ""}`}>
            <div className="cards-header">
              <div>
                <h2>可選牌卡</h2>
                <p>
                  {autoDraw
                    ? "已改用自動抽牌。若想手動輸入，先取消上方快捷選項。"
                    : "如果你已經抽牌，可以補上牌名、正逆位與位置。"}
                </p>
              </div>
              <button className="secondary-button" disabled={autoDraw} type="button" onClick={addCard}>
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
                    disabled={autoDraw}
                    onChange={(event) => updateCard(card.id, { cardId: event.target.value })}
                    placeholder="例如：cups-02"
                  />
                </label>

                <label className="field">
                  <span>方向</span>
                  <select
                    value={card.orientation}
                    disabled={autoDraw}
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
                    disabled={autoDraw}
                    onChange={(event) => updateCard(card.id, { position: event.target.value })}
                    placeholder="例如：現況"
                  />
                </label>

                <button
                  aria-label={`移除第 ${index + 1} 張牌`}
                  className="ghost-button"
                  disabled={cards.length === 1 || autoDraw}
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
          <div>
            <p className="eyebrow">Reading</p>
            <h2>回應</h2>
          </div>
          <p>先看你抽到的牌，再閱讀解讀與引用來源。</p>
        </div>

        {error ? <p className="error-banner">{error}</p> : null}

        {loading ? (
          <div className="response-placeholder response-loading" aria-busy="true">
            <p className="response-placeholder-title">解讀整理中</p>
            <p className="muted">系統正在整理牌義與可引用的 wiki 來源。</p>
          </div>
        ) : null}

        {!loading && result ? (
          <div className="response-content">
            {result.generatedReading ? (
              <article className="response-section spread-section">
                <div className="response-section-heading">
                  <p className="response-section-eyebrow">Spread</p>
                  <h3>這次自動抽到的牌陣</h3>
                </div>
                <div className="spread-meta">
                  <span className="spread-badge">{result.generatedReading.spreadTitle}</span>
                  <span className="spread-id">{result.generatedReading.spreadId}</span>
                </div>
                <div className="spread-card-grid">
                  {result.generatedReading.cards.map((card) => (
                    <div className="spread-card-tile" key={`${card.cardId}-${card.position}`}>
                      <TarotCardThumb
                        cardId={card.cardId}
                        className="spread-card-image"
                        orientation={card.orientation}
                        title={card.title}
                      />
                      <div className="spread-card-copy">
                        <span className="spread-card-position">{card.position ?? "未指定位置"}</span>
                        <strong>{card.title}</strong>
                        <span
                          className={`orientation-badge${card.orientation === "reversed" ? " reversed" : ""}`}
                        >
                          {card.orientation === "reversed" ? "逆位" : "正位"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ) : null}

            <article className="response-section answer-section">
              <div className="response-section-heading">
                <p className="response-section-eyebrow">Interpretation</p>
                <h3>直接解讀</h3>
              </div>
              <div className="answer-body">
                <p>{formatAnswerForDisplay(result.answer)}</p>
              </div>
            </article>

            <article className="response-section sources-section">
              <div className="response-section-heading">
                <p className="response-section-eyebrow">Sources</p>
                <h3>引用來源與摘要</h3>
              </div>
              {result.selectedSources.length > 0 ? (
                <ul className="citation-list">
                  {result.selectedSources.map((source) => (
                    <li
                      className="citation-item"
                      key={`${source.pageId}-${source.sectionTitle ?? "overview"}`}
                    >
                      <TarotCardThumb
                        cardId={source.pageId}
                        className="citation-card-image"
                        title={source.title}
                      />
                      <div className="citation-copy">
                        <div className="citation-meta">
                          <strong>{source.title}</strong>
                          <span className="citation-section">
                            {source.sectionTitle ?? "Overview"}
                          </span>
                        </div>
                        <span className="citation-ref">
                          {source.pageId}
                          {source.chunkId ? `#${source.chunkId}` : ""}
                        </span>
                        {source.summary ? <p className="citation-summary">{source.summary}</p> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="response-empty-note">
                  這次沒有足夠的選取來源，因此系統只回傳保守 fallback。
                </p>
              )}
            </article>

            {debugEnabled && result.diagnostics ? (
              <details className="debug-panel">
                <summary>Debug diagnostics</summary>
                <pre>{JSON.stringify(result.diagnostics, null, 2)}</pre>
              </details>
            ) : null}
          </div>
        ) : null}

        {!loading && !result ? (
          <div className="response-placeholder">
            <p className="response-placeholder-title">等待你的問題</p>
            <p className="muted">送出問題後，這裡會依序顯示牌陣、解讀與引用來源摘要。</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
