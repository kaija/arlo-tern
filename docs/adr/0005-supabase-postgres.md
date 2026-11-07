# 0005. 主要資料庫使用 Supabase Postgres，以 Drizzle 存取

- 狀態：已接受
- 日期：2026-11-07

## 背景與問題

核心資料是關聯性的：用戶、綁定的資料來源、task、提醒、旅遊行程（行程 → 日 → 時段項目）、可疑訊息警告、agent 長期記憶。需要交易一致性與彈性查詢（例如依日 / 週 / 月範圍查 task）。小規模時希望用託管服務，日後也要能遷出（見 [0021](0021-managed-backend-services-evaluation.md)）。

## 考慮的選項

1. Supabase Postgres
2. GCP Cloud SQL for PostgreSQL
3. Firebase Firestore

## 決策

- 資料庫：**Supabase Postgres**，位於東京（見 [0023](0023-environments-and-region.md)）
- 存取與 schema migration：**Drizzle**。migration 檔放在 repo 內、納入版本控制，不在 Supabase dashboard 手動修改 schema
- agent 長期記憶的語意檢索：**pgvector**，與其他資料放在同一個 Postgres（見 [0014](0014-personal-agent-shared-memory.md)）
- 只有 backend 服務連線資料庫，App 不直連（見 [0022](0022-vendor-portability-rules.md)）

## 後果

### 正面

- 標準 Postgres：日後可用 pg_dump 遷到 Cloud SQL 或其他 Postgres，Drizzle 程式碼不用改
- 關聯資料與範圍查詢（日 / 週 / 月曆）表達自然
- 不需要另外的向量資料庫
- Drizzle 產生標準 SQL migration，型別與 TypeScript 程式碼一致

### 負面 / 風險

- 資料庫在 AWS，Core API 在 GCP，跨雲連線需要做好 TLS 與連線管理
- Cloud Run 實例數變多時，連線數可能超過上限，需經 Supabase 的連線池
- App 的即時更新要由 Core API 自行實作
