# ArcanaWiki

Tarot LLM Wiki + retrieval playground。知識來源目前以 `wiki/` 為主，索引與 diagnostics 皆維持本地檔案。

## Retrieval

第一版 retrieval 目前採用離線 BM25：

- 語言與 runtime：NodeJS + TypeScript
- 索引來源：`wiki/**/*.md`
- 索引輸出：`embeddings/bm25-index.json`
- evaluation dataset：`eval/retrieval/bm25-evaluation-dataset.json`
- evaluation reports：`reports/bm25-eval.json`、`reports/bm25-summary.md`
- inspector output：`debug/retrieval/latest-search.json`、`debug/retrieval/eval-traces.json`

### Commands

```bash
pnpm index:bm25
pnpm search:bm25 -- --query="聖杯二逆位"
pnpm eval:bm25
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

### Future Extension

未來若加入 vector retrieval，建議保留 BM25 為獨立模組，再新增：

1. 獨立的 vector index builder
2. query embedding pipeline
3. merge / rerank layer
4. graph expansion layer

目前不實作 vector search。
