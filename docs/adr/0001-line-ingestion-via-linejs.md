# ADR-0001：用 linejs 以後端 linked-device 讀取個人 LINE 對話

- 狀態：已接受
- 日期：2026-11-13
- 相關：ADR-0002、ADR-0003、ADR-0005、ADR-0011、ADR-0019

## 背景

產品的核心是替用戶讀取個人 LINE / WhatsApp 對話，從中找出 task 並對可疑訊息發出警告。需求要求用戶「登入」自己的 LINE / WhatsApp，並由後端一個獨立的 service 讀取訊息。

LINE 與 WhatsApp 都沒有官方 API 能讀取個人帳號的對話。LINE Messaging API 與 WhatsApp Cloud API 只服務官方帳號與商業帳號。要讀個人對話只能走非官方途徑。

目標用戶是台灣用戶，LINE 是主要的通訊工具。MVP 是 100 人以下的內測。

## 考慮過的選項

1. **後端 linked-device 非官方 client**：用戶掃 QR code，把後端服務掛成自己帳號的已連結裝置。iOS 與 Android 都能用，看得到雙向對話。違反平台條款，帳號有被封風險。
2. **Android 通知擷取**（NotificationListenerService）：不碰平台協定，但只支援 Android、只看得到收到的訊息、沒有歷史，也不是後端 service 讀取。
3. **用戶匯出或轉傳**：完全合規，但不是即時的，可疑訊息警告與自動抽取 task 的價值大幅下降。
4. **混合**：WhatsApp 走 linked-device，LINE 走 Android 通知擷取。要維護兩套機制，iOS 用戶讀不到 LINE。

平台範圍另外考慮了三種：兩個平台同時上、先 WhatsApp、先 LINE。

## 決定

採用選項 1，並指定函式庫：

- **LINE**：[linejs](https://github.com/evex-dev/linejs)（`@evex/linejs`）。MVP 只做 LINE。
- **WhatsApp**：延後到 MVP 之後，屆時用 [whatsapp-web.js](https://github.com/wwebjs/whatsapp-web.js)。延後的只有「讀取個人 WhatsApp 對話」；透過 WhatsApp 官方帳號跟 agent 對話是另一件事，在 MVP 範圍內，見 ADR-0024。

實作約束：

- **只讀不發**。讀取服務對外的 connector 介面不提供任何發訊、已讀、加好友、改設定的方法。個人帳號永遠不會由系統發出訊息。
- 讀取服務先定義平台無關的 connector 介面（連結、中斷連結、訊息事件、連線狀態事件），LINE 是第一個實作，WhatsApp 之後接同一個介面。
- 用戶以 QR code 連結。linejs 的 QR 登入在新裝置需要手機確認與 pincode，App 的連結流程要引導這兩步。
- linejs 的 session 狀態透過自訂 storage（繼承它的 `BaseStorage`）存進 PostgreSQL，不使用內建的 `FileStorage`。
- 連結後只讀新進訊息，不回補連結前的歷史。
- MVP 只分析文字訊息。圖片、語音、檔案只記錄有這則訊息與類型，不下載也不分析內容。
- 連線被 LINE 登出或失效時，標記連線狀態並用 App push 請用戶重新連結。

## 後果

### 正面

- 符合「登入 LINE」與「獨立 service 讀取」的用戶故事，iOS 與 Android 行為一致。
- linejs 是純協定 client，不需要瀏覽器，每個用戶的資源成本低。
- MVP 只維護一套非官方 client。

### 負面與接受的風險

- 使用非官方 client 違反 LINE 的使用條款，用戶帳號可能被封鎖或強制登出。處理方式見 ADR-0002。
- linejs 依賴逆向的協定，LINE 改版可能讓讀取功能一夕失效，修復時程取決於上游專案。
- 讀取服務持有可以代表用戶行動的憑證，憑證的保存方式見 ADR-0005。
- 讀不到連結前的訊息；圖片形式的帳單與通知不會被抽成 task。
- 之後加入 whatsapp-web.js 時，每個帳號需要一個 Chromium。次級來源估計每個 session 約 400–500 MB 記憶體，這個數字沒有實測過；社群也回報它的 `RemoteAuth` 在重啟後還原不穩定。加入 WhatsApp 前要重新評估資源與 session 保存方式。

## 待驗證

- linejs 對 LINE Letter Sealing（端對端加密）訊息的解密支援範圍。查到的資料提到它有 E2EE 支援，但沒有確認對一對一與群組訊息的涵蓋程度。
- linejs 模擬的裝置類型，以及它是否會把用戶既有的電腦版 LINE 擠下線。
- 100 個常駐連線在單一 Node 程序內的記憶體與穩定性。
