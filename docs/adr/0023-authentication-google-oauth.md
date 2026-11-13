# ADR-0023：以 Google OAuth 登入，後端驗證後自發 session token

- 狀態：已接受
- 日期：2026-11-13
- 相關：ADR-0012、ADR-0018、ADR-0022

## 背景

需求指定用戶以 Google OAuth 註冊與登入。這是既定的產品需求，本 ADR 記錄的是實作方式。對齊過程中沒有逐項討論這裡的細節，以下內容是依一般做法訂的預設設計。

App 帳號是所有資料的歸屬主體：LINE 連結、官方帳號綁定（見 ADR-0012）、task、行程、記憶都掛在它底下。

## 考慮過的選項

1. **後端驗證 Google ID token 後自發 session token**：App 取得 Google 的 ID token，後端驗證後發自己的 access token 與 refresh token。
2. **直接用 Google 的 token 當 API 憑證**：每次請求都驗證 Google token。少一套 token 機制，但 session 的有效期與撤銷受制於 Google，也無法做自己的登出與裝置管理。
3. **使用託管的身分服務**（例如 Cognito、Auth0、Firebase Auth）：功能完整，但多一個委外處理者與一層整合。

## 決定

採用選項 1。

- MVP 只支援 Google 登入，沒有密碼登入。
- App 用 Google 登入流程取得 **ID token**，送到後端。
- 後端驗證 ID token：簽章、簽發者、對象（必須是本產品的 client ID）、有效期。驗證通過後，以 Google 帳號的穩定識別碼（`sub`）找到或建立 App 帳號。**不以 email 作為帳號的主鍵**，email 只作為顯示與聯絡用途。
- 後端簽發自己的 token：
  - **access token**：短效，帶在每次 API 請求。
  - **refresh token**：長效、每次使用就輪替；資料庫只存雜湊值；偵測到已輪替的舊 token 被重用時，撤銷該裝置的整串 token。
- App 把 token 存在裝置的安全儲存區（iOS Keychain、Android Keystore）。
- 登出時撤銷該裝置的 refresh token，並刪除該裝置的推播 token（見 ADR-0018）。
- 首次登入時必須完成同意流程（見 ADR-0022）才建立帳號。
- 只向 Google 要求登入所需的最小範圍（基本個人資料與 email），不要求存取 Google Calendar、Gmail 等資料。行事曆不與外部同步是既定決定。
- 內測階段以邀請名單限制可註冊的 Google 帳號，把用戶數控制在 100 人以下。

## 後果

### 正面

- session 的有效期、撤銷、裝置管理都由自己掌控。
- 不保存任何密碼。
- 不多加身分服務供應商。

### 負面與接受的風險

- 要自己實作並維護 token 的簽發、輪替與撤銷，這是安全敏感的程式碼，需要完整的測試。
- 用戶失去 Google 帳號的存取權時，就無法登入 App 帳號；MVP 沒有備援的登入方式或帳號復原流程。
- 登入完全依賴 Google 的服務可用性。

## 待確認

- **Apple 的 App Store 審查規範**對提供第三方登入的 App 有額外要求（需同時提供符合特定隱私條件的登入選項，例如 Sign in with Apple）。TestFlight 的外部測試也需要經過審查。內測發佈到 iOS 之前要確認當時的規範，必要時補上 Sign in with Apple，並以新的 ADR 記錄帳號合併的規則。
