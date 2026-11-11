# 架構決策紀錄（ADR）

Travel planner App 與 backend 的架構決策。格式與規則見 [0001](0001-record-architecture-decisions.md)，新增 ADR 請複製 [template.md](template.md)。

## 系統概要

- **App**：React Native（Expo）。顯示從用戶對話中找出的 task、日 / 週 / 月曆、逐日逐時的旅遊行程、與個人 AI agent 對話
- **Backend**：TypeScript + Hono。Core API（模組化單體）+ Ingestion worker（LINE / WhatsApp session）+ Processing worker（task 抽取、可疑偵測），以 Pub/Sub 串接；每個服務一個 repo
- **託管服務**：Supabase 只管 Postgres 與 Auth；運算、佇列、排程、金鑰管理在 GCP。全部位於東京，並遵守可遷移性守則
- **法遵**：台灣個資法 + GDPR
- **MVP 規模**：100 人以下內測

## 索引

### 基礎

| # | 決策 | 狀態 |
| --- | --- | --- |
| [0001](0001-record-architecture-decisions.md) | 以 ADR 記錄架構決策 | 已接受 |

### 系統架構與基礎設施

| # | 決策 | 狀態 |
| --- | --- | --- |
| [0002](0002-system-decomposition.md) | 系統切分：模組化單體 Core API + 獨立訊息處理服務 | 已接受 |
| [0003](0003-backend-typescript-node.md) | Backend 使用 TypeScript / Node.js | 已接受 |
| [0004](0004-gcp-compute-tokyo.md) | 運算與基礎設施部署於 GCP 東京區 | 已接受 |
| [0005](0005-supabase-postgres.md) | 主要資料庫使用 Supabase Postgres，以 Drizzle 存取 | 已接受 |
| [0006](0006-multi-repo.md) | 每個服務一個 repo，App 以 OpenAPI 產生 client | 已接受 |
| [0021](0021-managed-backend-services-evaluation.md) | 託管後端服務評估：採用 Supabase 的 Postgres 與 Auth | 已接受 |
| [0022](0022-vendor-portability-rules.md) | 可遷移性守則 | 已接受 |
| [0023](0023-environments-and-region.md) | 環境與區域：dev + prod，皆位於東京 | 已接受 |
| [0025](0025-backend-framework-and-testing.md) | Backend 框架與測試：Hono + Vitest + Testcontainers | 已接受 |
| [0026](0026-cicd-and-iac.md) | CI/CD 使用 Cloud Build，基礎設施以 Terraform 管理 | 已接受 |
| [0027](0027-pubsub-topology.md) | Pub/Sub 拓撲：依來源分 topic，原文最多保留 24 小時 | 已接受 |

### 帳號、資料來源與法遵

| # | 決策 | 狀態 |
| --- | --- | --- |
| [0007](0007-identity-supabase-auth-google.md) | 以 Supabase Auth 的 Google 登入為唯一身分，LINE / WhatsApp 為綁定的資料來源 | 已接受 |
| [0008](0008-gmail-access.md) | Gmail：gmail.readonly + Pub/Sub 推播，MVP 用 OAuth 測試模式 | 已接受 |
| [0009](0009-line-whatsapp-unofficial-read-only.md) | LINE / WhatsApp 以非官方函式庫唯讀讀取 | 已接受 |
| [0010](0010-session-worker-pool.md) | LINE / WhatsApp session 以共用 worker pool 託管 | 已接受 |
| [0011](0011-no-raw-message-retention.md) | 不保存原始訊息內容 | 已接受 |
| [0024](0024-privacy-consent-compliance.md) | 個資法遵與用戶同意：台灣個資法 + GDPR | 已接受 |

### 通道

| # | 決策 | 狀態 |
| --- | --- | --- |
| [0012](0012-official-accounts.md) | 官方帳號：LINE OA 與 WhatsApp 官方號，皆走官方 API | 已接受 |

### AI

| # | 決策 | 狀態 |
| --- | --- | --- |
| [0013](0013-llm-provider-abstraction.md) | LLM 透過自有抽象層使用，候選模型由評測決定 | 已接受 |
| [0014](0014-personal-agent-shared-memory.md) | 每位用戶一個 agent：共用對話紀錄，以工具存取 todo / schedule 與記憶 | 已接受 |
| [0015](0015-task-extraction-confidence-routing.md) | Task 抽取：依信心分數分流，跨來源去重 | 已接受 |

### 產品功能

| # | 決策 | 狀態 |
| --- | --- | --- |
| [0016](0016-in-app-calendar.md) | 行事曆只在 App 內，MVP 不與外部行事曆同步 | 已接受 |
| [0017](0017-travel-itinerary-planning.md) | 旅遊規劃：獨立的逐日逐時行程，接外部資料來源 | 已接受 |
| [0018](0018-ai-driven-reminders.md) | 到期提醒：AI 依緊急度決定提前時間，用戶可修改 | 已接受 |
| [0019](0019-suspicious-message-detection.md) | 可疑訊息偵測與警告 | 已接受 |

### App

| # | 決策 | 狀態 |
| --- | --- | --- |
| [0020](0020-react-native-expo.md) | App 使用 React Native + Expo（EAS） | 已接受 |

## 待決事項

以下尚未決定，因此沒有寫成 ADR。決定後請新增 ADR，或更新對應 ADR 的「待決」段落。

**法規與風險**
- 群組中第三人資料的 GDPR 合法依據（[0009](0009-line-whatsapp-unofficial-read-only.md)、[0024](0024-privacy-consent-compliance.md)）
- 隱私權政策與風險告知文案、公開上線前的法律顧問審閱（[0024](0024-privacy-consent-compliance.md)）
- CASA 評估的負責人（[0008](0008-gmail-access.md)）
- 警告與 task 中可保留的原文摘錄長度（[0011](0011-no-raw-message-retention.md)）

**Backend**
- Gmail 新信通知進入 Pub/Sub 後，由哪個元件取信（[0002](0002-system-decomposition.md)）
- VM 機型（[0004](0004-gcp-compute-tokyo.md)）
- session worker 每節點上限的初始值、租約有效期與心跳間隔（[0010](0010-session-worker-pool.md)）
- Pub/Sub 訊息格式與資料庫 schema 由哪個 repo 擁有（[0006](0006-multi-repo.md)）
- 使用 Terraform 或 OpenTofu、state 的存放位置（[0026](0026-cicd-and-iac.md)）
- 官方帳號身分與系統帳號的綁定流程（[0007](0007-identity-supabase-auth-google.md)）

**AI**
- 各任務的評測資料集（[0013](0013-llm-provider-abstraction.md)）
- 上下文保留的輪數 N、摘要觸發時機；事件記憶的資料結構，以及用戶能否檢視、刪除（[0014](0014-personal-agent-shared-memory.md)）
- task 信心門檻的初始值與調整週期（[0015](0015-task-extraction-confidence-routing.md)）
- 可疑偵測標註資料集的來源與去識別化方式（[0019](0019-suspicious-message-detection.md)）

**產品**
- Duffel 只查詢不下單的使用條件與費用；不適用時的替代供應商（[0017](0017-travel-itinerary-planning.md)）
- WhatsApp 警告範本、LINE OA 方案（[0012](0012-official-accounts.md)）
- 用戶指定 Gmail 警告通道的設定方式（[0019](0019-suspicious-message-detection.md)）

**App**
- App 端狀態管理與資料取得方式（[0020](0020-react-native-expo.md)）
