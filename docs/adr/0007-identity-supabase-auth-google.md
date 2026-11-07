# 0007. 帳號模型：以 Supabase Auth 的 Google 登入為唯一身分，LINE / WhatsApp 為綁定的資料來源

- 狀態：已接受
- 日期：2026-11-07

## 背景與問題

需求提到支援 Google OAuth 註冊 / 登入，以及 LINE / WhatsApp「登入」來讀取訊息。若多個平台都可作為登入方式，就要處理帳號合併與身分衝突。小規模時希望使用託管的登入服務，日後也要能更換（見 [0021](0021-managed-backend-services-evaluation.md)）。

## 考慮的選項

身分模型：

1. 只用 Google 註冊 / 登入；LINE / WhatsApp 登入後在 App 內綁定，作為資料來源
2. Google 與 LINE Login 都可註冊 / 登入

登入服務：

1. Supabase Auth
2. Firebase Auth
3. WorkOS AuthKit
4. 自己對接 Google OAuth

## 決策

- **身分**：Google 是唯一的註冊（sign-up）與登入（sign-in）方式。一個 Google 帳號對應一個系統帳號
- **登入服務**：**Supabase Auth** 的 Google provider
  - App 只使用 Supabase 的登入 SDK 取得 session，不透過它存取資料（見 [0022](0022-vendor-portability-rules.md)）
  - Core API 以 JWKS 驗證 Supabase 簽發的 JWT。驗證邏輯封裝在內部的 auth 介面之後，業務程式碼只拿到系統內部的用戶 ID
- **資料來源綁定**（登入後於 App 內操作）：
  - Gmail：用我們自己的 Google OAuth client 另外授權，與登入分開（見 [0008](0008-gmail-access.md)）
  - LINE / WhatsApp：掃 QR code 建立 linejs / whatsapp-web.js session（見 [0009](0009-line-whatsapp-unofficial-read-only.md)）
- **官方帳號對話身分**：用戶在 LINE OA / WhatsApp 官方號上的身分，另外綁定到同一個系統帳號，讓同一個 agent 認得用戶（見 [0012](0012-official-accounts.md)、[0014](0014-personal-agent-shared-memory.md)）

## 後果

### 正面

- 身分只有一個來源，不需要處理帳號合併
- 不必自己實作 session 與 token 更新
- 用戶資料存在自己的 Postgres（Supabase 的 auth schema），遷移時資料可以跟著走
- 用戶可以只登入而不授權 Gmail；每個資料來源都能獨立綁定、解除綁定

### 負面 / 風險

- 沒有 Google 帳號的用戶無法使用
- 更換登入服務時，App 的登入流程與 Core API 的 auth adapter 都要換，用戶可能需要重新登入
- Supabase Auth 故障時無法登入

## 待決

- 官方帳號身分與系統帳號的綁定流程
