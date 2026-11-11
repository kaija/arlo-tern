# 0006. 程式碼採多個 repository，每個服務一個 repo

- 狀態：已接受
- 日期：2026-11-07（2026-11-11 更新）

## 背景與問題

系統包含一個 React Native App 與三個 backend 部署單元（見 [0002](0002-system-decomposition.md)），還有基礎設施設定，需要決定程式碼倉庫怎麼組織，以及 App 與 backend 之間怎麼同步 API 型別。

## 考慮的選項

倉庫組織：

1. Monorepo（pnpm workspaces + Turborepo）
2. mobile / backend / infra 三個 repo
3. 每個服務一個 repo

型別同步：

1. 由 Core API 產生 OpenAPI 規格，App 從規格產生 client
2. 發布私有 npm 套件

## 決策

- **每個服務一個 repo**：

  | repo | 內容 |
  | --- | --- |
  | `mobile` | Expo App（見 [0020](0020-react-native-expo.md)） |
  | `core-api` | Core API |
  | `ingestion-worker` | LINE / WhatsApp session worker |
  | `processing-worker` | task 抽取與可疑偵測 |
  | `infra` | Terraform（見 [0026](0026-cicd-and-iac.md)） |
  | `arlo-tern`（本 repo） | 架構決策紀錄 |

- **App ↔ Core API 型別同步**：Core API 由 Zod schema 產生 OpenAPI 規格（見 [0025](0025-backend-framework-and-testing.md)），`mobile` 從規格產生型別與 API client。規格就是合約，兩邊不共用原始碼

## 後果

### 正面

- 每個 repo 的權限、CI 與發布節奏可以各自獨立
- 服務的所有權邊界清楚
- API 變更以規格為準，App 端的編譯錯誤會直接指出不相容之處

### 負面 / 風險

- 跨 repo 的變更需協調多個 PR
- `ingestion-worker` 與 `processing-worker` 之間的 Pub/Sub 訊息格式、各服務共用的資料庫 schema 也橫跨多個 repo，需要明確的歸屬與同步方式
- 共用的工具設定（lint、TypeScript 設定、LLM 抽象層等）會在多個 repo 重複

## 待決

- Pub/Sub 訊息格式與資料庫 schema（Drizzle migration）由哪個 repo 擁有、其他 repo 如何取得
