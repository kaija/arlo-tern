# ADR-0006：LLM 用 Claude API 直連，管線用 Haiku 5.5、agent 用 Opus 5.5

- 狀態：已接受
- 日期：2026-11-13
- 相關：ADR-0007、ADR-0009、ADR-0013、ADR-0022

## 背景

原始對話內容會送進 LLM 做三件事：task 抽取、詐騙判定、agent 對話。LLM 供應路徑決定個資跨境傳輸與委外處理的對象。兩類工作的性質不同：

- **訊息管線**（task 抽取與詐騙判定）：量大、每次輸入短、輸出是結構化資料。
- **agent 對話**：量小、需要多步驟規劃與工具使用。

## 考慮過的選項

供應路徑：

1. **Claude API 直連**（Anthropic）：功能最完整，新模型同步上線。多一個委外處理者，內容跨境傳到美國。
2. **Claude on Amazon Bedrock**：資料留在 AWS 帳號邊界內，委外處理者只有 AWS 一家；部分功能與新模型上線較慢。
3. **多供應商抽象層**：彈性最高，內測用不到。
4. **自架開源模型**：訊息不出自家環境，但繁體中文的抽取與台灣詐騙判斷品質較差，GPU 與維運成本過高。

模型分層：

1. **管線 Haiku 5.5、agent Opus 5.5**
2. 管線 Sonnet 5.5、agent Opus 5.5
3. 全部 Opus 5.5
4. Haiku 初篩，命中再用 Opus 複核

## 決定

- 供應路徑：**Claude API 直連**。
- 訊息管線：**Claude Haiku 5.5**（`claude-haiku-5-5`）。
- agent：**Claude Opus 5.5**（`claude-opus-5-5`），透過 OpenAI Agents SDK 呼叫（見 ADR-0013）。
- 管線的輸出用 structured outputs 約束成固定 schema。
- 管線的品質用一組標註過的 eval 集驗證（真實風格的對話片段，含 task 與詐騙案例）。品質不足時的升級路徑是把管線換成 Claude Sonnet 5.5。

## 成本粗估

| 模型 | 輸入（每百萬 token） | 輸出（每百萬 token） |
|---|---|---|
| Claude Haiku 5.5 | $0.10 | $0.50 |
| Claude Sonnet 5.5 | $2.00 | $10.00 |
| Claude Opus 5.5 | $4.00 | $20.00 |

Haiku 5.5 的價格適用於 10 萬 token 以內的 prompt。

以「100 人、每人每天 100 個合併視窗、每次 2,000 個輸入 token」粗估，管線每天約 2 千萬輸入 token，用 Haiku 約 $2／天。這是假設值推算，不是實測，上線後要以實際用量校正。agent 的成本取決於使用頻率，沒有估算。

## 後果

### 正面

- 整合最快，可以使用 structured outputs、prompt caching 等原生功能。
- 管線成本低，內測期間可以不必為了省錢犧牲處理頻率。
- LLM 供應商只有 Anthropic 一家，法遵敘述單純。

### 負面與接受的風險

- 用戶的對話內容（含第三方內容）會跨境傳到美國由 Anthropic 處理，必須在隱私政策告知並簽 DPA（見 ADR-0022）。
- Haiku 的判斷力低於較大的模型，而詐騙判定又是純 LLM（見 ADR-0009），誤報與漏報的風險集中在這裡。eval 集是唯一的品質把關。
- 兩個模型要各自維護 prompt。
- Opus 5.5 無法關閉 thinking、不支援強制 `tool_choice`，agent 框架必須相容這些行為（見 ADR-0013 的待驗證項目）。
