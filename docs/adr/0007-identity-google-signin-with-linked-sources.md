# 0007. 帳號模型：只用 Google 登入，LINE / WhatsApp 為綁定的資料來源

- 狀態：已接受
- 日期：2026-11-07

## 背景與問題

需求提到支援 Google OAuth 註冊 / 登入，以及 LINE / WhatsApp「登入」來讀取訊息。若多個平台都可作為登入方式，就要處理帳號合併與身分衝突。

## 考慮的選項

1. 只用 Google 註冊 / 登入；LINE / WhatsApp 登入後在 App 內綁定，作為資料來源
2. Google 與 LINE Login 都可註冊 / 登入

## 決策

採用選項 1：

- **身分**：Google OAuth 是唯一的註冊（sign-up）與登入（sign-in）方式。一個 Google 帳號對應一個系統帳號
- **資料來源綁定**（登入後於 App 內操作）：
  - Gmail：額外的 OAuth 授權（見 [0008](0008-gmail-access.md)）
  - LINE / WhatsApp：掃 QR code 建立 linejs / whatsapp-web.js session（見 [0009](0009-line-whatsapp-unofficial-read-only.md)）
- **官方帳號對話身分**：用戶在 LINE OA / WhatsApp 官方號上的身分，另外綁定到同一個系統帳號，讓同一個 agent 認得用戶（見 [0012](0012-official-accounts.md)、[0014](0014-personal-agent-shared-memory.md)）

## 後果

### 正面

- 身分只有一個來源，不需要處理帳號合併
- 每個資料來源可以獨立綁定、解除綁定

### 負面 / 風險

- 沒有 Google 帳號的用戶無法使用
- 「登入用的 Google 授權」與「讀 Gmail 的授權」要分開設計，讓用戶可以只登入而不授權 Gmail

## 待決

- App 與 Core API 之間的 session / token 機制
- 官方帳號身分與系統帳號的綁定流程
