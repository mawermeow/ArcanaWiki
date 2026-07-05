# ArcanaWiki Slides

以 [reveal.js](https://revealjs.com/) 製作的專案簡報：

- 為什麼做 ArcanaWiki
- 核心問題與可引用問答
- 產品畫面（PWA 問答、公開 Wiki）
- 三個關鍵決策
- Hybrid retrieval 與技術一覽

## 本機預覽

在專案根目錄執行：

```bash
pnpm dlx serve docs/slides
```

然後開啟 [http://localhost:3000](http://localhost:3000)。

## 操作方式

- `→` / `←`：上一頁 / 下一頁
- `Esc`：總覽模式
- 網址 `#/2` 可直接跳到指定 slide

## 部署到 GitHub Pages

Workflow：`.github/workflows/deploy-slides.yml`

Push 到 `main` 後可從 [https://mawermeow.github.io/ArcanaWiki/](https://mawermeow.github.io/ArcanaWiki/) 開啟。
