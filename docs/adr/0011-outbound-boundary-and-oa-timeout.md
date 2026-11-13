# ADR-0011：發訊邊界——官方帳號只 reply，逾時改用 App push

- 狀態：已接受
- 日期：2026-11-13
- 相關：ADR-0001、ADR-0012、ADR-0013、ADR-0018、ADR-0024

## 背景

產品已決定「只讀不發」：個人 LINE / WhatsApp 只用來讀取，所有發訊走手機 push。但需求同時要求用戶可以透過官方帳號（OA）跟 agent 對話，OA 必須回訊。這兩者的邊界需要界定。

LINE Messaging API 的相關限制：

- reply token 必須在收到 webhook 後一分鐘內使用，逾時不保證成功，而且每個 token 只能用一次。LINE 註明這個時限可能不經通知就變動。
- reply message 不計入每月訊息額度；push message 會計入。
- loading animation API 可以在一對一聊天顯示 5 到 60 秒的載入動畫。

agent 用 Claude Opus 5.5 做多日行程規劃時，處理時間很可能超過一分鐘。

## 考慮過的選項

發訊範圍：

1. **OA 只回覆對話**：系統主動的提醒與警告一律走 App push。
2. **OA 也主動推送**提醒與警告：觸達率較高，但 push message 要計費，且與既定決定牴觸。
3. **MVP 不做 OA**：省工，但少一個用戶故事。

OA 回覆逾時：

1. **reply 優先，逾時改 LINE push message**：用戶不必離開 LINE，但會計入訊息額度。
2. **嚴格只用 reply**，逾時的結果寫進 App 並用 App push 通知。
3. **OA 只做短任務**，長任務直接請用戶到 App。

## 決定

發訊邊界：

- **個人帳號永遠只讀不發**（見 ADR-0001）。
- **OA 只在用戶主動傳訊時用 reply 回覆**，永不使用 LINE push message、multicast 或 broadcast。
- **系統主動發出的通知**（到期提醒、可疑訊息警告、連線失效通知）**一律走 App push**（見 ADR-0018）。

OA 回覆逾時的處理：reply 優先，超過時間就用 App push 通知用戶回 App 看結果。這是用戶自己提出的做法，最接近選項 2；對齊過程中建議的是選項 1（逾時改用 LINE push message）。

- 收到 OA webhook 後立即回應 HTTP 200，並呼叫 loading animation API 顯示載入動畫。agent 在背景執行。
- agent 在約 50 秒內完成：用 reply token 回覆結果。
- 接近 50 秒仍未完成：用 reply token 回覆一則「還在處理，完成後會用 App 通知你」的訊息（token 就此用掉），agent 繼續執行。完成後把結果寫進 App 內的 agent 對話，並發 App push 請用戶回 App 查看。
- 50 秒是初始值，留出網路與 LINE 端處理的餘裕；因為 LINE 可能調整時限，這個值做成設定。
- App 內的 agent 對話會顯示來自 OA 通道的這一輪問答，讓用戶回到 App 時看得到完整脈絡。

## 後果

### 正面

- 邊界清楚：個人帳號不發訊，OA 不主動發訊，主動通知只走 App push。
- 不使用 LINE push message，不產生 LINE 訊息費用。
- 長任務不會因為 reply token 過期而遺失結果。

### 負面與接受的風險

- 在 OA 發起的長任務，結果要回 App 才看得到，體驗有斷點。
- 用戶若沒有開啟 App 的推播權限，就收不到「結果已完成」的通知，只能自己回 App 查看。
- 每個 webhook 只有一個 reply token，一次只能回覆一批訊息（LINE 單次 reply 有則數上限），長回覆要在一次 reply 內分則送完。
- loading animation 只在用戶開著聊天室時顯示，而且只支援一對一聊天。

## 適用範圍

本 ADR 的逾時規則只適用於 **LINE 官方帳號**。WhatsApp 官方帳號的 agent 通道同樣在 MVP 內提供，但平台限制不同（沒有短效 reply token、回覆要計費），回覆規則與費用控管另見 ADR-0024。「只回覆用戶主動提問、系統主動通知只走 App push」的發訊邊界兩個通道相同。
