# ADR-0013：Agent 用 OpenAI Agents SDK (JS) 透過 AI SDK adapter 接 Claude

- 狀態：已接受（有前置驗證，見下）
- 日期：2026-11-13
- 相關：ADR-0006、ADR-0011、ADR-0014、ADR-0015、ADR-0016、ADR-0017、ADR-0019

## 背景

個人 AI agent 要做旅遊規劃、查詢並更新用戶的 todo 與行程、記得用戶說過的事。它需要一個 agent 迴圈（模型呼叫工具、取得結果、繼續），以及存取自家資料庫的工具。agent 有三個對話通道：App、LINE 官方帳號、WhatsApp 官方帳號。

LLM 已決定用 Claude Opus 5.5（見 ADR-0006）。

## 考慮過的選項

執行方式：

1. **自架 tool loop**：用 Anthropic SDK 的 Tool Runner 在自己的後端跑 agent 迴圈。
2. **Claude Managed Agents**：由 Anthropic 代管迴圈與 session。對話狀態存在 Anthropic，仍在 beta，用不到它的代管沙箱。
3. **工作流程框架**（LangGraph 等）：對單一 agent 的 MVP 偏重。
4. **OpenAI Agents SDK (JS)**（[文件](https://openai.github.io/openai-agents-js/)）：由用戶指定。

選定 OpenAI Agents SDK 之後，背後的模型：

1. **接 Claude**：透過 `@openai/agents-extensions/ai-sdk` adapter 包一個 Vercel AI SDK 的模型（`@ai-sdk/anthropic`）。維持單一 LLM 供應商。
2. agent 改用 OpenAI 模型：SDK 原生路徑最穩定，但多一個委外處理者。
3. 管線與 agent 全部改用 OpenAI。

## 決定

- agent 框架用 **OpenAI Agents SDK (JS/TS)**。這不是對齊過程中建議的選項（建議的是選項 1 自架 tool loop），由用戶指定。
- 背後的模型用 **Claude Opus 5.5**，透過 AI SDK adapter 接 `@ai-sdk/anthropic`。
- agent 在核心服務內執行（見 ADR-0019）。所有工具都是自家定義的 function tool，直接存取自家資料庫或外部 API：
  - task：查詢、新增、修改、完成、取消（見 ADR-0008）；
  - 行程：查詢與編輯 Trip 與行程項目（見 ADR-0016）；
  - 記憶：新增、修改、刪除記憶條目（見 ADR-0014）；
  - 歷史訊息檢索（見 ADR-0015）；
  - 地點與路線查詢（見 ADR-0017）。
- **每個工具的資料範圍由伺服器端依已驗證的用戶身分決定**，工具參數不接受用戶識別碼。模型無法要求讀寫其他用戶的資料。
- 不使用 OpenAI 的 hosted tools（web search、file search 等）。
- 對話狀態（session）存在自家的 PostgreSQL，每個通道各自保留近期對話（見 ADR-0014）。
- App 通道以 SSE 串流回應；LINE 官方帳號的回覆方式見 ADR-0011，WhatsApp 官方帳號見 ADR-0024。
- **不得把任何用戶資料送到 OpenAI**。SDK 內建的 tracing 必須關閉，或改接自有的 exporter。SDK 的 tracing 預設行為需要在前置驗證中確認。
- 執行期不需要 OpenAI API key；若 SDK 在沒有 key 時有警告或預設行為，在前置驗證中一併處理。

## 前置驗證（開始實作 agent 之前完成）

查到的資料顯示 adapter 仍在 beta，而且沒有文件說明 sessions、handoffs 搭配非 OpenAI 模型的行為。開工前先做一個小實測，確認下列項目在 Claude Opus 5.5 上可用：

1. function tool 呼叫與平行工具呼叫，多輪迴圈能正常結束。
2. 串流輸出。
3. 自訂 session 儲存（存 PostgreSQL），跨輪對話能正確還原。
4. Claude 的 thinking 區塊在多輪工具呼叫之間被原樣帶回。Opus 5.5 無法關閉 thinking，且要求 thinking 區塊在同一段對話內原樣回傳；adapter 若丟掉或改動它們，可能導致錯誤或品質下降。
5. 框架不會送出強制的 `tool_choice`（Opus 5.5 不支援，會回 400）。
6. prompt caching 的控制是否能透過 adapter 設定；不能的話評估對成本的影響。
7. tracing 可以完全關閉，確認沒有資料送往 OpenAI。
8. 對話過長時以摘要取代較舊輪次的做法（見 ADR-0014）是否可行。Opus 5.5 的 thinking 區塊綁定在產生它的那段對話上，改寫歷史可能讓後面的 thinking 區塊失效。需要確認摘要要怎麼做才不會出錯，例如以摘要開啟一段新的對話，而不是就地改寫既有歷史。

**若第 1 到 5 項有任何一項無法解決，本 ADR 需要重開**，候選替代方案是選項 1（Anthropic SDK 的 Tool Runner）。

## 後果

### 正面

- 框架提供現成的 agent 迴圈、工具定義、guardrails 與 session 抽象。
- 與讀取服務、核心服務同為 TypeScript（見 ADR-0019）。
- LLM 供應商維持只有 Anthropic，法遵敘述不變。

### 負面與接受的風險

- 走的是框架的非主要路徑：adapter 在 beta，Claude 的新功能要等 AI SDK 與 adapter 都支援才能用。
- 多兩層抽象（Agents SDK 與 AI SDK），出問題時要追三個專案的版本相容性。
- Claude 的原生功能（原生 web search 工具、prompt caching 的細部控制、thinking 顯示設定）不一定能透過 adapter 使用。
- agent 的工具會讀到不可信的內容（歷史訊息、地點資料）。這些內容可能夾帶針對模型的指令，而 agent 有寫入工具。緩解方式：工具結果一律當資料處理、破壞性操作（大量刪除、取消多個 task）要求用戶在對話中確認、所有 agent 寫入都留變更紀錄可還原（見 ADR-0008）。
