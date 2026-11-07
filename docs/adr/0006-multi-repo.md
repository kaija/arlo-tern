# 0006. 程式碼採多個 repository

- 狀態：已接受
- 日期：2026-11-07

## 背景與問題

系統包含一個 React Native App 與三個 backend 部署單元（見 [0002](0002-system-decomposition.md)），需要決定程式碼倉庫的組織方式。

## 考慮的選項

1. Monorepo（pnpm workspaces + Turborepo）
2. 多個 repository

## 決策

採用**多個 repository**：App 與各 backend 服務分別放在不同的 repo。

## 後果

### 正面

- 每個 repo 的權限、CI 與發布節奏可以各自獨立
- 服務的所有權邊界清楚

### 負面 / 風險

- App 與 backend 之間的 API 型別、事件 schema 無法直接共用原始碼，需要另外的同步機制，否則容易不一致
- 跨 repo 的變更需協調多個 PR

## 待決

- repo 的具體劃分與命名
- 共用型別 / schema 的同步方式（例如發布共用套件，或從 API 規格產生程式碼）
