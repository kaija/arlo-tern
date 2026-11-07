# 0022. 可遷移性守則

- 狀態：已接受
- 日期：2026-11-07

## 背景與問題

依 [0021](0021-managed-backend-services-evaluation.md)，小規模時善用 Supabase，但日後必須能遷到其他 Postgres 與登入方案（例如 Cloud SQL、自建 Auth）。若沒有明確守則，程式碼會逐漸依賴託管服務的專有功能，遷移成本會越來越高。

## 決策

1. **商業邏輯只放在自有的 TypeScript 服務**（Core API、Ingestion worker、Processing worker），不寫在 Supabase Edge Functions，也不寫在資料庫的 trigger、函式或 RLS 規則裡
2. **App 只透過 Core API 存取資料**。App 只使用 Supabase 的登入 SDK，不直接讀寫資料庫，也不使用 Realtime。換資料庫時 App 不用改
3. **資料庫只使用標準 Postgres 與可攜的擴充**（例如 pgvector）。schema 由 repo 內的 Drizzle migration 管理，不在 Supabase dashboard 手動修改（見 [0005](0005-supabase-postgres.md)）
4. **登入驗證放在介面之後**：Core API 透過內部的 auth 介面以 JWKS 驗證 JWT，業務程式碼只拿到系統內部的用戶 ID，不直接依賴 Supabase 的型別或 SDK（見 [0007](0007-identity-supabase-auth-google.md)）
5. **佇列、排程、金鑰管理不放在 Supabase**：分別使用 Cloud Pub/Sub、Cloud Scheduler、Cloud KMS（見 [0004](0004-gcp-compute-tokyo.md)）
6. **目前只使用 Supabase 的 Postgres 與 Auth**。要採用其他 Supabase 功能（Storage、Realtime、Edge Functions、pg_cron、Queues、Vault 等），必須新增 ADR，說明遷移代價

## 後果

### 正面

- 遷出 Supabase 時，影響範圍限於資料庫連線設定與 auth adapter
- 程式碼結構清楚：業務邏輯與基礎設施透過介面隔開

### 負面 / 風險

- 放棄部分 Supabase 的便利功能（例如 App 直連 + RLS、Realtime），某些功能要在 Core API 自己實作
- 守則需要在程式碼審查時把關
