# 0005. 主要資料庫使用 Cloud SQL for PostgreSQL

- 狀態：已接受
- 日期：2026-11-07

## 背景與問題

核心資料是關聯性的：用戶、綁定的資料來源、task、提醒、旅遊行程（行程 → 日 → 時段項目）、可疑訊息警告。需要交易一致性與彈性查詢（例如依日 / 週 / 月範圍查 task）。

## 考慮的選項

1. Cloud SQL for PostgreSQL
2. Firestore

## 決策

使用 **Cloud SQL for PostgreSQL** 作為主要資料庫。

## 後果

### 正面

- 關聯資料與範圍查詢（日 / 週 / 月曆）表達自然
- 生態系成熟，TypeScript ORM 選擇多

### 負面 / 風險

- App 的即時同步需由 API 層自行實作，不像 Firestore 內建

## 待決

- AI agent 長期記憶的儲存與檢索方式（例如是否使用 pgvector）
