# 0004. 運算與基礎設施部署於 GCP 東京區

- 狀態：已接受
- 日期：2026-11-07

## 背景與問題

- 系統依賴 Google OAuth 與 Gmail API。Gmail 新信推播（`users.watch`）本身就是透過 **Cloud Pub/Sub** 傳送
- Ingestion worker 要常駐、維持長連線，並為每位 WhatsApp 用戶執行 headless Chromium，不適合 request 驅動、會縮到零的 serverless 環境
- 其他服務是無狀態的
- 資料庫與登入使用 Supabase（見 [0021](0021-managed-backend-services-evaluation.md)），但商業邏輯、佇列、排程與金鑰管理要留在自己掌控的平台（見 [0022](0022-vendor-portability-rules.md)）

## 考慮的選項

1. GCP：無狀態服務跑 Cloud Run，session worker 跑 Compute Engine
2. 全部跑在 GKE
3. AWS / 自架 VPS

## 決策

採用 **GCP**，區域為 `asia-northeast1`（東京，見 [0023](0023-environments-and-region.md)）：

| 用途 | GCP 服務 |
| --- | --- |
| Core API、Processing worker | Cloud Run |
| Ingestion worker（session worker） | Compute Engine VM（Managed Instance Group） |
| 事件佇列（LINE、WhatsApp、Gmail 全部） | Cloud Pub/Sub |
| 到期提醒的定時觸發 | Cloud Scheduler（見 [0018](0018-ai-driven-reminders.md)） |
| 憑證與 token 的信封加密 | Cloud KMS（見 [0010](0010-session-worker-pool.md)、[0008](0008-gmail-access.md)） |

資料庫見 [0005](0005-supabase-postgres.md)。

## 後果

### 正面

- Gmail push、OAuth 設定、Pub/Sub 都在同一個雲端平台，整合最直接
- 所有訊息來源共用同一套佇列機制
- 無狀態服務免管伺服器、依流量擴展
- 有狀態的 session worker 有穩定、常駐的運算資源

### 負面 / 風險

- 要維運兩種運算平台（Cloud Run 與 GCE）
- GCE 上的 worker 需自行處理映像檔、更新與健康檢查

## 待決

- VM 機型（每節點的 session 上限見 [0010](0010-session-worker-pool.md)）

CI/CD 與 IaC 見 [0026](0026-cicd-and-iac.md)。
