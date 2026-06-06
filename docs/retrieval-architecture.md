# Retrieval Architecture Notes

## Scope

目前只實作 `wiki -> BM25 -> retrieval`。不包含 vector search、graph DB、web server，也不直接串接 OpenAI API。

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

## Future Vector Retrieval

未來若要接 vector retrieval，建議保持以下邊界：

1. BM25 與 vector index 各自獨立建檔。
2. query diagnostics 保留 `bm25 topK` 與 `vector topK`。
3. merge/rerank 在獨立模組完成，不回寫 BM25 index。
4. relations/graph expansion 只在 BM25 + vector 合併後做有限擴張。
