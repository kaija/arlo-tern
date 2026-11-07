# 0004. 部署於 GCP：Cloud Run + Compute Engine

- 狀態：已接受
- 日期：2026-11-07

## 背景與問題

- 系統依賴 Google OAuth 與 Gmail API。Gmail 新信推播（`users.watch`）本身就是透過 **Cloud Pub/Sub** 傳送
- Ingestion worker 要常駐、維持長連線，並為每位 WhatsApp 用戶執行 headless Chromium，不適合 request 驅動、會縮到零的 serverless 環境
- 其他服務是無狀態的

## 考慮的選項

1. GCP：無狀態服務跑 Cloud Run，session worker 跑 Compute Engine
2. 全部跑在 GKE
3. AWS / 自架 VPS

## 決策

採用 **GCP**：

| 部署單元 | 運算平台 |
| --- | --- |
| Core API | Cloud Run |
| Processing worker | Cloud Run |
| Ingestion worker | Compute Engine VM（Managed Instance Group） |

事件傳遞使用 **Cloud Pub/Sub**，資料庫見 [0005](0005-cloud-sql-postgresql.md)。

## 後果

### 正面

- Gmail push、OAuth 設定、Pub/Sub 都在同一個雲端平台，整合最直接
- 無狀態服務免管伺服器、依流量擴展
- 有狀態的 session worker 有穩定、常駐的運算資源

### 負面 / 風險

- 要維運兩種運算平台（Cloud Run 與 GCE）
- GCE 上的 worker 需自行處理映像檔、更新與健康檢查

## 待決

- VM 機型與每節點承載的 session 數
- 部署管線（CI/CD）與基礎設施即程式碼（IaC）工具
