# 0010. LINE / WhatsApp session 以共用 worker pool 託管

- 狀態：已接受
- 日期：2026-11-07

## 背景與問題

依 [0009](0009-line-whatsapp-unofficial-read-only.md)，backend 要替每位用戶維持登入中的 LINE（linejs）與 WhatsApp（whatsapp-web.js）session。whatsapp-web.js 每個 session 要跑一個 headless Chromium，每個約佔 150–300MB 記憶體。

## 考慮的選項

1. 共用 worker pool：多個 worker 節點，每個節點承載多位用戶的 session，依用戶分片
2. 每位用戶一個 container

## 決策

採用**共用 worker pool**（即 [0002](0002-system-decomposition.md) 的 Ingestion worker，部署於 GCE Managed Instance Group，見 [0004](0004-gcp-compute-tokyo.md)）：

- 每個節點承載的用戶數有上限，做成可設定的值。先以保守值內測，再依壓測與實際記憶體用量調整
- **以 Postgres 租約分片**：每位用戶一筆租約。節點申領尚未被占用的用戶，並定期心跳續約。節點故障時租約過期，由其他節點自動接手，不需要另外的協調服務
- session 憑證以 **Cloud KMS 信封加密**後，存於節點之外的 Supabase Postgres。金鑰在 GCP、密文在 Supabase，單獨拿到資料庫無法解密
- KMS 金鑰**每年自動輪替**。新資料用新版本加密，舊版本保留供解密
- 節點故障時，該節點的用戶可在其他節點從存儲的憑證恢復，不需要用戶重新掃碼
- worker 只把讀到的訊息發佈到 Pub/Sub，不做 LLM 處理

## 後果

### 正面

- 在內測規模（< 100 人）下，資源使用比每人一個 container 有效率
- 節點可替換，單一節點故障不會永久失去用戶 session

### 負面 / 風險

- 同一節點的 session 互相影響（例如 Chromium 吃光記憶體），需要監控並限制每節點的 session 數
- 要自行實作租約申領、心跳、節點健康檢查與 session 遷移
- 租約過期到被接手之間，該用戶的訊息會暫時沒人讀取
- 金鑰每年才輪替一次，單一金鑰版本外洩時，影響的資料範圍較大
- 加密憑證的存放處與 KMS 解密權限都是高價值的攻擊目標，解密權限只能給 Ingestion worker

## 待決

- 每節點上限的初始值
- 租約的有效期與心跳間隔
