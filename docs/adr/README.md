# Architecture Decision Records

本目錄記錄這個專案的架構決策。每個決策一份文件，採用 MADR 結構：狀態、背景、考慮過的選項、決定、後果。

產品是一個 travel planner App：替台灣用戶讀取 LINE 對話，從中找出 task 排進行事曆、在到期前提醒、對可疑訊息發出警告，並提供一個能規劃逐日逐時旅遊行程的個人 AI agent。MVP 是 100 人以下的內測。

## 索引

| # | 決策 | 狀態 |
|---|---|---|
| [0001](0001-line-ingestion-via-linejs.md) | 用 linejs 以後端 linked-device 讀取個人 LINE 對話；只讀不發；WhatsApp 延後 | 已接受 |
| [0002](0002-ban-risk-informed-consent.md) | 封號風險以明確告知並取得同意處理 | 已接受 |
| [0003](0003-ingestion-scope-oa-opt-in.md) | 一般帳號與群組預設讀取，其他官方帳號由用戶 opt-in | 已接受 |
| [0004](0004-message-retention-and-expiry.md) | 原始訊息保存期與到期處理：只刪原文，衍生資料保留 | 已接受 |
| [0005](0005-storage-security-level.md) | 儲存安全等級：只用磁碟加密，LINE 憑證明文存資料庫 | 已接受 |
| [0006](0006-llm-provider-and-model-tiers.md) | LLM 用 Claude API 直連；管線 Haiku 5.5、agent Opus 5.5 | 已接受 |
| [0007](0007-message-pipeline-debounced-window.md) | 訊息管線依對話做短視窗合併 | 已接受 |
| [0008](0008-task-confidence-triage-and-updates.md) | Task 依信心分流；後續變更由 AI 提出並依信心分流 | 已接受 |
| [0009](0009-scam-detection-llm-only.md) | 可疑訊息以純 LLM 判定 | 已接受 |
| [0010](0010-reminder-timing-with-guardrails.md) | 到期提醒由 AI 定時間，系統設護欄 | 已接受 |
| [0011](0011-outbound-boundary-and-oa-timeout.md) | 發訊邊界：官方帳號只 reply，逾時改用 App push | 已接受 |
| [0012](0012-oa-account-binding-one-time-code.md) | 官方帳號以 App 產生的一次性綁定碼綁定帳號 | 已接受 |
| [0013](0013-agent-framework-openai-agents-sdk-with-claude.md) | Agent 用 OpenAI Agents SDK (JS) 透過 AI SDK adapter 接 Claude | 已接受（有前置驗證） |
| [0014](0014-agent-memory-explicit-entries.md) | Agent 長期記憶採用明確的記憶條目 | 已接受 |
| [0015](0015-message-history-keyword-search.md) | Agent 以關鍵字加條件篩選檢索歷史訊息 | 已接受 |
| [0016](0016-trip-data-model.md) | 旅遊行程採用獨立的 Trip 結構 | 已接受 |
| [0017](0017-travel-data-google-maps-tools.md) | 旅遊外部資料用 Google Maps Platform 包成 agent 工具 | 已接受 |
| [0018](0018-app-expo-with-direct-fcm.md) | App 用 Expo 開發，推播由後端對 FCM 直送 | 已接受 |
| [0019](0019-backend-typescript-two-services.md) | 後端全 TypeScript，切成讀取服務與核心服務 | 已接受 |
| [0020](0020-postgresql-only-with-pg-boss.md) | 資料與佇列只用 PostgreSQL | 已接受 |
| [0021](0021-deployment-single-vm-then-ecs.md) | 內測用東京區域單一 VM 加 Docker Compose，正式上線轉 ECS Fargate | 已接受 |
| [0022](0022-compliance-scope.md) | 法遵範圍：刪除與中斷、同意紀錄與隱私政策、DPIA | 已接受 |
| [0023](0023-authentication-google-oauth.md) | 以 Google OAuth 登入，後端驗證後自發 session token | 已接受 |
| [0024](0024-whatsapp-oa-agent-channel.md) | MVP 提供 WhatsApp 官方帳號 agent 通道，長結果導回 App，設預算上限 | 已接受 |

## 系統概觀

```
┌──────────────┐      QR 連結       ┌─────────────────────┐
│  用戶的個人   │◄──────────────────│  讀取服務 connector  │
│  LINE 帳號    │──── 訊息（只讀）──►│  linejs，常駐連線     │
└──────────────┘                    └──────────┬──────────┘
                                               │ 訊息入庫 + 排入工作（同一交易）
                                               ▼
                                    ┌─────────────────────┐
                                    │     PostgreSQL       │
                                    │  資料 + job queue    │
                                    └──────────┬──────────┘
                                               │
┌──────────────┐   REST / SSE       ┌──────────▼──────────┐   Claude API
│  Expo App     │◄─────────────────►│   核心服務 core      │◄────────────► Haiku 5.5（管線）
│  行事曆 / agent│                   │  API、webhook、agent │               Opus 5.5（agent）
└──────▲───────┘                    │  管線 worker、提醒    │
       │ App push（FCM）             └───┬─────────────▲───┘──► Google Maps Platform
       └────────────────────────────────┘             │
                                                      │ webhook / reply
                                            ┌─────────┴─────────┐
                                            │ LINE 官方帳號      │
                                            │ WhatsApp 官方帳號  │
                                            └───────────────────┘
```

## 與建議不同的決定

下列決定採用的不是對齊過程中建議的選項。各 ADR 的「考慮過的選項」與「後果」記錄了建議的做法與接受的風險。

| ADR | 採用的做法 | 當時建議的做法 |
|---|---|---|
| 0003 | 一般帳號與群組預設讀取，其他官方帳號 opt-in | 含官方帳號在內全部預設讀取，可排除 |
| 0005 | 訊息內文只用磁碟加密 | 每用戶一把金鑰的應用層加密 |
| 0005 | LINE 憑證明文存資料庫 | 應用層加密，主金鑰只給讀取服務 |
| 0009 | 純 LLM 判定詐騙 | LLM 判定加外部訊號（詐騙網址清單等） |
| 0011 | 官方帳號回覆逾時改用 App push，請用戶回 App 看結果 | 逾時改用 LINE push message |
| 0013 | OpenAI Agents SDK 接 Claude | Anthropic SDK 的 Tool Runner 自架迴圈 |
| 0018 | 推播對 FCM 直送 | Expo Push Service |
| 0021 | 單一 VM 加 Docker Compose | 直接用 ECS Fargate |
| 0021 | AWS 東京區域 | AWS 台北區域 |
| 0024 | WhatsApp 的長結果一律導回 App | agent 做完直接回在 WhatsApp |

## 開工前要完成的驗證

| 項目 | 出處 | 不通過的後果 |
|---|---|---|
| OpenAI Agents SDK 的 adapter 在 Claude Opus 5.5 上的工具呼叫、串流、session、thinking 區塊回傳、對話摘要、關閉 tracing | ADR-0013 | 重開 ADR-0013 |
| linejs 對端對端加密訊息的解密範圍、裝置類型是否擠掉用戶的電腦版 LINE、100 個常駐連線的穩定性 | ADR-0001 | 重新評估 ADR-0001 |
| linejs 能否區分一般帳號與官方帳號的對話 | ADR-0003 | 調整讀取範圍的實作 |
| 服務停擺後 linejs 能否補收停擺期間的訊息 | ADR-0021 | 單機停擺會漏訊息，需在告知中說明 |
| Expo 專案取得 iOS 的 FCM registration token 的方式 | ADR-0018 | 調整推播整合方式 |
| LINE 開啟官方帳號並預填訊息的 URL scheme 在 iOS 與 Android 的行為 | ADR-0012 | 改成手動輸入綁定碼 |
| Google Maps Platform 對 Places 內容保存的條款 | ADR-0017 | 行程項目只存地點 ID |
| Apple 對第三方登入的審查要求 | ADR-0023 | 補上 Sign in with Apple |
| WhatsApp 台灣區 service message 的費率 | ADR-0024 | 無法訂定每月預算 |
| Meta 商業帳號驗證、電話號碼與顯示名稱審核的要求與時程 | ADR-0024 | WhatsApp 通道上線時程延後 |
| `wa.me` 連結預填訊息在 iOS 與 Android 的行為 | ADR-0024 | 改成手動輸入綁定碼 |

## 沒有逐項確認、直接採用的預設假設

這些是對齊時列出並一次確認的預設值，之後可以直接調整，不需要推翻 ADR：

- 連結 LINE 後只讀新進訊息，不回補連結前的歷史。（ADR-0001）
- MVP 只分析文字訊息，圖片、語音、檔案只記錄有這則訊息。（ADR-0001）
- 用戶可以把個別一般對話或群組加入排除清單。（ADR-0003）
- 保存期選項為 7 天、30 天、90 天，上限 90 天。（ADR-0004）
- 信心門檻初始值 0.8，做成可調設定，用 eval 集校準。（ADR-0008）
- LINE 連線被登出或失效時，用 App push 請用戶重新連結。（ADR-0001）
- App 內的 agent 對話用 SSE 串流；預設時區 Asia/Taipei。（ADR-0010、ADR-0013）
- 應用程式日誌不記錄訊息內文。

下列幾項是撰寫 ADR 時補上的設計，對齊時沒有問過，請特別留意是否符合預期：

- 中斷 LINE 連結時，已保存的原始訊息預設一併刪除。（ADR-0022）
- 可疑訊息的通知分級：高信心推播、中信心只在 App 內標示。（ADR-0009）
- 推播 payload 只放概述，不放訊息原文。（ADR-0018）
- 官方帳號回覆接近期限時，用 reply token 先回一則「處理中」的訊息。（ADR-0011）
- 內測以邀請名單限制可註冊的 Google 帳號；token 的簽發與輪替方式。（ADR-0023）
- 訊息管線不自動建立 Trip，也不從 LINE 對話自動產生 agent 記憶。（ADR-0014、ADR-0016）
- 各 ADR 中標示為「初始值」的數字（合併視窗 45 秒、提醒上限 3 個、勿擾時段、OA 回覆期限 50 秒等）。

## 尚未決定的事項

- WhatsApp 官方帳號的每月預算、每人每日則數上限、長結果的長度門檻。要等查清台灣區費率後訂定。（ADR-0024）
- agent 對話紀錄的保存期限。（ADR-0014）
- 旅遊行程項目的提醒規則。（ADR-0016）
- 「取消 task」是否使用比新增與修改更高的信心門檻。（ADR-0008）
- 記憶條目的數量上限。（ADR-0014）
- 讀取個人 WhatsApp 對話的導入時程與 session 保存方式。（ADR-0001）

## 正式上線前必須重新檢視

- 儲存安全等級。（ADR-0005）
- 封號風險的處理方式是否適用於一般大眾。（ADR-0002）
- 部署轉到 ECS Fargate 與 RDS。（ADR-0021）
- 資料匯出功能、外洩通報流程、法律顧問審閱。（ADR-0022）

## 新增 ADR 的慣例

- 檔名：四位數流水號加英文短標題，例如 `0024-add-web-search-tool.md`。
- 內文用繁體中文，技術名詞保留英文。
- 已接受的 ADR 不改寫決定。要推翻時新增一份 ADR，並把舊的狀態改成「已被 ADR-00XX 取代」。
- 調整預設假設與初始值不需要新的 ADR，直接更新對應的文件即可。
