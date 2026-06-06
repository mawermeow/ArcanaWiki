# ArcanaWiki

以 Karpathy-style LLM Wiki 管理的塔羅知識庫，搭配 Hybrid BM25 + Vector Search 檢索 compiled wiki，
再交給 LLM 產生可引用、可追溯、非宿命論的塔羅解讀。目前以 Next.js PWA 為主要入口，適合自用或小範圍測試；
索引與 diagnostics 皆以本地 JSON 檔案為主，不依赖 Postgres / pgvector / OpenSearch。

## 目前範圍

- 以 `wiki/**/*.md` 作為 runtime 主要知識來源（compiled knowledge layer）。
- 以 `raw/` 保存原始資料；wiki compile 與 runtime chat 分離。
- 建立 deterministic BM25 index：`embeddings/bm25-index.json`。
- 建立 incremental vector cache：`embeddings/vector-cache.json`。
- 使用 `relations/graph.json` 做 graph expansion。
- Hybrid retrieval：BM25 + vector + graph merge / rerank / dedupe。
- Answer pipeline：prompt builder → OpenAI Chat API → citation validation → safety validation。
- PWA 問答：`/` 提供問題輸入、手動選牌、自動抽牌陣、模式切換、回答與來源摘要。
- 公開 Wiki：`/wiki`、`/wiki/[category]/[pageId]`，只顯示 public-safe 內容。
- Chat API：`POST /api/chat`。
- Developer retrieval inspector：`/dev/retrieval`（僅在 `TAROT_DEBUG_RETRIEVAL=true` 時可用）。
- CLI：BM25 / vector / hybrid search、answer generation、retrieval eval、inspector reports。

尚未包含：LINE Bot runtime、streaming chat、Postgres、外部 vector DB、LLM reranker、正式帳號系統。

## 建議設定

目前 MVP 的預設方向：

- Embedding model：`text-embedding-3-small`
- Chat model：`gpt-4.1-mini`（可由 `OPENAI_CHAT_MODEL` 覆寫）
- Retrieval strategy：`hybrid`
- Final context topK：預設 5 到 8 個 wiki chunks
- Hybrid weights：`bm25=0.45`、`vector=0.55`、`graph=0.15`
- Secrets：建議用 direnv 從 repo 外部載入，不要提交 `.env`

更完整的模組說明見 [docs/retrieval-architecture.md](docs/retrieval-architecture.md)。

## 快速開始

前置需求：Node.js、pnpm、OpenAI API key（answer / live vector query 需要）。

```bash
pnpm install
pnpm index:bm25
pnpm index:vector
pnpm dev
```

開啟 `http://localhost:3000` 使用 PWA 問答；公開 wiki 在 `http://localhost:3000/wiki`。

若本機 secrets 放在 repo 外，可參考 AGENTS.md 使用 direnv：

```bash
# .envrc
source_env_if_exists ~/Secrets/ArcanaWiki/dev.env
```

先做一次 CLI smoke test：

```bash
pnpm search:hybrid -- "聖杯二逆位 感情"
pnpm answer -- "聖杯二逆位，對方最近很冷淡，這段關係還有希望嗎？"
```

## 常用指令

| 任務 | 指令 |
| --- | --- |
| 安裝依賴 | `pnpm install` |
| 啟動開發伺服器 | `pnpm dev` |
| 建置 production app | `pnpm build` |
| 啟動 production app | `pnpm start` |
| 建立 BM25 index | `pnpm index:bm25` |
| 建立 vector cache | `pnpm index:vector` |
| BM25 搜尋 | `pnpm search:bm25 -- --query="聖杯二逆位"` |
| Vector 搜尋 | `pnpm search:vector -- "對方最近很冷淡" --live-query-embedding` |
| Hybrid 搜尋 | `pnpm search:hybrid -- "聖杯二逆位 感情"` |
| 產生塔羅解讀 | `pnpm answer -- "聖杯二逆位，對方最近很冷淡，這段關係還有希望嗎？"` |
| 檢視單次 retrieval | `pnpm inspect:retrieval -- "對方最近很冷淡"` |
| 檢視 eval retrieval | `pnpm inspect:retrieval:eval` |
| BM25 eval | `pnpm eval:bm25` |
| Vector eval | `pnpm eval:vector` |
| Hybrid eval（離線） | `pnpm eval:hybrid` |
| Hybrid eval（live embedding） | `pnpm eval:hybrid -- --live-query-embedding` |
| Typecheck | `pnpm typecheck` |
| Wiki 測試 | `pnpm test:wiki` |
| Retrieval 測試 | `pnpm test:retrieval` |
| Answer 測試 | `pnpm test:answer` |
| PWA 測試 | `pnpm test:pwa` |
| 全部測試 | `pnpm test` |

## 設定

環境變數不強制使用 `TAROT_` 前綴以外的統一命名，但下列項目最常用。

回答與 embedding 必備（live answer / live query embedding）：

- `OPENAI_API_KEY`
- `OPENAI_CHAT_MODEL`
- `OPENAI_EMBEDDING_MODEL`
- `OPENAI_REQUEST_TIMEOUT_SECONDS`
- `OPENAI_MAX_RETRIES`
- `OPENAI_CHAT_MAX_COMPLETION_TOKENS`

Retrieval 相關：

- `TAROT_DEBUG_RETRIEVAL=true`：允許 PWA / dev page 回傳 diagnostics
- `TAROT_BM25_TOP_K`
- `TAROT_VECTOR_TOP_K`
- `TAROT_FINAL_CONTEXT_TOP_K`
- `TAROT_APP_MODE=local`

LINE Bot（規劃中，尚未接 runtime）：

- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `LINE_ALLOWED_USER_IDS`

請勿提交 `.env`、OpenAI key、LINE secrets、embedding cache 中的敏感資料，也不要把私人占卜紀錄或 LINE userId 寫進 git。

## 資料流程

```text
raw/
  -> wiki compile / 人工維護 wiki/
  -> chunking + tokenizer
  -> embeddings/bm25-index.json
  -> embeddings/vector-cache.json
  -> relations/graph.json

user question (+ optional cards / spread / autoDraw)
  -> hybrid retrieval
  -> select 5..8 wiki chunks
  -> prompt builder
  -> OpenAI Chat API
  -> citation validation
  -> safety validation
  -> answer + selectedSources (+ optional diagnostics)
```

Public Wiki 是另一條只讀流程：直接讀 `wiki/**/*.md`，清洗 internal-only 欄位後渲染 HTML，
不讀 `embeddings/`、`relations/graph.json` 或 answer diagnostics。

## API 介面

使用者面向：

- `POST /api/chat`
  - request：`question`、optional `cards[]`、optional `spreadId`、optional `mode`、optional `autoDraw`、optional `debug`
  - response：`answer`、`selectedSources[]`、`safety`、optional `generatedReading`、optional `diagnostics`

頁面路由：

- `/`：Tarot PWA
- `/wiki`：公開 wiki 列表
- `/wiki/[category]/[pageId]`：公開 wiki 內容頁
- `/dev/retrieval`：developer retrieval inspector（需 `TAROT_DEBUG_RETRIEVAL=true`）

PWA 資產：

- `app/icon.svg`：瀏覽器 favicon
- `public/brand-mark.svg`：頁面 logo / manifest icon
- `public/manifest.webmanifest`

## 檢索與回答品質

Hybrid retrieval 會保留 diagnostics，例如：

- BM25 / vector / graph topK
- normalized scores
- merged / rejected / final results
- selected wiki chunks
- graph-expanded chunks

Chat 回應的 `safety` 會暴露：

- `answerValid`
- `citationErrors`
- optional `cannotConfirmReason`

Citation 規則：

- 回答中的引用格式固定為 `[來源: pageId#chunkId]`
- 只能引用 selected sources
- 若 citation 無效或 context 不足，回傳保守 fallback，而不是輸出可能幻覺的內容

`diagnostics` 只有在 `debug=true` 且 `TAROT_DEBUG_RETRIEVAL=true` 時才會回傳；一般使用者不應看到 raw prompt、完整 retrieval scores 或 internal stack trace。

## 公開 Wiki

- loader：`lib/wiki-public/`
- source：直接讀取 `wiki/**/*.md`
- scope：只輸出 public-safe wiki page data，不建立 CMS、不引入資料庫
- render support：
  - headings
  - paragraphs
  - lists
  - blockquotes
  - tables
  - internal wiki links，例如 `[[major-00-fool]]`
  - 牌卡連結會附縮圖；相關牌卡清單以等寬 grid 顯示
- safety boundaries：
  - 不顯示 `source_refs`、`raw_refs`、raw file paths、retrieval diagnostics、prompt hints、embeddings、graph score、lint comments
  - `<!-- internal --> ... <!-- /internal -->` 區塊不會對外顯示

## 測試

開發時可先跑 focused tests，完成較大改動後再跑較廣的驗證：

```bash
pnpm test:retrieval
pnpm test:answer
pnpm test:pwa
pnpm test:wiki
pnpm test
pnpm typecheck
pnpm build
```

Retrieval / answer 相關測試會使用 repo 內的 fixtures 與 `embeddings/` artifacts；若你更新了 wiki 內容，通常需要重建 index 後再跑 eval。

## 邊界與部署備註

- 這不是命運預言系統，也不是心理診斷工具。
- 解讀語氣應溫和、克制、可反思，避免醫療 / 法律 / 財務斷言。
- MVP 以檔案型 wiki、BM25 JSON index、vector cache JSON 為主，適合小型、可控範疇的塔羅知識庫。
- 目前沒有 Docker Compose / 正式 deploy checklist；若要上線，至少需要：
  - 保護 `OPENAI_API_KEY`
  - 關閉公開 debug retrieval
  - 確認 `embeddings/` 與 `wiki/` 版本一致
  - 規劃 index 重建流程

後續 hardened backlog 優先順序見 [AGENTS.md](AGENTS.md)，包括 LINE allowlist、OpenAI budget guard、PWA auth、answer quality eval dataset 等。

## 相關文件

- [AGENTS.md](AGENTS.md)：Agent / 開發規則、資料契約、測試期待
- [docs/retrieval-architecture.md](docs/retrieval-architecture.md)：retrieval / answer / PWA 模組說明
