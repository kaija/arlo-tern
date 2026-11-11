# 0027. Pub/Sub 拓撲：依來源分 topic，原文最多保留 24 小時

- 狀態：已接受
- 日期：2026-11-11

## 背景與問題

Ingestion worker 與 Gmail 推播把訊息送進 Pub/Sub，由 Processing worker 處理（見 [0002](0002-system-decomposition.md)）。依 [0011](0011-no-raw-message-retention.md)，原始訊息只能在管線中短暫停留。保留太短，LLM 或處理服務故障時訊息會遺失，可能漏掉詐騙警告；保留太長，原文暴露的時間就變長。

## 考慮的選項

topic 劃分：

1. 依來源分 topic
2. 單一 topic，以 attribute 標示來源

保留上限：10 分鐘、1 小時、24 小時

## 決策

- **依來源分 topic**：
  - `line-messages`：Ingestion worker 發佈的 LINE 訊息
  - `whatsapp-messages`：Ingestion worker 發佈的 WhatsApp 訊息
  - `gmail-notifications`：Gmail `users.watch` 的新信通知
- 每個 topic 各自設定重送策略與 dead-letter topic，各自監控
- **保留上限 24 小時**：所有含原文的 subscription 與 dead-letter topic，訊息保留時間都不超過 24 小時，過期即丟棄

## 後果

### 正面

- 單一來源出問題（例如 WhatsApp 函式庫失效、訊息暴增）不會拖累其他來源
- 處理服務或 LLM 故障數小時內，訊息仍可補處理

### 負面 / 風險

- 原文在佇列中最多可能停留 24 小時，比「處理完即丟棄」的理想情況長
- 故障超過 24 小時的訊息會永久遺失，不會產生 task 或警告
- topic 與 subscription 數量較多，要用 Terraform 管理（見 [0026](0026-cicd-and-iac.md)）
- Gmail 的推播通知只帶有 history ID，不含郵件內容。取信要另外呼叫 Gmail API（見 [0002](0002-system-decomposition.md) 的待決）
