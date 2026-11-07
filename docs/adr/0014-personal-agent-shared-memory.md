# 0014. 每位用戶一個個人 AI agent，跨通道共用記憶與對話上下文

- 狀態：已接受
- 日期：2026-11-07

## 背景與問題

用戶可以在三個地方跟自己的 AI agent 對話：App、LINE OA、WhatsApp 官方號（見 [0012](0012-official-accounts.md)）。需要決定這些是不是同一個 agent。

## 考慮的選項

1. 同一個 agent，記憶與對話上下文都共用
2. 同一個 agent，長期記憶共用，但各通道的對話串分開

## 決策

- **一位用戶一個 agent**。App、LINE OA、WhatsApp 官方號只是不同的對話入口
- **長期記憶**（例如偏好、常去地點）與**對話上下文**跨通道共用。用戶在 LINE OA 說的事，在 App 裡 agent 也知道
- agent 執行於 Core API 的 `agent` 模組，透過工具操作 task、行事曆與旅遊行程（見 [0016](0016-in-app-calendar.md)、[0017](0017-travel-itinerary-planning.md)）
- LLM 呼叫走 [0013](0013-llm-provider-abstraction.md) 的抽象層
- 長期記憶以 pgvector 做語意檢索，與其他資料存在同一個 Supabase Postgres（見 [0005](0005-supabase-postgres.md)）

## 後果

### 正面

- 用戶體驗一致，不必在不同通道重複說明
- 系統只需要維護一套 agent 邏輯與記憶

### 負面 / 風險

- 同一位用戶可能同時從多個通道發訊，需要處理並發與訊息順序
- 回覆要配合各通道的格式（App 的豐富 UI 與 LINE / WhatsApp 的訊息格式）
- 對話上下文跨通道累積得很快，需要摘要或截斷策略

## 待決

- 長期記憶的資料模型與寫入時機
- 對話上下文的長度管理策略
