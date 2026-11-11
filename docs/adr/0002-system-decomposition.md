# 0002. 系統切分：模組化單體 Core API + 獨立訊息處理服務

- 狀態：已接受
- 日期：2026-11-07

## 背景與問題

系統要做兩類性質很不同的工作：

1. **互動型**：App 與官方帳號的請求，包括登入、task、行事曆、旅遊行程、與 AI agent 對話、通知
2. **背景型**：長時間替用戶讀取 Gmail / LINE / WhatsApp 訊息，抽取 task、偵測可疑訊息

需求明確要求「後端有一個獨立的 service 替用戶讀取訊息並處理」。MVP 規模為 **100 人以下的內測**。

## 考慮的選項

1. 模組化單體 Core API + 獨立的訊息讀取與處理服務，之間以 Pub/Sub 傳遞事件
2. 依領域拆成微服務（auth、task、travel、agent、notification 各一個）

## 決策

採用選項 1，分成三個部署單元：

| 部署單元 | 職責 |
| --- | --- |
| **Core API**（模組化單體） | Google 登入與帳號綁定、task、行事曆、旅遊行程、AI agent 對話（含官方帳號入口）、通知 |
| **Ingestion worker** | 維持用戶的 LINE / WhatsApp session（見 [0009](0009-line-whatsapp-unofficial-read-only.md)、[0010](0010-session-worker-pool.md)），把讀到的訊息發佈到 Pub/Sub |
| **Processing worker** | 訂閱 Pub/Sub，執行 task 抽取（[0015](0015-task-extraction-confidence-routing.md)）與可疑訊息偵測（[0019](0019-suspicious-message-detection.md)），只把結果寫入資料庫 |

```
LINE / WhatsApp ──(linejs / whatsapp-web.js)──► Ingestion worker ─┐
Gmail ──(users.watch → Cloud Pub/Sub)─────────────────────────────┤
                                                                  ▼
                                                           Cloud Pub/Sub
                                                                  │
                                                                  ▼
                                                        Processing worker
                                                        (task 抽取 / 可疑偵測)
                                                                  │
                                                                  ▼
React Native App ◄──► Core API (模組化單體) ◄──► Supabase Postgres
   (Supabase Auth 登入)
LINE OA / WhatsApp 官方號 ◄──(官方 API)──► Core API
```

Core API 內部以模組劃分邊界（例如 `auth`、`accounts`、`tasks`、`calendar`、`travel`、`agent`、`notifications`、`channels`）。模組之間只透過公開介面互相呼叫，不直接存取彼此的資料表，之後需要時可以再拆出去。

資料庫與登入使用 Supabase，運算、佇列與排程在 GCP（見 [0021](0021-managed-backend-services-evaluation.md)、[0004](0004-gcp-compute-tokyo.md)）。

## 後果

### 正面

- 內測規模下，部署與維運成本低
- 重量級、有狀態的 session 讀取與 Core API 隔離。session 節點出問題不影響 App 使用
- 透過 Pub/Sub 解耦，讀取速度與處理（LLM）速度可各自擴展

### 負面 / 風險

- 模組邊界靠紀律維持，需在程式碼審查時把關
- 原始訊息會短暫停留在 Pub/Sub，最多 24 小時（見 [0027](0027-pubsub-topology.md)、[0011](0011-no-raw-message-retention.md)）

## 待決

- Gmail 新信通知進入 Pub/Sub 後，由哪個元件呼叫 Gmail API 取信
