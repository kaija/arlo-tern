# 0003. Backend 使用 TypeScript / Node.js

- 狀態：已接受
- 日期：2026-11-07

## 背景與問題

App 使用 React Native（TypeScript）。訊息讀取採用的 linejs 與 whatsapp-web.js（見 [0009](0009-line-whatsapp-unofficial-read-only.md)）都是 JavaScript / TypeScript 函式庫。

## 考慮的選項

1. TypeScript / Node.js
2. Python
3. Go

## 決策

所有 backend 服務（Core API、Ingestion worker、Processing worker）都使用 **TypeScript / Node.js**。

## 後果

### 正面

- 前後端使用同一種語言，型別與資料結構的定義方式一致
- linejs、whatsapp-web.js 可直接在 Ingestion worker 中使用，不需跨語言橋接
- 主要 LLM 供應商都有官方 TypeScript SDK

### 負面 / 風險

- 部分 AI / ML 工具以 Python 為主，若未來需要，得另外評估

框架與測試工具見 [0025](0025-backend-framework-and-testing.md)，ORM 見 [0005](0005-supabase-postgres.md)。
