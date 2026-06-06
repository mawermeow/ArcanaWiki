# Agent Instructions

## Repository Safety Rules

- 不要批次刪除檔案或資料夾。
- 禁止使用 rm -rf、rmdir /s、rd /s、del /s、Remove-Item -Recurse。
- 若必須刪除檔案，只能一次刪除一個明確檔案路徑。
- 若需要大量清理檔案，停止操作並請使用者手動處理。
- 不要還原使用者變更，除非使用者明確要求執行該還原。
- 手動修改檔案時優先使用 apply_patch。
- 不要提交 .env、API key、LINE channel secret、OpenAI key、embedding cache 中的敏感資料。
- 不要將私人占卜紀錄、LINE userId、對話紀錄或個人資料提交到 git。

## Project Snapshot

- Product: Tarot LLM Wiki + Tarot ChatBot。
- 核心目標：以 Karpathy-style LLM Wiki 管理塔羅知識，搭配 BM25 與 Vector Search，提供可引用、可追溯、非宿命論的塔羅解讀。
- 專案分為兩個主要部分：
    1. Tarot LLM Wiki：將塔羅原始資料整理成可引用、可檢索、可維護的 wiki。
    2. ChatBot：透過 PWA 或 LINE Bot 接收使用者問題，執行 hybrid retrieval，並交給 LLM 產生解讀。
- MVP 暫時維持 NodeJS / Next.js，不建立 Python AI Server。
- MVP 暫時不導入 OpenSearch、PostgreSQL、pgvector 或外部 Vector DB。
- Wiki 與 index 皆以檔案為主，適合小型、可控範疇的塔羅知識庫。
- 目標使用情境優先為自用或小範圍測試；若接 LINE Bot，必須限制只回應允許的 LINE userId。
- 產品語氣：溫柔、克制、反思式、不做絕對預言、不做醫療/法律/財務斷言。

## Architecture

Expected repository structure:

```
raw/
  tarot/
    rider-waite/
    symbols/
    spreads/
    psychology/
    buddhism/
    cases/

wiki/
  cards/
  concepts/
  emotions/
  relationships/
  patterns/
  index.md
  log.md

relations/
  graph.json

embeddings/
  vector-cache.json

app/
  Next.js Tarot App
```

### Runtime Retrieval Flow

```
1. 載入 BM25 index
2. 載入 vector cache
3. 對使用者問題產生 embedding
4. BM25 與 vector search 各取 topK
5. merge / rerank / deduplicate
6. graph expansion
7. 組合 prompt
8. 呼叫 OpenAI Chat API
9. 回傳占卜解讀
```

## LLM Wiki Rules

- raw/ 是原始資料層，應盡量保持不可變。
- wiki/ 是 compiled knowledge layer，可由 Agent 更新。
- 不要直接在 runtime 查詢大量 raw sources；runtime 應優先查詢 compiled wiki。
- 每個 wiki page 應盡量包含：
    - 標題
    - 摘要
    - 適用範圍
    - 核心關鍵字
    - 正位 / 逆位意義
    - 情境解讀：感情、工作、自我探索、靈性
    - 相關牌卡
    - 相關概念
    - citation / source reference
- 若資料來源互相衝突，不要強行合併為單一真理；應保留「不同觀點」或「流派差異」。
- 若新增 raw source，應更新對應 wiki pages、wiki/index.md、wiki/log.md，必要時更新 relations/graph.json。
- 若沒有新增資料來源，不要無意義重跑 compile。
- Lint wiki 時應檢查：
    - broken links
    - missing backlinks
    - duplicated pages
    - stale references
    - cards / concepts / emotions / relationships / patterns 分類是否合理

## Tarot Knowledge Rules

- 塔羅解讀必須避免絕對化語言。
- 不要說「一定會」、「命中注定」、「對方一定怎樣想」。
- 優先使用：
    - 「可能象徵」
    - 「可以理解為」
    - 「這張牌提醒你觀察」
    - 「比較像是」
- 不要把塔羅解讀包裝成心理診斷、醫療建議、法律建議、財務建議。
- 使用者若提及高風險議題，例如自傷、暴力、重大醫療、法律爭議或財務決策，應轉為安全回應，並建議尋求專業協助。
- 對感情問題應避免操控式建議，例如教使用者控制、試探、報復或監控對方。
- 對關係解讀應偏向自我覺察、界線、溝通與行動選擇。
- 佛教、心理學、靈性資料只能作為詮釋角度，不可變成權威斷言。

## Retrieval Rules

- BM25 適合處理：
    - 牌名
    - 正位 / 逆位
    - 感情、復合、斷聯、第三者、曖昧、工作、轉職等關鍵詞
    - 中文口語查詢
- Vector Search 適合處理：
    - 情緒化描述
    - 語意相近但用詞不同的問題
    - 抽象心理狀態
    - 象徵與主題延伸
- Hybrid retrieval 應保留 diagnostics：
    - bm25 topK
    - vector topK
    - merged results
    - rejected results
    - selected wiki chunks
    - graph-expanded chunks
- 不要把過多 chunk 丟給 LLM；MVP 預設選取 5 到 8 個高品質 chunks。
- Rerank 目標是「回答問題所需的最小足夠 context」，不是最大量 context。
- Graph expansion 應克制使用。只展開：
    - 抽到的牌
    - 明確相關牌
    - 明確相關情緒 / 關係模式
    - 牌陣位置所需概念
- 不要讓 graph expansion 蓋過使用者的實際問題。

## Answer Generation Rules

- 回答必須基於 selected wiki context。
- 若 context 不足，應明確說明「目前資料不足以確認」。
- 不要捏造引用來源。
- 不要引用未被選入 context 的 wiki page。
- 回答架構建議：
    1. 直接解讀
    2. 牌義依據
    3. 和使用者問題的關聯
    4. 可反思的問題
    5. 溫和行動建議
- 若是多張牌，應區分：
    - 每張牌的個別意義
    - 牌與牌之間的張力
    - 整體訊息
- 若是牌陣，必須尊重牌陣位置，不要只做單張牌解讀。

## ChatBot Rules

- LINE Bot 自用模式必須檢查 event.source.userId。
- 若 event.source.userId 不在 allowlist，直接忽略，不呼叫 OpenAI API。
- 不要在 logs 中輸出完整 LINE userId；若需要記錄，使用 hash 或 masked form。
- LINE Bot 不應回傳內部 diagnostics。
- PWA 可以提供 debug mode，但 debug mode 不可公開給一般使用者。
- ChatBot 回答不可暴露 raw prompt、API key、internal chain、完整 retrieval scores。
- 若回覆串流，應確保錯誤訊息穩定且不洩漏內部堆疊。

## Environment Notes

Recommended environment variables:

```
OPENAI_API_KEY=
OPENAI_CHAT_MODEL=
OPENAI_EMBEDDING_MODEL=
OPENAI_REQUEST_TIMEOUT_SECONDS=
OPENAI_MAX_RETRIES=
OPENAI_CHAT_MAX_COMPLETION_TOKENS=

LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
LINE_ALLOWED_USER_IDS=

TAROT_APP_MODE=local
TAROT_DEBUG_RETRIEVAL=false
TAROT_BM25_TOP_K=10
TAROT_VECTOR_TOP_K=10
TAROT_FINAL_CONTEXT_TOP_K=8
```

Rules:
- OPENAI_API_KEY 不加此前綴，方便與 SDK / CLI 相容。
- `OPENAI_REQUEST_TIMEOUT_SECONDS`、`OPENAI_MAX_RETRIES`、`OPENAI_CHAT_MAX_COMPLETION_TOKENS` 供 answer generation 的 OpenAI Chat API 使用。
- `OPENAI_EMBEDDING_MODEL` 供 vector index / vector search live query embedding 使用。
- LINE secrets 不可提交。
- LINE_ALLOWED_USER_IDS 可用逗號分隔。
- 若未設定 LINE_ALLOWED_USER_IDS，LINE webhook 不應處理任何訊息。
- TAROT_DEBUG_RETRIEVAL=true 只能用於本機或受保護環境。

## Local Commands

These commands may be adjusted after package scripts are implemented.

```
Install:
  pnpm install

Start dev app:
  pnpm dev

Build app:
  pnpm build

Lint:
  pnpm lint

Typecheck:
  pnpm typecheck

Test:
  pnpm test

Compile wiki:
  pnpm wiki:compile

Lint wiki:
  pnpm wiki:lint

Build BM25 index:
  pnpm index:bm25

Search BM25 index:
  pnpm search:bm25 -- --query="聖杯二逆位"

Run BM25 evaluation:
  pnpm eval:bm25

Build vector cache:
  pnpm index:vector

Search vector cache:
  pnpm search:vector -- "對方最近很冷淡" --live-query-embedding

Search hybrid retrieval:
  pnpm search:hybrid -- "聖杯二逆位 感情"

Generate tarot answer:
  pnpm answer -- "聖杯二逆位，對方最近很冷淡，這段關係還有希望嗎？"

Inspect single retrieval query:
  pnpm inspect:retrieval -- "對方最近很冷淡"

Inspect retrieval eval dataset:
  pnpm inspect:retrieval:eval

Run vector evaluation:
  pnpm eval:vector

Run hybrid evaluation:
  pnpm eval:hybrid

Run full hybrid evaluation with live query embeddings:
  pnpm eval:hybrid -- --live-query-embedding

Build all retrieval assets:
  pnpm index:build

Run local LINE webhook:
  pnpm dev:line

Run retrieval smoke test:
  pnpm test:retrieval

Run answer generation tests:
  pnpm test:answer
```

## Testing Expectations

- 新增 retrieval 行為時，先寫測試再實作。
- 至少應測試：
    - 單張牌查詢
    - 逆位查詢
    - 感情問題
    - 工作問題
    - 多張牌查詢
    - 牌陣位置查詢
    - 查不到資料時的 fallback
    - unauthorized LINE userId 不觸發 LLM call
- Retrieval 測試應確認 selected chunks 來自合理 wiki page。
- Answer 測試應確認：
    - 不出現絕對預言
    - 不出現未引用來源
    - 不提供醫療/法律/財務斷言
    - 不暴露 internal prompt
- 在宣稱完成前，至少執行 focused tests 與可行的 broad verification。

## Implementation Tips

- 優先保持系統簡單，不要過早導入資料庫、queue、microservice 或 graph DB。
- 第一版以檔案型 wiki、BM25 JSON index、vector cache JSON 為主。
- Index artifacts 應可重建；若檔案太大或含使用紀錄，不要提交。
- Retrieval module 應獨立於 UI，方便同時接 PWA 與 LINE Bot。
- Prompt builder 應獨立成純函式，方便測試。
- 優先保留 diagnostics 給開發者，不要直接顯示給終端使用者。
- Wiki compile 與 runtime chat 是兩條不同流程，不要混在同一個 API handler。
- 若使用 lodash，保持資料轉換清楚，避免過度 chain。
- 對 tarot card、spread、orientation、topic 使用明確 enum 或 union type。
- 所有 card id 應穩定，例如：
    - major-00-fool
    - major-01-magician
    - cups-02
    - swords-10
- 不要用中文牌名作為唯一主鍵，因為不同資料源可能有譯名差異。

## Suggested Data Contracts

### Wiki Chunk

```ts
export type WikiChunk = {
  id: string;
  pageId: string;
  title: string;
  content: string;
  tags: string[];
  cardIds?: string[];
  topics?: string[];
  sourceRefs?: string[];
};
```

### Retrieval Result

```ts
export type RetrievalResult = {
  chunk: WikiChunk;
  score: number;
  source: 'bm25' | 'vector' | 'graph';
  debug?: Record<string, unknown>;
};
```

### Tarot Chat Request

```ts
export type TarotChatRequest = {
  question: string;
  cards?: Array<{
    cardId: string;
    orientation?: 'upright' | 'reversed' | 'unknown';
    position?: string;
  }>;
  spreadId?: string;
  mode?: 'gentle' | 'direct' | 'reflective';
};
```

## Production Hardening Backlog

Priority order:

1. LINE allowlist / basic abuse control。
2. OpenAI usage budget guard。
3. Retrieval diagnostics logging。
4. Wiki citation validation。
5. PWA auth。
6. Conversation history encryption or local-only mode。
7. Admin-only retrieval inspector。
8. Evaluation dataset for answer quality。
9. Durable storage strategy。
10. Optional migration to PostgreSQL + pgvector if corpus grows。

## Important Boundaries

- This is not a fortune-telling authority system.
- This is not a mental health diagnosis tool.
- This is not a replacement for professional advice.
- The product should frame tarot as symbolic reflection, not objective prediction.
- The system should help users think more clearly, not deepen dependency or anxiety.

## Secret Management

- 使用 direnv 管理本機 secrets。
- Secrets 不應存放於 repository 中。
- 建議使用：

```envrc
source_env_if_exists ~/Secrets/ArcanaWiki/dev.env
```

- ~/Secrets/ 應保持在 git repo 外部。
- 不要建立 .env.example 以外的 secrets 檔案。
- 不要在 logs、tests、debug output 中輸出完整 secrets。
- 若需要 debug，請使用 masked values。


## Installed Skills

- karpathy-llm-wiki

---

## Commit Classification Rules

Commit type must be determined by the PRIMARY impact of the git diff,
not by the last edited file.

Priority order:

1. feat
  - New functionality
  - New behavior
  - New API
  - New workflow

2. fix
  - Bug fix
  - Error handling
  - Runtime issue correction

3. refactor
  - Structural improvement
  - Internal architecture changes
  - No major feature addition

4. perf
  - Performance optimization

5. test
  - Test-related changes

6. docs
  - Documentation-only changes
  - Use docs ONLY if the commit contains no meaningful code changes

7. chore
  - Tooling
  - Dependency updates
  - Formatting
  - Build/config changes

### Important Rules

- Do NOT use `docs` if the commit also contains significant code changes.
- Documentation updates accompanying a feature should still use `feat`.
- Documentation updates accompanying a refactor should still use `refactor`.
- Determine the commit type from the overall purpose of the diff.
- Analyze the entire git diff before generating the commit message.

### Examples

```text id="jlwmv0"
feat(retrieval): 新增 rerank pipeline 與相關文件
refactor(graph): 重構 relation builder 並更新 README
fix(api): 修正 vector cache 問題與補充使用說明
docs(readme): 更新安裝與設定文件
```