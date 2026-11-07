# 架構決策紀錄（ADR）

Travel planner App 與 backend 的架構決策。格式與規則見 [0001](0001-record-architecture-decisions.md)，新增 ADR 請複製 [template.md](template.md)。

## 系統概要

- **App**：React Native（Expo）。顯示從用戶對話中找出的 task、日 / 週 / 月曆、逐日逐時的旅遊行程、與個人 AI agent 對話
- **Backend**：TypeScript，部署於 GCP。Core API（模組化單體）+ Ingestion worker（LINE / WhatsApp session）+ Processing worker（task 抽取、可疑偵測），以 Pub/Sub 串接
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
| [0004](0004-gcp-cloud-run-and-gce.md) | 部署於 GCP：Cloud Run + Compute Engine | 已接受 |
| [0005](0005-cloud-sql-postgresql.md) | 主要資料庫使用 Cloud SQL for PostgreSQL | 已接受 |
| [0006](0006-multi-repo.md) | 程式碼採多個 repository | 已接受 |

### 帳號與資料來源

| # | 決策 | 狀態 |
| --- | --- | --- |
| [0007](0007-identity-google-signin-with-linked-sources.md) | 只用 Google 登入，LINE / WhatsApp 為綁定的資料來源 | 已接受 |
| [0008](0008-gmail-access.md) | Gmail：gmail.readonly + Pub/Sub 推播，MVP 用 OAuth 測試模式 | 已接受 |
| [0009](0009-line-whatsapp-unofficial-read-only.md) | LINE / WhatsApp 以非官方函式庫唯讀讀取 | 已接受 |
| [0010](0010-session-worker-pool.md) | LINE / WhatsApp session 以共用 worker pool 託管 | 已接受 |
| [0011](0011-no-raw-message-retention.md) | 不保存原始訊息內容 | 已接受 |

### 通道

| # | 決策 | 狀態 |
| --- | --- | --- |
| [0012](0012-official-accounts.md) | 官方帳號：LINE OA 與 WhatsApp 官方號，皆走官方 API | 已接受 |

### AI

| # | 決策 | 狀態 |
| --- | --- | --- |
| [0013](0013-llm-provider-abstraction.md) | LLM 透過供應商抽象層使用，可替換 | 已接受 |
| [0014](0014-personal-agent-shared-memory.md) | 每位用戶一個個人 agent，跨通道共用記憶 | 已接受 |
| [0015](0015-task-extraction-confidence-routing.md) | Task 抽取：依信心分數決定直接加入或待確認 | 已接受 |

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
- 非官方 LINE / WhatsApp 讀取的用戶告知與同意流程、個資法遵評估（[0009](0009-line-whatsapp-unofficial-read-only.md)）
- 送給 LLM 供應商的資料處理條款（[0013](0013-llm-provider-abstraction.md)）
- 公開上線前 Gmail CASA 評估的時程（[0008](0008-gmail-access.md)）

**Backend**
- Web 框架、ORM、測試工具（[0003](0003-backend-typescript-node.md)）
- App 與 Core API 之間的 session / token 機制（[0007](0007-identity-google-signin-with-linked-sources.md)）
- CI/CD 與 IaC 工具（[0004](0004-gcp-cloud-run-and-gce.md)）
- Pub/Sub topic 劃分與原文訊息保留時間上限（[0002](0002-system-decomposition.md)、[0011](0011-no-raw-message-retention.md)）
- session worker 的每節點上限、分片機制、憑證加密與金鑰管理（[0010](0010-session-worker-pool.md)）
- 提醒排程的執行機制（[0018](0018-ai-driven-reminders.md)）
- repo 劃分與共用型別的同步方式（[0006](0006-multi-repo.md)）

**AI**
- 各任務的預設模型、是否採用現成的多供應商 SDK（[0013](0013-llm-provider-abstraction.md)）
- agent 長期記憶的儲存與檢索、上下文長度管理（[0005](0005-cloud-sql-postgresql.md)、[0014](0014-personal-agent-shared-memory.md)）
- task 信心分數門檻、跨來源去重、官方帳號對話是否作為抽取來源（[0015](0015-task-extraction-confidence-routing.md)）
- 可疑訊息的偵測方法與評估方式（[0019](0019-suspicious-message-detection.md)）

**產品**
- 機票 / 住宿、天氣 API 的供應商（[0017](0017-travel-itinerary-planning.md)）
- 旅遊行程在日 / 週 / 月曆上的呈現，以及與 task / 提醒的關係（[0016](0016-in-app-calendar.md)、[0017](0017-travel-itinerary-planning.md)）
- 是否處理 LINE / WhatsApp 群組對話（[0009](0009-line-whatsapp-unofficial-read-only.md)）
