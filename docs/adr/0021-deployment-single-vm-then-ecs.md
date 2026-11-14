# ADR-0021：內測用東京區域單一 VM 加 Docker Compose，正式上線轉 ECS Fargate

- 狀態：已接受
- 日期：2026-11-13
- 相關：ADR-0005、ADR-0019、ADR-0020、ADR-0022、ADR-0025

## 背景

後端有兩個服務（見 ADR-0019）與一個 PostgreSQL（見 ADR-0020）。讀取服務需要常駐程序維持 LINE 長連線，不能用 Lambda 這類短生命週期的 serverless 函式。

專案擁有者的慣例是 Terraform 加 Terragrunt 管理基礎設施、GitHub Actions 做 CI/CD、非 Python 專案用 Docker 與 Docker Compose。內測階段的優先考量是省錢。

## 考慮過的選項

部署平台：

1. **AWS ECS Fargate** 加 RDS PostgreSQL：符合既有慣例，之後擴充不用搬家，但內測規模下每月固定成本較高。
2. **單一 VM 加 Docker Compose**：最便宜、最快上線，但有單點故障，備份要自己做。
3. **託管 PaaS**（Fly.io、Railway、Render）：維運最少，但多一家資料處理者，偏離 Terraform 慣例。

地理區域：

1. AWS 台北區域：資料儲存在台灣境內。
2. **AWS 東京區域**（ap-northeast-1）：服務最齊全。
3. 台灣本地主機商。

## 決定

- **內測階段**：採用選項 2，在 **AWS 東京區域（ap-northeast-1）** 的單一 EC2 上用 Docker Compose 執行。**單點故障是預期中、已接受的**。
- **正式上線時**：轉到 **ECS Fargate** 加 RDS PostgreSQL（選項 1）。
- 平台不是對齊過程中建議的選項（建議直接用 Fargate），區域也不是（建議台北）。選擇單一 VM 是為了內測階段省錢。

### 內測部署

- 一台 EC2，Docker Compose 內含：讀取服務、核心服務、PostgreSQL、反向代理（負責 TLS）。
- 對外只開放 HTTPS 給核心服務的 API，以及 LINE 與 WhatsApp 官方帳號的 webhook。讀取服務與 PostgreSQL 不對外開放。
- EBS 磁碟開啟加密，這是 ADR-0005 所說的磁碟加密在本階段的實作方式。
- secrets（Anthropic API key、Google 與 Firebase 的金鑰、LINE channel secret、WhatsApp Cloud API 的 token 與 app secret）不進 repository，以環境檔或 AWS 的 secret 服務注入。
- 本機開發使用同一份 Docker Compose 設定的開發版本，維持本機與線上一致。
- 映像由 GitHub Actions 建置並推到映像庫，部署時在 VM 上拉取新映像。**兩個服務分開部署**：部署核心服務不重啟讀取服務（見 ADR-0019）。
- EC2、安全群組、磁碟等資源用 Terraform 建立，之後轉 ECS 時沿用同一套 IaC 結構擴充。

### 備份（單機階段的最低要求）

- PostgreSQL 每日備份到同區域的 S3，備份加密、限制存取、設定保存天數。
- 備份的保存天數要寫進隱私政策，因為已刪除的資料在備份過期前仍然存在（見 ADR-0004、ADR-0005）。
- 定期演練一次還原。

### 轉 ECS 的時機

對外開放（正式上線）之前轉換。轉換內容：

- 兩個服務各自成為 Fargate service，核心服務可多副本，讀取服務維持單一實例（見 ADR-0019）。
- PostgreSQL 換成 RDS，開啟自動備份與加密。
- 用 Terragrunt 管理 dev、staging、prod 環境。
- 屆時一併重新檢視 ADR-0005 的儲存安全等級。

## 後果

### 正面

- 內測期間成本最低，上線最快。
- 本機與線上都是 Docker Compose，環境差異小。
- 應用程式只依賴 PostgreSQL 與容器，轉 ECS 時不需要改程式。

### 負面與接受的風險

- **單點故障**：VM 或磁碟出問題時整個服務停擺，包含訊息讀取。停擺期間的 LINE 訊息能否在恢復後補收，取決於 linejs 的行為，尚未驗證；可能會漏掉停擺期間的訊息、task 與詐騙警告。
- 資料庫與應用程式在同一台機器上，應用程式被入侵等於資料庫被入侵（見 ADR-0005）。
- 備份、監控、修補作業系統都要自己做。
- 原始訊息儲存在日本，對台灣用戶是跨境儲存，要在隱私政策交代（見 ADR-0022）。
- 內測階段沒有 staging 環境，變更直接上線。
- 之後要做一次資料搬遷（VM 上的 PostgreSQL 到 RDS），需要規劃停機時間。
