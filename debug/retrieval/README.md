# Retrieval Inspector

這個資料夾保留 BM25 retrieval 的開發者檢視輸出，不提供 UI。

主要檔案：

- `latest-search.json`
  由 `pnpm search:bm25 -- --query="..."` 產生，包含 query、tokenized query、matched documents、scores、rejected results。
- `eval-traces.json`
  由 `pnpm eval:bm25` 產生，保留每個 evaluation query 的 results 與 diagnostics。
