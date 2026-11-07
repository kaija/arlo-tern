# 0015. Task 抽取：依信心分數決定直接加入或待確認

- 狀態：已接受
- 日期：2026-11-07

## 背景與問題

App 要顯示 AI 從用戶對話中找出的 task，並排到行事曆上。抽取可能出錯：誤判或時間理解錯誤。全部自動加入會讓行事曆充滿雜訊，全部要確認又太麻煩。

## 考慮的選項

1. 一律進入待確認清單
2. 全部自動加入
3. 依信心分數分流

## 決策

- **抽取來源**：
  - App 內與 AI agent 的對話
  - LINE 對話（linejs，見 [0009](0009-line-whatsapp-unofficial-read-only.md)）
  - WhatsApp 對話（whatsapp-web.js，見 [0009](0009-line-whatsapp-unofficial-read-only.md)）
  - Gmail 郵件（見 [0008](0008-gmail-access.md)）
- **分流**：每個抽出的 task 帶有信心分數
  - 高信心：直接加入行事曆
  - 低信心：進入 App 內的**待確認清單**，用戶確認後才加入
- 每個 task 保留來源參照 ID（不保留原文，見 [0011](0011-no-raw-message-retention.md)），讓用戶知道 task 從哪裡來
- 抽取在 Processing worker 執行（見 [0002](0002-system-decomposition.md)）

## 後果

### 正面

- 明確的 task 不需要用戶操作，模糊的 task 不會直接污染行事曆
- 用戶的確認 / 拒絕可作為之後調整門檻的依據

### 負面 / 風險

- 信心分數需要校準，門檻設錯時效果會比單一策略更差
- 同一件事可能在多個來源出現（例如 email 與 LINE 都提到同一個會議），需要去重

## 待決

- 信心分數的計算方式與門檻值
- 跨來源去重的規則
- 官方帳號上的 agent 對話是否也作為抽取來源
