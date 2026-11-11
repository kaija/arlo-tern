# 0026. CI/CD 使用 Cloud Build，基礎設施以 Terraform 管理

- 狀態：已接受
- 日期：2026-11-11

## 背景與問題

系統橫跨 GCP 與 Supabase，dev 與 prod 兩套環境（見 [0023](0023-environments-and-region.md)），程式碼分在多個 repo（見 [0006](0006-multi-repo.md)）。需要一致的建置、部署方式，以及可重現的基礎設施設定。

## 考慮的選項

CI/CD：GitHub Actions、Cloud Build

IaC：Terraform / OpenTofu、Pulumi（TypeScript）

## 決策

- **CI/CD**：backend 服務使用 **Cloud Build**，由 GitHub repo 的事件觸發，建置後部署到 Cloud Run / GCE
- **App 建置**：維持使用 EAS Build（見 [0020](0020-react-native-expo.md)）
- **IaC**：使用 **Terraform HCL**（Terraform 或相容的 OpenTofu），同時管理 GCP 與 Supabase 的資源，放在獨立的 `infra` repo
- 兩套環境使用同一份 Terraform 設定，以變數區分

## 後果

### 正面

- Cloud Build 在 GCP 內執行，部署權限用 GCP 的服務帳號管理，不需要把長期金鑰放到外部 CI
- 基礎設施可審查、可重現，dev 與 prod 不會不一致

### 負面 / 風險

- CI 分散在兩處：backend 在 Cloud Build，App 在 EAS
- Supabase 的 Terraform provider 涵蓋範圍比 GCP 小，部分設定可能仍需手動，要記錄下來

## 待決

- 使用 Terraform 或 OpenTofu
- Terraform state 的存放位置
