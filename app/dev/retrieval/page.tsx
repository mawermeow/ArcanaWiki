import React from "react";
import { inspectRetrievalQuery } from "../../../lib/retrieval-inspector/inspect-query.ts";
import { isRetrievalDebugEnabled } from "../../../lib/pwa/env.ts";
import {
  cn,
  eyebrowClass,
  fieldClass,
  fieldLabelClass,
  mutedTextClass,
  pageClass,
  panelPaddingClass,
  primaryButtonClass
} from "../../../lib/ui/classes.ts";

function renderList(values: string[]): string {
  return values.length > 0 ? values.join(" / ") : "(none)";
}

export default async function RetrievalInspectorPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isRetrievalDebugEnabled()) {
    return (
      <main className={cn(pageClass, "grid gap-5")}>
        <section className={panelPaddingClass}>
          <p className={mutedTextClass}>
            Retrieval inspector is only available when `TAROT_DEBUG_RETRIEVAL=true`.
          </p>
        </section>
      </main>
    );
  }

  const resolved = (await searchParams) ?? {};
  const rawQuery = resolved.q;
  const query = Array.isArray(rawQuery) ? rawQuery[0] : rawQuery;
  const inspection = query ? await inspectRetrievalQuery({ query }) : null;
  const resultGroups = inspection
    ? [
        { label: "BM25", results: inspection.bm25.topResults },
        { label: "Vector", results: inspection.vector.topResults },
        { label: "Hybrid", results: inspection.hybrid.topResults }
      ]
    : [];

  return (
    <main className={cn(pageClass, "grid gap-5")}>
      <section className={panelPaddingClass}>
        <p className={eyebrowClass}>Developer Only</p>
        <h1>Retrieval Inspector</h1>
        <form className="grid gap-[18px]" action="/dev/retrieval" method="get">
          <label className={fieldClass}>
            <span className={fieldLabelClass}>Query</span>
            <input defaultValue={query ?? ""} name="q" placeholder="例如：對方最近很冷淡" />
          </label>
          <button className={primaryButtonClass} type="submit">
            Inspect
          </button>
        </form>
      </section>

      {inspection ? (
        <>
          <section className={panelPaddingClass}>
            <h2>Hybrid Summary</h2>
            <p>Tokenized query: {renderList(inspection.tokenizedQuery)}</p>
            <p>Failure causes: {renderList(inspection.analysis.failureCauses)}</p>
            <p>Notes: {renderList(inspection.analysis.notes)}</p>
          </section>

          <section className={panelPaddingClass}>
            <h2>Top Results</h2>
            <div className="grid grid-cols-3 gap-3.5 max-[920px]:grid-cols-1">
              {resultGroups.map((group) => (
                <article
                  className="grid gap-3 rounded-md border border-line bg-paper-strong p-[18px]"
                  key={group.label}
                >
                  <h3>{group.label}</h3>
                  <ul className="m-0 grid list-none gap-3 p-0">
                    {group.results.map((result) => (
                      <li
                        className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4 rounded-md border border-line/50 bg-bg-accent/28 p-4"
                        key={`${group.label}-${result.chunkId}`}
                      >
                        <strong>{result.title}</strong>
                        <span>{result.sectionTitle}</span>
                        <code>{result.pageId}</code>
                        <small>score={result.finalScore ?? result.score}</small>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>

          <section className={panelPaddingClass}>
            <h2>Score Breakdown</h2>
            <pre className="m-0 overflow-auto text-[0.85rem] break-words whitespace-pre-wrap">
              {JSON.stringify(inspection.hybrid.scoreBreakdown, null, 2)}
            </pre>
          </section>

          <section className={panelPaddingClass}>
            <h2>Selected Chunks</h2>
            <pre className="m-0 overflow-auto text-[0.85rem] break-words whitespace-pre-wrap">
              {JSON.stringify(inspection.hybrid.selectedChunksPreview, null, 2)}
            </pre>
          </section>
        </>
      ) : (
        <section className={panelPaddingClass}>
          <p className={mutedTextClass}>
            輸入 query 後，這裡會顯示 BM25 / vector / hybrid 與 selected chunk 摘要。
          </p>
        </section>
      )}
    </main>
  );
}
