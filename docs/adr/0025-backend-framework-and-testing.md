# 0025. Backend 框架與測試：Hono + Vitest + Testcontainers

- 狀態：已接受
- 日期：2026-11-11

## 背景與問題

Backend 使用 TypeScript（見 [0003](0003-backend-typescript-node.md)），Core API 與 Processing worker 部署在 Cloud Run（見 [0004](0004-gcp-compute-tokyo.md)）。App 的 API 型別要從 Core API 的規格產生（見 [0006](0006-multi-repo.md)）。

## 考慮的選項

Web 框架：Hono、Fastify、NestJS

測試：Vitest + Testcontainers、Jest

## 決策

- **Web 框架**：**Hono**
  - 請求與回應以 Zod schema 定義，並由 schema 產生 OpenAPI 規格
- **測試**：
  - 單元測試：**Vitest**
  - 整合測試：用 **Testcontainers** 啟動真實的 Postgres（含 pgvector）與 Pub/Sub emulator，不 mock 資料庫

## 後果

### 正面

- Hono 輕量、啟動快，適合 Cloud Run 的冷啟動
- Zod schema 同時負責驗證與 API 規格，規格不會和實作脫節
- 整合測試跑在真實的 Postgres 上，能抓到 SQL 與 migration 的問題

### 負面 / 風險

- Hono 沒有內建模組化結構，Core API 的模組邊界（見 [0002](0002-system-decomposition.md)）要靠自己的目錄慣例維持
- 整合測試需要 Docker，CI 執行時間較長
