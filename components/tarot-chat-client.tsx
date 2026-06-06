"use client";

import React, { useMemo, useState, type FormEvent } from "react";
import { formatAnswerForDisplay } from "../lib/answer/citation-validator.ts";
import type { ChatApiResponse } from "../lib/pwa/chat-api.ts";
import type { TarotCardOption } from "../lib/pwa/card-catalog.ts";
import {
  cn,
  eyebrowClass,
  fieldClass,
  fieldLabelClass,
  ghostButtonClass,
  ghostLinkClass,
  heroClass,
  mutedTextClass,
  panelPaddingClass,
  primaryButtonClass,
  secondaryButtonClass,
  sectionEyebrowClass
} from "../lib/ui/classes.ts";
import { PanelSectionHeader } from "./panel-section-header.tsx";
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

function buildPublicWikiHref(pageId: string): string {
  return `/wiki/${encodeURIComponent(pageId)}`;
}

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
    <div className="grid gap-5">
      <section className={heroClass}>
        <p className={eyebrowClass}>ArcanaWiki</p>
        <h1>留下你的問題，從牌義與脈絡裡整理思緒。</h1>
        <p className={cn(mutedTextClass, "mt-0")}>
          解讀會依可查的塔羅牌義展開，協助你理解眼前的狀況。我們偏向象徵、反思與行動選擇，不會用命定式的語氣替你下結論。
        </p>
      </section>

      <section className={panelPaddingClass}>
        <PanelSectionHeader eyebrow="Question" title="問題" titleId="tarot-question-heading" />
        <form className="grid gap-[18px]" onSubmit={handleSubmit}>
          <label className={fieldClass}>
            <textarea
              aria-labelledby="tarot-question-heading"
              name="question"
              placeholder="例如：聖杯二逆位，對方最近很冷淡，我該怎麼理解這段關係？"
              rows={5}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              required
            />
          </label>

          <div className="grid grid-cols-3 gap-3 max-[920px]:grid-cols-1" role="radiogroup" aria-label="回答模式">
            {[
              ["gentle", "gentle", "偏溫和，適合整理情緒。"],
              ["direct", "direct", "偏直接，聚焦目前張力。"],
              ["reflective", "reflective", "偏反思，保留更多自我觀察。"]
            ].map(([value, label, help]) => (
              <label
                className={cn(
                  "grid cursor-pointer gap-1.5 rounded-md border p-4",
                  mode === value
                    ? "border-accent/42 bg-accent-soft"
                    : "border-line bg-surface-soft"
                )}
                key={value}
              >
                <input
                  className="hidden"
                  type="radio"
                  name="mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value as "gentle" | "direct" | "reflective")}
                />
                <strong>{label}</strong>
                <span className="text-[0.9rem] text-muted">{help}</span>
              </label>
            ))}
          </div>

          <label
            className={cn(
              "grid grid-cols-[auto_1fr] items-center gap-3.5 rounded-md border px-[18px] py-4",
              autoDraw
                ? "border-accent/42 bg-accent-soft"
                : "border-line bg-surface-soft"
            )}
          >
            <input
              checked={autoDraw}
              type="checkbox"
              onChange={(event) => setAutoDraw(event.target.checked)}
            />
            <div>
              <strong className="mb-1.5 block">沒有手邊的牌，請系統幫我選牌陣並抽牌</strong>
              <span className="text-[0.94rem] text-muted">
                系統會根據問題挑一個合適的牌陣，再自動抽牌作為這次解讀的起點。
              </span>
            </div>
          </label>

          <div className={cn("grid gap-[18px]", autoDraw && "opacity-[0.62]")}>
            <div className="flex items-end justify-between gap-4 max-[920px]:flex-col max-[920px]:items-stretch">
              <div>
                <h2>可選牌卡</h2>
                <p className={mutedTextClass}>
                  {autoDraw
                    ? "已改用自動抽牌。若想手動輸入，先取消上方快捷選項。"
                    : "如果你已經抽牌，可以補上牌名、正逆位與位置。"}
                </p>
              </div>
              <button className={secondaryButtonClass} disabled={autoDraw} type="button" onClick={addCard}>
                新增牌卡
              </button>
            </div>

            {cards.map((card, index) => (
              <div
                className="grid grid-cols-[minmax(0,2fr)_minmax(140px,0.8fr)_minmax(0,1fr)_auto] items-end gap-3 rounded-md border border-line bg-surface-muted p-4 max-[920px]:grid-cols-1"
                key={card.id}
              >
                <label className={fieldClass}>
                  <span className={fieldLabelClass}>牌卡 {index + 1}</span>
                  <select
                    value={card.cardId}
                    disabled={autoDraw}
                    onChange={(event) => updateCard(card.id, { cardId: event.target.value })}
                  >
                    <option value="">選擇牌卡</option>
                    {cardOptions.map((option) => (
                      <option key={option.cardId} value={option.cardId}>
                        {option.displayLabel}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={fieldClass}>
                  <span className={fieldLabelClass}>方向</span>
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

                <label className={fieldClass}>
                  <span className={fieldLabelClass}>位置</span>
                  <input
                    value={card.position}
                    disabled={autoDraw}
                    onChange={(event) => updateCard(card.id, { position: event.target.value })}
                    placeholder="例如：現況"
                  />
                </label>

                <button
                  aria-label={`移除第 ${index + 1} 張牌`}
                  className={ghostButtonClass}
                  disabled={cards.length === 1 || autoDraw}
                  type="button"
                  onClick={() => removeCard(card.id)}
                >
                  移除
                </button>
              </div>
            ))}

          </div>

          {debugEnabled ? (
            <label className="inline-flex items-center gap-2.5 text-muted">
              <input checked={debug} type="checkbox" onChange={(event) => setDebug(event.target.checked)} />
              <span>本機 debug mode</span>
            </label>
          ) : null}

          <button className={primaryButtonClass} disabled={loading} type="submit">
            {loading ? "解讀中..." : "送出問題"}
          </button>
        </form>
      </section>

      <section className={cn(panelPaddingClass, "p-7 max-[640px]:p-5")} aria-live="polite">
        <PanelSectionHeader eyebrow="Reading" title="回應" />

        {error ? (
          <p className="m-0 rounded-sm bg-accent/12 px-4 py-3.5 text-accent-strong">{error}</p>
        ) : null}

        {loading ? (
          <div
            className="grid gap-2 rounded-md border border-dashed border-line/50 px-6 py-7 text-center"
            style={{
              background:
                "linear-gradient(135deg, rgb(219 231 223 / 0.42), rgb(255 250 240 / 0.72)), rgb(255 255 255 / 0.42)"
            }}
            aria-busy="true"
          >
            <p className="m-0 font-serif text-[1.2rem] font-bold">解讀整理中</p>
            <p className={mutedTextClass}>系統正在整理牌義與可引用的 wiki 來源。</p>
          </div>
        ) : null}

        {!loading && result ? (
          <div className="grid gap-[22px]">
            {result.generatedReading ? (
              <article
                className="grid gap-4 rounded-md border border-line p-[22px] max-[640px]:p-[18px]"
                style={{
                  background:
                    "linear-gradient(180deg, rgb(219 231 223 / 0.34), rgb(255 250 240 / 0.96)), var(--color-paper-strong)"
                }}
              >
                <div className="grid gap-1">
                  <p className={sectionEyebrowClass}>Spread</p>
                  <h3>這次自動抽到的牌陣</h3>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="inline-flex items-center rounded-full bg-ink/8 px-3.5 py-2 font-bold text-ink">
                    {result.generatedReading.spreadTitle}
                  </span>
                  <span className="text-[0.86rem] text-muted">{result.generatedReading.spreadId}</span>
                </div>
                <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(148px,1fr))] max-[920px]:[grid-template-columns:repeat(auto-fit,minmax(132px,1fr))] max-[640px]:flex max-[640px]:snap-x max-[640px]:snap-mandatory max-[640px]:gap-3 max-[640px]:overflow-x-auto max-[640px]:pb-1">
                  {result.generatedReading.cards.map((card) => (
                    <div
                      className="grid gap-3 rounded-[18px] border border-line/50 bg-surface-soft p-3.5 max-[640px]:w-[min(72vw,180px)] max-[640px]:shrink-0 max-[640px]:snap-start"
                      key={`${card.cardId}-${card.position}`}
                    >
                      <TarotCardThumb
                        cardId={card.cardId}
                        className="mx-auto w-full max-w-[132px]"
                        orientation={card.orientation}
                        title={card.title}
                      />
                      <div className="grid gap-1.5">
                        <span className="text-[0.78rem] font-bold tracking-[0.08em] text-accent uppercase">
                          {card.position ?? "未指定位置"}
                        </span>
                        <strong className="font-serif text-base leading-[1.35]">{card.title}</strong>
                        <span
                          className={cn(
                            "inline-flex self-start rounded-full px-2.5 py-1 text-[0.82rem] font-semibold",
                            card.orientation === "reversed"
                              ? "bg-accent/14 text-accent-strong"
                              : "bg-sage-soft text-sage"
                          )}
                        >
                          {card.orientation === "reversed" ? "逆位" : "正位"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ) : null}

            <article
              className="grid gap-4 rounded-md border border-accent/18 bg-paper-strong p-[22px] max-[640px]:p-[18px]"
              style={{
                background:
                  "linear-gradient(135deg, rgb(184 92 56 / 0.05), rgb(255 250 240 / 0.98)), var(--color-paper-strong)"
              }}
            >
              <div className="grid gap-1">
                <p className={sectionEyebrowClass}>Interpretation</p>
                <h3>直接解讀</h3>
              </div>
              <div className="rounded-r-[14px] border-l-[3px] border-accent/42 bg-surface-muted px-5 py-[18px]">
                <p className="m-0 font-serif text-[1.05rem] leading-[1.9] whitespace-pre-wrap">
                  {formatAnswerForDisplay(result.answer)}
                </p>
              </div>
            </article>

            <article className="grid gap-4 rounded-md border border-line bg-surface-soft p-[22px] max-[640px]:p-[18px]">
              <div className="grid gap-1">
                <p className={sectionEyebrowClass}>Sources</p>
                <h3>引用來源與摘要</h3>
              </div>
              {result.selectedSources.length > 0 ? (
                <ul className="m-0 grid list-none gap-3 p-0">
                  {result.selectedSources.map((source) => (
                    <li
                      className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4 rounded-md border border-line/50 bg-bg-accent/28 p-4 max-[640px]:grid-cols-1"
                      key={`${source.pageId}-${source.sectionTitle ?? "overview"}`}
                    >
                      <TarotCardThumb
                        cardId={source.pageId}
                        className="w-16 max-[640px]:w-[72px]"
                        title={source.title}
                      />
                      <div className="grid min-w-0 gap-2">
                        <div className="grid gap-1">
                          <strong className="font-serif text-base leading-[1.35]">
                            <a
                              className="border-b border-transparent no-underline hover:border-current"
                              href={buildPublicWikiHref(source.pageId)}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {source.title}
                            </a>
                          </strong>
                          <span className="text-[0.92rem] text-muted">
                            {source.sectionTitle ?? "Overview"}
                          </span>
                        </div>
                        <span className="inline-flex self-start rounded-full bg-ink/6 px-2.5 py-1 font-mono text-[0.78rem] text-muted">
                          {source.pageId}
                          {source.chunkId ? `#${source.chunkId}` : ""}
                        </span>
                        {source.summary ? (
                          <p className="m-0 pt-1 leading-[1.7] text-ink">{source.summary}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 rounded-sm bg-bg-accent/28 px-[18px] py-4 leading-[1.65] text-muted">
                  這次沒有足夠的選取來源，因此系統只回傳保守 fallback。
                </p>
              )}
            </article>

            {debugEnabled && result.diagnostics ? (
              <details className="overflow-auto rounded-md bg-debug-bg p-4 text-debug">
                <summary>Debug diagnostics</summary>
                <pre className="m-0 text-[0.85rem] break-words whitespace-pre-wrap">
                  {JSON.stringify(result.diagnostics, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>
        ) : null}

        {!loading && !result ? (
          <div className="grid gap-2 rounded-md border border-dashed border-line/50 bg-surface-faint px-6 py-7 text-center">
            <p className="m-0 font-serif text-[1.2rem] font-bold">等待你的問題</p>
            <p className={mutedTextClass}>送出問題後，這裡會依序顯示牌陣、解讀與引用來源摘要。</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
