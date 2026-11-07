# 0020. App 使用 React Native + Expo（EAS）

- 狀態：已接受
- 日期：2026-11-07

## 背景與問題

App 指定使用 React Native，需要決定使用 Expo 或 bare React Native，這也影響推播的實作方式。

## 考慮的選項

1. Expo + EAS
2. Bare React Native + Firebase Cloud Messaging

## 決策

- 使用 **Expo**，路由採用 **Expo Router**
- 建置與發布使用 **EAS Build**
- 推播使用 **Expo Push Service**（底層為 FCM / APNs）
- 需要原生模組時，以 Expo config plugin 整合

## 後果

### 正面

- 開發與建置流程簡單，iOS / Android 共用一套程式碼
- 推播不必自行對接 FCM 與 APNs

### 負面 / 風險

- 推播多一層對 Expo 服務的依賴
- 少數原生需求可能需要自行撰寫 config plugin

## 待決

- App 端狀態管理與資料取得方式
