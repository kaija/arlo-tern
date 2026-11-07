# 0010. LINE / WhatsApp session 以共用 worker pool 託管

- 狀態：已接受
- 日期：2026-11-07

## 背景與問題

依 [0009](0009-line-whatsapp-unofficial-read-only.md)，backend 要替每位用戶維持登入中的 LINE（linejs）與 WhatsApp（whatsapp-web.js）session。whatsapp-web.js 每個 session 要跑一個 headless Chromium，每個約佔 150–300MB 記憶體。

## 考慮的選項

1. 共用 worker pool：多個 worker 節點，每個節點承載多位用戶的 session，依用戶分片
2. 每位用戶一個 container

## 決策

採用**共用 worker pool**（即 [0002](0002-system-decomposition.md) 的 Ingestion worker，部署於 GCE Managed Instance Group，見 [0004](0004-gcp-cloud-run-and-gce.md)）：

- 每個節點承載 N 位用戶的 session
- 依用戶分片（shard），把用戶分配到節點
- session 憑證**加密存儲**於節點之外。節點故障時，該節點的用戶可在其他節點從存儲的憑證恢復，不需要用戶重新掃碼
- worker 只把讀到的訊息發佈到 Pub/Sub，不做 LLM 處理

## 後果

### 正面

- 在內測規模（< 100 人）下，資源使用比每人一個 container 有效率
- 節點可替換，單一節點故障不會永久失去用戶 session

### 負面 / 風險

- 同一節點的 session 互相影響（例如 Chromium 吃光記憶體），需要監控並限制每節點的 session 數
- 要自行實作分片分配、節點健康檢查與 session 遷移
- 加密憑證的存放處是高價值的攻擊目標

## 待決

- 每節點的 session 上限與機型
- 分片分配與重新平衡的機制
- 憑證加密方式與金鑰管理
