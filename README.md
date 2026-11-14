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

需要 Docker。一個指令啟動 PostgreSQL、套用資料庫的 migration、再啟動兩個服務：

```bash
docker compose up --build
```

- 按 Ctrl-C 停止；加上 `-d` 可以在背景執行。
- `docker compose down` 停止並移除容器；加上 `-v` 會一併刪除資料庫的資料。
- PostgreSQL 只開在本機的 `127.0.0.1:5432`。帳號、密碼、資料庫名稱是 `docker-compose.yml` 裡的開發用預設值，要改的話把 `.env.example` 複製成 `.env` 再修改。帳號、密碼、資料庫名稱只在資料庫第一次建立時生效，改了之後要先執行 `docker compose down -v`。這些值只能用在本機開發。
- 兩個服務目前是佔位的程序，只會驗證設定、啟動並等待停止訊號。

### 資料庫 migration

資料庫的 schema 以 migration 管理（Kysely，放在 `packages/shared/src/db/migrations/`）。服務啟動時不會自己套用 migration。

- `docker compose up` 會先執行一次性的 `migrate` 步驟，成功後才啟動兩個服務，所以平常不需要另外操作。
- 新增 migration 之後重新套用：

  ```bash
  docker compose build
  docker compose run --rm migrate
  ```

- 不透過 Docker：先 `pnpm build`，再把 `.env` 裡的 `DATABASE_*` 取消註解（或在 shell 設定），執行 `pnpm db:migrate`。
- 重複套用不會有任何變化。已經進 `main` 的 migration 不再修改，要改就新增一個。
- 要從空的資料庫重來：`docker compose down -v` 再 `docker compose up --build`。

新增 migration 的步驟與 schema 的慣例見 [CLAUDE.md](CLAUDE.md) 的 Database 一節。

### 設定與 `.env`

兩個服務的設定全部來自環境變數，啟動時驗證；有缺少或不合法的值時，服務會印出是哪個變數、違反哪條規則（不會印出值），然後以非 0 結束。

- `.env.example` 列出所有變數名稱與預設值。要覆寫時複製成 `.env` 再修改；註解掉或留空的變數視為沒有設定，服務使用預設值。
- **`.env` 不進 repository**（已列在 `.gitignore`）。真正的 secrets 只能放在 `.env` 或部署環境，不可以寫進 `.env.example`、程式或文件。
- 現在只有資料庫連線是必填，而且 `docker compose` 已經替兩個服務設好，所以不建立 `.env` 也能啟動。各個金鑰在對應的功能完成之前都是選填。
- 設計文件第 9.2 節標為「未定」的設定沒有預設值，沒有設定時不會被當成任何數值。
- 讀取服務只會拿到資料庫連線與對話視窗的設定；核心服務的金鑰不可以給它，給了它會拒絕啟動。

變數的定義、驗證規則與新增設定的步驟見 [CLAUDE.md](CLAUDE.md) 的 Configuration 一節。

## 常用指令

```bash
pnpm typecheck        # 型別檢查
pnpm lint             # ESLint
pnpm format:check     # 檢查格式，pnpm format 會直接改寫
pnpm test             # 執行全部測試（資料庫測試需要 PostgreSQL，見下方）
pnpm test:coverage    # 含覆蓋率，低於 80% 會失敗
pnpm build            # 建置到各套件的 dist/
```

資料庫測試會連到本機 compose 的 PostgreSQL（先執行 `docker compose up -d postgres`），在上面建立隨機命名的空資料庫、套用 migration、檢查後刪除，不會動到開發用的資料。連不上 PostgreSQL 時這些測試會被略過並印出提示，其餘測試照常執行；要連到別台 PostgreSQL 就設定 `TEST_DATABASE_URL`。

執行單一測試：

```bash
pnpm vitest run services/core/src/index.test.ts
```

修改 API 規格後檢查（warning 也會讓指令失敗），再重新產生核心服務與 App 共用的型別（`packages/shared/src/api/openapi.generated.ts`），與規格放在同一個 commit：

```bash
npx --yes @redocly/cli@latest lint docs/api/openapi.yaml
pnpm api:generate     # pnpm api:check 只檢查型別是否與規格同步，不改寫檔案
```

CI（GitHub Actions，`.github/workflows/ci.yml`）在每個 PR 與每次 push 到 `main` 時執行上面的格式檢查、lint、型別檢查、含覆蓋率的測試（含資料庫測試）、建置、套用 migration、API 規格檢查與產生的型別是否和規格同步，並試建兩個服務的映像。push 之前先在本機跑過。
