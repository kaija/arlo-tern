# 0008. Gmail 存取：gmail.readonly + Pub/Sub 推播，MVP 使用 OAuth 測試模式

- 狀態：已接受
- 日期：2026-11-07

## 背景與問題

backend 需要讀取用戶的 email 來抽取 task 與偵測可疑郵件。`gmail.readonly` 屬於 Google 的**受限 scope**，正式發布前必須通過 Google 驗證與 CASA 安全評估。OAuth 同意畫面在「測試」狀態下最多允許 100 位測試用戶，剛好符合 MVP 的內測規模。

## 考慮的選項

1. MVP 留在 OAuth 測試模式，公開上線前再做驗證與 CASA
2. MVP 就申請正式驗證與 CASA

## 決策

- Scope：`gmail.readonly`（只讀）
- 授權：使用我們自己的 Google OAuth client，與登入（Supabase Auth，見 [0007](0007-identity-supabase-auth-google.md)）分開
- refresh token：以 Cloud KMS 信封加密後，存於 Supabase Postgres
- 新信偵測：Gmail `users.watch` 推送到 **Cloud Pub/Sub**，不輪詢
- MVP：OAuth 同意畫面維持**測試模式**，用戶須先加入測試用戶名單
- **內測期間就同步啟動** Google 驗證與 CASA 安全評估，在公開上線、或測試用戶超過 100 人之前完成

## 後果

### 正面

- 內測不必等漫長的審查流程
- 推播模式延遲低，也不浪費 API 配額

### 負面 / 風險

- 測試模式下，外部用戶類型的 refresh token 約 **7 天**就過期，內測用戶需定期重新授權 Gmail，App 要能偵測並引導重新授權
- `users.watch` 也有效期限（最長 7 天），需要排程定期續訂
- 內測人數上限 100 人，要擴大就必須先完成驗證
- CASA 評估有時間與費用成本。內測期間就要準備安全文件與評估，會分走開發人力

## 待決

- CASA 評估的負責人
