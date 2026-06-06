# Retrieval Architecture Notes

## Scope

目前實作：

- `wiki -> BM25 -> retrieval`
- `wiki chunks -> vector-cache -> vector search`
- `BM25 + vector + relations/graph.json -> hybrid retrieval + rerank`

仍不包含 graph DB、web server、answer generation。

## Module Layout

- `lib/retrieval/wiki-loader.ts`
  讀取 `wiki/**/*.md`，解析 frontmatter、headings、keywords、tags、topics、related cards / spreads。
- `lib/retrieval/chunking.ts`
  以語意區塊切 chunk。主要依 `##` 與 `###` headings 切分，`情境解讀` 會進一步拆成 `感情 / 工作 / 自我探索 / 靈性` 子 chunk。
- `lib/retrieval/tokenizer.ts`
  支援中英文混合；保護 tarot phrases，例如 `女祭司`、`聖杯二逆位`、`The Hermit`、`upright/reversed`。
- `lib/retrieval/bm25-builder.ts`
  建立 deterministic 的本地 BM25 index。
- `lib/retrieval/bm25-searcher.ts`
  對 query 做 tokenize，計算 BM25 score，輸出 results 與 diagnostics。
- `lib/retrieval/evaluation.ts`
  讀取 evaluation dataset，計算 top1 / top3 / keyword / topic recall。
- `lib/retrieval/embedding-client.ts`
  唯一直接呼叫 OpenAI embeddings API 的模組。
- `lib/retrieval/vector-cache.ts`
  建立 vector text、content hash、incremental cache plan 與 cache builder。
- `lib/retrieval/vector-searcher.ts`
  讀取 query vector 後做 cosine similarity 排序，輸出 vector results 與 diagnostics。
- `lib/retrieval/vector-evaluation.ts`
  讀取 evaluation dataset，計算 top1 / top3 / top5 / topic / card recall。
- `lib/retrieval/graph-loader.ts`
  讀取 `relations/graph.json`，提供 graph expansion 所需資料。
- `lib/retrieval/hybrid-normalization.ts`
  負責 BM25 / cosine / graph score 的 0..1 normalization。
- `lib/retrieval/hybrid-searcher.ts`
  執行 hybrid search、score normalization、merge、dedupe、rerank、graph expansion、diagnostics。
- `lib/retrieval/hybrid-evaluation.ts`
  執行 hybrid retrieval evaluation，輸出 report / summary，並可比對既有 BM25 / vector report。
- `lib/retrieval-inspector/`
  developer-only retrieval diagnostics layer。整合 BM25 / vector / hybrid / graph expansion 結果，輸出 markdown report 與 JSON diagnostics。

## Chunking Strategy

- 不做固定字數切割。
- `Overview` chunk 由 page summary、前言、keywords、related cards 組成，讓牌名與主題查詢容易命中。
- 一般 `##` section 各自成為 chunk，例如 `正位意義`、`逆位意義`、`相關牌卡`。
- `情境解讀` 特別拆為 `情境解讀 > 感情`、`情境解讀 > 工作`、`情境解讀 > 自我探索`、`情境解讀 > 靈性`。
- chunk id 由 `pageId + section path` 組成，穩定且 deterministic。

## Tokenizer Strategy

- 使用溫和 normalization：NFKC、英文小寫、空白整理，不做 stemming。
- 先做 phrase protection，再做一般 tokenization。
- protected phrases 來自：
  - page title / titleZh / titleEn
  - tags
  - topics
  - keywords
  - tarot orientation aliases
- 若 phrase 命中 `聖杯二逆位` 之類 token，會額外保留基礎牌名與 `逆位` token。
- 對一般中文片段會保留片段本身，並補 2-gram / 3-gram，避免把口語查詢完全切碎。

## Determinism

- wiki page、chunk、term、posting 全部排序後再寫入 JSON。
- index metadata 不寫入 wall-clock timestamp。
- 相同 wiki 輸入會生成相同 `embeddings/bm25-index.json`。

## Vector Cache Strategy

- vector cache 輸出到 `embeddings/vector-cache.json`。
- 每個 chunk 的 embedding text 由 `title + section path + tags + topics + keywords + related cards + content` 組成。
- `contentHash` 以 embedding text 計算。
- incremental update 規則：
  - 同一個 `chunkId` 且 `contentHash` 未變：reuse 舊 embedding。
  - `contentHash` 改變：重新產生 embedding。
  - chunk 消失：保留 cache entry，但標記 `stale: true`。
- search 只讀取 active documents，不使用 stale entries。

## Query Embedding Behavior

- `index:vector` 一定需要 `OPENAI_API_KEY`。
- library 層 `searchWikiVector()` 可接受：
  - `queryVector`
  - `liveQueryEmbedding: true`
  - 自訂 `embedQuery`
- CLI 層 `search:vector` 預設不打 API，必須明確傳 `--live-query-embedding`。
- `eval:vector` 預設使用 live query embedding，因此也需要 `OPENAI_API_KEY`。
- `eval:hybrid` 預設不打 API。
- 只有 `pnpm eval:hybrid -- --live-query-embedding` 才會替 evaluation queries 產生新的 embeddings。
- 因此：
  - 離線 `eval:hybrid` 比較接近 `BM25 + graph` 的回歸檢查
  - live `eval:hybrid` 才是完整 `BM25 + vector + graph` 評估

## Hybrid Retrieval Flow

```txt
query
-> BM25 topK
-> Vector topK
-> score normalization
-> merge by chunkId
-> deduplicate
-> weighted rerank
-> optional graph expansion
-> final topK
```

預設權重：

- `bm25: 0.45`
- `vector: 0.55`
- `graph: 0.15`

## Rerank Rules

- 不使用 LLM reranker。
- direct signals：
  - normalized BM25 score
  - normalized vector cosine score
  - query keyword overlap
- lexical / metadata boosts：
  - exact card match
  - exact orientation match
  - topic match
  - tag match
- graph signals：
  - relation type weight
  - seed result strength
  - 1-hop distance penalty

## Graph Expansion Rules

- 只從 merged top direct results 擴張。
- 只做 1 hop。
- 預設最多補 3 個 graph-only results。
- relation type 目前支援：
  - `symbolic`
  - `emotional`
  - `archetype`
  - `narrative`
  - `contrast`
- graph-only results 會被排在 direct BM25/vector hits 後面，避免 graph domination。

## Diagnostics

- hybrid diagnostics 固定保留：
  - `bm25Results`
  - `vectorResults`
  - `normalizedScores`
  - `mergedResults`
  - `graphExpandedResults`
  - `rejectedResults`
  - `finalResults`
  - `weights`
  - `topK`
  - `timingMs`

## Retrieval Inspector

- inspector 不呼叫 OpenAI Chat API，也不接 LINE Bot。
- inspector 只讀取：
  - `embeddings/bm25-index.json`
  - `embeddings/vector-cache.json`
  - `relations/graph.json`
  - `eval/retrieval/bm25-evaluation-dataset.json`
- single-query inspection：
  - CLI：`pnpm inspect:retrieval -- "對方最近很冷淡"`
  - 輸出：`reports/inspector/latest-query.md`、`reports/inspector/latest-query.json`
- eval inspection：
  - CLI：`pnpm inspect:retrieval:eval`
  - 輸出：`reports/inspector/retrieval-eval-inspection.md`、`reports/inspector/retrieval-eval-inspection.json`
- single-query report 至少包含：
  - query / tokenized query
  - BM25 top results
  - Vector top results
  - Hybrid final results
  - Graph-expanded results
  - rejected results
  - score breakdown
  - matched terms
  - selected chunks preview
  - possible issues
- eval inspection 會聚合：
  - expected cards / topics / keywords
  - BM25 / Vector / Hybrid hit status
  - top1 / top3 / top5 比較
  - failure cases / likely cause
- failure cause taxonomy：
  - `missing-wiki-content`
  - `bad-tokenization`
  - `bad-metadata`
  - `weak-vector-match`
  - `bad-score-normalization`
  - `graph-noise`
  - `unknown`

## Determinism

- merge / dedupe / rerank / graph expansion 全部使用 deterministic 排序規則。
- 同分時以 `chunkId` 做穩定 tie-break。
- 不使用 LLM 做 rerank 或 answer selection。
