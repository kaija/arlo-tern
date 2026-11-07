# 0012. 官方帳號：LINE OA 與 WhatsApp 官方號，皆走官方 API

- 狀態：已接受
- 日期：2026-11-07

## 背景與問題

用戶除了 App 之外，也要能透過官方帳號跟自己的 AI agent 對話。系統也要透過官方帳號發送可疑訊息警告。

## 考慮的選項

1. LINE OA 與 WhatsApp 官方號都開
2. 只開 LINE OA
3. 只開 WhatsApp

## 決策

- **LINE OA**：使用 LINE Messaging API
- **WhatsApp 官方號**：使用 WhatsApp Business Cloud API
- 用途：
  1. 用戶與個人 AI agent 對話的入口（與 App 共用同一個 agent，見 [0014](0014-personal-agent-shared-memory.md)）
  2. 發送可疑訊息警告（見 [0019](0019-suspicious-message-detection.md)）
- webhook 入口在 Core API 的 `channels` 模組
- 官方帳號是系統**唯一**的發訊管道，與 [0009](0009-line-whatsapp-unofficial-read-only.md) 的非官方唯讀 session 完全分開

## 後果

### 正面

- 發訊符合平台規範，不會牽連用戶的個人帳號
- 用戶可在習慣的通訊軟體中直接使用 agent

### 負面 / 風險

- WhatsApp 在用戶最後一則訊息後 24 小時的客服視窗之外，只能發送**預先核准的範本訊息**。主動發出的警告需要事先申請範本
- LINE 的 push message 計入方案的每月訊息額度，用量增加時會產生費用
- 兩個平台的訊息格式不同，需要一層通道抽象

## 待決

- WhatsApp 警告範本的內容與申請
- LINE OA 方案的選擇
