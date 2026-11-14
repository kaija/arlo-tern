# arlo-tern

給台灣用戶的 travel planner App：讀取用戶的個人 LINE 對話，把要做的事排進 App 內的行事曆、在到期前提醒、對可疑訊息發出警告，並提供一個能規劃旅遊行程的個人 AI agent。目前是 MVP（100 人以下內測）的開發階段。

## 文件

| 文件 | 內容 |
|---|---|
| [docs/adr/README.md](docs/adr/README.md) | 架構決策紀錄的索引 |
| [docs/design/system-design.md](docs/design/system-design.md) | 系統設計 |
| [docs/api/openapi.yaml](docs/api/openapi.yaml) | API 規格 |
| [docs/plan/work-items.md](docs/plan/work-items.md) | 工作項目與相依關係 |

## 專案結構

```
apps/mobile          Expo App（尚未建立，目前是佔位）
services/connector   讀取服務：持有用戶的 LINE 連線，只讀不發
services/core        核心服務：App API、agent、訊息管線、提醒與推播
packages/shared      共用型別、資料庫 schema、API 契約
```

## 開發環境

需要 Node.js 24 與 pnpm。pnpm 的版本由 `package.json` 的 `packageManager` 指定，透過 Corepack 取得：

```bash
corepack enable
pnpm install
```

`pnpm install` 會一併安裝 pre-commit hook，commit 時對 staged 的程式檔跑 ESLint 與 Prettier。

## 本機啟動

需要 Docker。一個指令啟動 PostgreSQL 與兩個服務：

```bash
docker compose up --build
```

- 按 Ctrl-C 停止；加上 `-d` 可以在背景執行。
- `docker compose down` 停止並移除容器；加上 `-v` 會一併刪除資料庫的資料。
- PostgreSQL 只開在本機的 `127.0.0.1:5432`。帳號、密碼、資料庫名稱是 `docker-compose.yml` 裡的開發用預設值，要改的話把 `.env.example` 複製成 `.env` 再修改。帳號、密碼、資料庫名稱只在資料庫第一次建立時生效，改了之後要先執行 `docker compose down -v`。這些值只能用在本機開發。
- 兩個服務目前是佔位的程序，只會啟動並等待停止訊號。

## 常用指令

```bash
pnpm typecheck        # 型別檢查
pnpm lint             # ESLint
pnpm format:check     # 檢查格式，pnpm format 會直接改寫
pnpm test             # 執行全部測試
pnpm test:coverage    # 含覆蓋率，低於 80% 會失敗
pnpm build            # 建置到各套件的 dist/
```

執行單一測試：

```bash
pnpm vitest run services/core/src/index.test.ts
```

修改 API 規格後檢查：

```bash
npx --yes @redocly/cli@latest lint docs/api/openapi.yaml
```
