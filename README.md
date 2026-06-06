# ArcanaWiki

Tarot LLM Wiki + retrieval playground。知識來源目前以 `wiki/` 為主，索引與 diagnostics 皆維持本地檔案。

## Retrieval

目前 retrieval 包含：

- 語言與 runtime：NodeJS + TypeScript
- 索引來源：`wiki/**/*.md`
- 索引輸出：`embeddings/bm25-index.json`
- vector cache：`embeddings/vector-cache.json`
- evaluation dataset：`eval/retrieval/bm25-evaluation-dataset.json`
- evaluation reports：`reports/bm25-eval.json`、`reports/bm25-summary.md`
- vector reports：`reports/vector-eval.json`、`reports/vector-summary.md`
- inspector output：`debug/retrieval/latest-search.json`、`debug/retrieval/eval-traces.json`、`debug/retrieval/latest-vector-search.json`

### Commands

```bash
pnpm index:bm25
pnpm index:vector
pnpm search:bm25 -- --query="聖杯二逆位"
pnpm search:vector -- "對方最近很冷淡" --live-query-embedding
pnpm eval:bm25
pnpm eval:vector
pnpm test
```

### Chunking Strategy

- 以 markdown headings 為主，不做固定字數切塊。
- `情境解讀` 會再拆成 `感情 / 工作 / 自我探索 / 靈性` 子 chunk。
- 每個 chunk 都有穩定 `chunkId`、`pageId`、`sectionTitle`。

### Tokenizer Strategy

- 保留中英文混合 query。
- 優先保護 tarot phrases，如 `女祭司`、`聖杯二逆位`、`The Hermit`、`reversed`。
- 不做 aggressive normalization，也不做 stemming。

### Vector Cache Strategy

- `index:vector` 會沿用現有 wiki chunks，對每個 chunk 產生 embedding text 與 `contentHash`。
- 若 `chunkId + contentHash + embeddingModel` 都沒變，會 reuse 舊 embedding。
- 若 chunk 內容改變，才會重新呼叫 OpenAI embeddings API。
- 若 chunk 已不存在，cache entry 會標記為 `stale: true`，search 會自動忽略。
- `search:vector` 預設不打 OpenAI API；需要加 `--live-query-embedding` 才會對 query 做 live embedding。

### Future Extension

未來若加入 hybrid retrieval，建議保留 BM25 與 vector 各自獨立，再新增：

1. merge / rerank layer
2. graph expansion layer
3. answer selection policy

目前不實作 hybrid merge。
