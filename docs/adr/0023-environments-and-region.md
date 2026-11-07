# 0023. 環境與區域：dev + prod，皆位於東京

- 狀態：已接受
- 日期：2026-11-07

## 背景與問題

系統橫跨 GCP 與 Supabase（見 [0021](0021-managed-backend-services-evaluation.md)）。Supabase 沒有台灣機房，最近的是東京與新加坡；GCP 有台灣（asia-east1）與東京（asia-northeast1）。Core API 的每個請求幾乎都會查資料庫，因此資料庫與運算之間的延遲最關鍵。

## 考慮的選項（區域）

1. GCP 與 Supabase 都放東京
2. GCP 放台灣、Supabase 放東京

## 決策

- **區域**：GCP 使用 `asia-northeast1`（東京），Supabase 使用 `ap-northeast-1`（東京）
- **環境**：`dev` 與 `prod` 兩套
  - 每套環境各有一個 Supabase 專案與一個 GCP project，資料與權限完全分開
  - `prod` 的 Supabase 使用 **Pro** 方案（不會自動暫停、有每日備份）
  - `dev` 的 Supabase 使用免費方案

## 後果

### 正面

- 資料庫與運算在同一個城市，跨雲延遲低
- 兩套環境在內測規模下足夠，成本低

### 負面 / 風險

- 台灣用戶到東京多了一段網路延遲
- 沒有 staging，`prod` 前的驗證只能在 `dev` 進行
- `dev` 用免費方案，閒置一週會被暫停，需要時得手動恢復
- Gmail OAuth 的測試用戶名單、LINE OA、WhatsApp 官方號都要按環境分開設定
