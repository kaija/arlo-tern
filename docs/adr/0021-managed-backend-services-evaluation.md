# 0021. 託管後端服務評估：採用 Supabase 的 Postgres 與 Auth

- 狀態：已接受
- 日期：2026-11-07

## 背景與問題

MVP 規模為 100 人以下內測（見 [0002](0002-system-decomposition.md)）。規模不大時，希望善用託管服務來降低開發與維運成本，但規模變大或需求改變時，必須能遷出。

評估的候選有 Supabase、Firebase、WorkOS，以及全部自建在 GCP 上。

不論選哪一個，以下兩點都不會改變：

- linejs / whatsapp-web.js 的 session worker 需要常駐、執行 headless Chromium，任何託管函式服務都跑不了，必須在自己的 VM 上（見 [0010](0010-session-worker-pool.md)）
- Gmail `users.watch` 新信推播只能送到 Cloud Pub/Sub（見 [0008](0008-gmail-access.md)）

## 評估

| | Supabase | Firebase | WorkOS | 全部自建（GCP） |
| --- | --- | --- | --- | --- |
| 涵蓋範圍 | Postgres、Auth、Storage、Realtime、Edge Functions、pg_cron、Queues | Auth、Firestore、Cloud Functions、FCM、Data Connect（Postgres） | 只有身分驗證：AuthKit、SSO、SCIM | 依需求組合 Cloud SQL 等服務 |
| 優點 | 標準 Postgres，與既有的關聯資料設計一致；Auth 用戶資料存在自己的 Postgres；內建 pgvector；小規模費用低 | 與 GCP 同一個 project；Auth 成熟 | AuthKit 免費額度很高；企業 SSO 很強 | 無第三方依賴，延遲最低 |
| 缺點 | 跑在 AWS，沒有台灣機房，與 GCP 跨雲；免費版閒置一週會自動暫停；Edge Functions 有執行時間限制 | Firestore 是專有 NoSQL，與關聯資料需求不合 | 主打 B2B，對一般消費者 App 加值有限；不提供資料庫或運算 | 登入、session、token 更新都要自己實作；Cloud SQL 最低規格費用較高 |
| 遷移性 | 高：資料用 pg_dump 即可搬走，前提是商業邏輯不寫進 DB 或 Edge Functions | Auth 可匯出；Firestore 的資料與查詢需重寫 | 中：用戶可匯出，session / token 要更換 | 不需遷移 |

## 決策

- 採用 **Supabase**，但**只使用 Postgres 與 Auth**：
  - 資料庫：Supabase Postgres（見 [0005](0005-supabase-postgres.md)）
  - 用戶註冊 / 登入：Supabase Auth 的 Google provider（見 [0007](0007-identity-supabase-auth-google.md)）
- **不採用 Firebase**：Firestore 與關聯資料需求不合，而且遷移成本最高
- **不採用 WorkOS**：產品是一般消費者 App，用不到它的企業 SSO 優勢
- 商業邏輯、佇列、排程、金鑰管理留在自己的 TypeScript 服務與 GCP 上（見 [0004](0004-gcp-compute-tokyo.md)）
- 為了保持可遷移，遵守 [0022](0022-vendor-portability-rules.md) 的守則

## 後果

### 正面

- 免自行維運資料庫與登入系統，內測期間成本低
- 資料庫與用戶資料都是標準 Postgres，遷出時不必改資料模型

### 負面 / 風險

- 系統橫跨 GCP 與 Supabase（AWS）兩個雲，需要維護兩邊的帳號、帳單與網路設定
- Core API 到資料庫的流量跨雲，會產生 GCP 的對外流量費用
- Supabase 故障時，登入與所有資料存取都會中斷
