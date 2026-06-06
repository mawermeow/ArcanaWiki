import React from "react";
import { inspectRetrievalQuery } from "../../../lib/retrieval-inspector/inspect-query.ts";
import { isRetrievalDebugEnabled } from "../../../lib/pwa/env.ts";

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
      <main className="page dev-page">
        <section className="panel">
          <p className="placeholder">Retrieval inspector is only available when `TAROT_DEBUG_RETRIEVAL=true`.</p>
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
    <main className="page dev-page">
      <section className="panel">
        <p className="eyebrow">Developer Only</p>
        <h1>Retrieval Inspector</h1>
        <form className="dev-form" action="/dev/retrieval" method="get">
          <label className="field">
            <span>Query</span>
            <input defaultValue={query ?? ""} name="q" placeholder="例如：對方最近很冷淡" />
          </label>
          <button className="primary-button" type="submit">
            Inspect
          </button>
        </form>
      </section>

      {inspection ? (
        <>
          <section className="panel">
            <h2>Hybrid Summary</h2>
            <p>Tokenized query: {renderList(inspection.tokenizedQuery)}</p>
            <p>Failure causes: {renderList(inspection.analysis.failureCauses)}</p>
            <p>Notes: {renderList(inspection.analysis.notes)}</p>
          </section>

          <section className="panel">
            <h2>Top Results</h2>
            <div className="results-grid">
              {resultGroups.map((group) => (
                <article className="mini-panel" key={group.label}>
                  <h3>{group.label}</h3>
                  <ul className="inspector-list">
                    {group.results.map((result) => (
                      <li key={`${group.label}-${result.chunkId}`}>
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

          <section className="panel">
            <h2>Score Breakdown</h2>
            <pre className="debug-pre">{JSON.stringify(inspection.hybrid.scoreBreakdown, null, 2)}</pre>
          </section>

          <section className="panel">
            <h2>Selected Chunks</h2>
            <pre className="debug-pre">{JSON.stringify(inspection.hybrid.selectedChunksPreview, null, 2)}</pre>
          </section>
        </>
      ) : (
        <section className="panel">
          <p className="placeholder">輸入 query 後，這裡會顯示 BM25 / vector / hybrid 與 selected chunk 摘要。</p>
        </section>
      )}
    </main>
  );
}
