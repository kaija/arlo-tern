# ADR-0018：App 用 Expo 開發，推播由後端對 FCM 直送

- 狀態：已接受
- 日期：2026-11-13
- 相關：ADR-0009、ADR-0010、ADR-0011、ADR-0022、ADR-0023

## 背景

App 指定使用 React Native。push notification 是本產品唯一的主動通知管道（見 ADR-0011）：到期提醒、可疑訊息警告、連線失效通知、OA 長任務完成通知都靠它。需要決定 App 的建置方式與推播的發送路徑。

## 考慮過的選項

1. **Expo 加 Expo Push Service**：後端只要呼叫一個 API 就同時送 iOS 與 Android，最省事；推播內容會經過 Expo。
2. **Expo 加 FCM 直送**：App 仍用 Expo 開發，後端直接對 Firebase Cloud Messaging 發送，iOS 由 FCM 轉 APNs。少經過 Expo 一手，投遞狀態較細；要自己管 Firebase 專案、憑證與 token 生命週期。
3. **純 React Native 加原生推播**：對原生層控制最完整，但建置、簽章、升版都要自己維護。

## 決定

採用選項 2。這不是對齊過程中建議的選項（建議的是選項 1）。

### App

- 用 **Expo**（development build 與 EAS Build）開發 React Native App，語言為 TypeScript。
- 內測透過 TestFlight（iOS）與 Google Play 的 internal testing（Android）發佈。
- App 與後端共用 monorepo 內的型別定義（見 ADR-0019）。
- 登入憑證存放在裝置的安全儲存區（見 ADR-0023）。

### 推播

- 後端直接呼叫 **Firebase Cloud Messaging（FCM）HTTP v1 API** 發送推播。Android 由 FCM 直接投遞，iOS 由 FCM 轉送 APNs。
- App 取得 FCM 的 registration token 後回報給後端，後端依用戶與裝置保存。一個用戶可以有多台裝置。
- token 生命週期：App 每次啟動與 token 更新時回報；FCM 回應 token 失效時，後端刪除該 token；用戶登出時刪除該裝置的 token。
- 推播類型：到期提醒、可疑訊息警告、LINE 連線失效、OA 長任務完成。每一類用戶可以分別開關（可疑訊息警告預設開啟）。
- **payload 只放概述，不放訊息原文與第三方內容**。例如可疑訊息警告只說「某個對話出現可疑訊息」，task 提醒只放 task 標題。細節在用戶點開後由 App 向後端載入。推播會經過 Google 與 Apple 的伺服器，並可能顯示在鎖定畫面。
- 推播發送失敗時重試；提醒類推播超過有效時間就不再補發。

## 後果

### 正面

- 推播不經過 Expo，少一個委外處理者。
- 直接拿到 FCM 的投遞回應，token 失效能即時清理。
- App 開發仍享有 Expo 的建置與更新流程。

### 負面與接受的風險

- 要自己管理 Firebase 專案、服務帳號金鑰、APNs 金鑰與 FCM 的對應設定。
- 在 Expo 專案中取得 iOS 的 FCM registration token 需要額外的原生模組與設定（Expo 的通知模組在 iOS 預設取得的是 APNs token）。具體用哪個套件在實作時確認，並需要 development build，無法用 Expo Go。
- 推播是唯一的主動通知管道。用戶關閉通知權限、或裝置的省電機制延遲投遞時，提醒與警告就到不了。App 內要有通知中心作為備援，並在權限關閉時提示用戶。
- 推播的投遞不保證即時，可疑訊息警告的總延遲是管線延遲（見 ADR-0007）加上投遞延遲。
