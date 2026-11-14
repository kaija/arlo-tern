# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

**The repository holds the design documents, an empty monorepo scaffold (`FND-01`), a local Docker Compose stack (`FND-02`), a CI workflow (`FND-03`), the database schema with its migrations (`FND-04`) and the configuration loader (`FND-07`). No product code exists yet;** apart from the loader and the schema the packages contain placeholders only, and each service runs a placeholder process that validates its configuration and then waits. Nothing reads or writes the tables yet. Everything under `docs/` is the agreed design for an MVP (closed beta, under 100 users) of a travel planner app for Taiwanese users. The app reads a user's personal LINE chats, extracts tasks into an in-app calendar, sends due reminders, warns about suspicious messages, and offers a personal AI agent reachable from the app, a LINE official account and a WhatsApp official account.

**The app is the primary surface.** The two official-account channels stay in the MVP but are its lowest-priority work: the beta launches app-only (`LCH-02`) and the channels open later behind a second gate (`LCH-03`). Their work items are marked `[OA]` in `docs/plan/work-items.md`. No item without that mark may depend on one that has it, and no app feature may require an official-account channel.

Read these before changing anything, in this order:

| Document | What it holds |
|---|---|
| `docs/adr/README.md` | Index of the 25 ADRs, decisions that differ from the recommended option, validations required before coding, open items |
| `docs/design/system-design.md` | Components, data model, flows, security. §13 lists defaults the design introduced that no ADR decided; §14 lists open items |
| `docs/api/openapi.yaml` | OpenAPI 3.1 spec for the core service's app-facing API and the LINE / WhatsApp webhooks |
| `docs/plan/work-items.md` | The work breakdown with dependencies. Pick work from here and update its status column |

All project documents are written in Traditional Chinese with technical terms in English. Keep that convention.

## Commands

Node.js 24 (`.nvmrc`) and pnpm. The pnpm version is pinned by `packageManager` in `package.json` and supplied by Corepack; run `corepack enable` once if `pnpm` is missing.

```bash
pnpm install          # also installs the git hooks (husky)
pnpm typecheck        # tsc on every package, no emit
pnpm lint             # ESLint with type-aware rules; pnpm lint:fix to fix
pnpm format:check     # Prettier; pnpm format to write
pnpm test             # Vitest, all packages
pnpm test:coverage    # fails under 80 % coverage
pnpm build            # tsc -b into each package's dist/; pnpm clean removes it
pnpm db:migrate       # apply pending database migrations; see "Database" for what it needs
```

Run a single test by file, by package, or by test name:

```bash
pnpm vitest run services/core/src/index.test.ts
pnpm vitest run --project core
pnpm vitest run -t "resolves the shared package"
```

Start PostgreSQL, apply the migrations and start both services locally (Docker required):

```bash
docker compose up --build     # Ctrl-C stops it; add -d to run in the background
docker compose up -d postgres # PostgreSQL alone, which is all the database tests need
docker compose build && docker compose run --rm migrate   # apply a migration you just added
docker compose down           # stop and remove the containers; add -v to also delete the database volume
```

PostgreSQL is published on `127.0.0.1:5432` (user, password and database are development-only defaults in `docker-compose.yml`; override them with a `.env` copied from `.env.example`). A changed user, password or database name only applies to an empty volume, so run `docker compose down -v` first. Compose hands the same database settings to both services. The services publish no ports yet.

Lint the OpenAPI spec after every edit to it; it must report no errors and no warnings. `redocly.yaml` turns warnings into errors, so either one fails the command:

```bash
npx --yes @redocly/cli@latest lint docs/api/openapi.yaml
```

CI (`.github/workflows/ci.yml`, GitHub Actions) runs on every pull request and on every push to `main`. Its `check` job has a `postgres:18` service container and runs, from a frozen-lockfile install: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage` (with `TEST_DATABASE_URL` pointing at the service container), `pnpm build`, `pnpm db:migrate` twice (the second run must apply nothing) and the OpenAPI lint above. Its `images` job builds both service images with `docker build` and discards them. Run the same commands locally before pushing. **Keep the workflow and this section in sync:** when a command here changes or a new check is added, change the workflow in the same commit.

Things to know about the toolchain (choices are recorded in design §13):

- Typecheck, lint and tests do not need a build. Workspace packages resolve to TypeScript source through the `@arlo-tern/source` export condition; built output resolves to `dist/`. A new workspace package needs the same `exports` shape as `packages/shared/package.json`, a `tsconfig.build.json` listed in the root `tsconfig.build.json`, and a project entry in `vitest.config.ts`.
- Packages are ESM with `NodeNext` resolution: relative imports carry the `.js` extension.
- Tests live next to the code as `src/**/*.test.ts` and are excluded from the build. Support code that only tests use goes in a `testing/` directory, which is excluded from the build and from coverage.
- `pnpm test` includes the database tests, which need a PostgreSQL server; without one they are skipped. Read "Database" before trusting a green run.
- Prettier skips `docs/` and all Markdown; project documents stay hand-formatted.
- The pre-commit hook runs ESLint and Prettier on staged code files and blocks the commit on lint errors.
- Each service starts from `src/main.ts`; the migration command starts from `packages/shared/src/db/migrate-main.ts`. Entry files only wire things together and are excluded from coverage; put logic in modules that have tests.
- One `Dockerfile` builds either service (`--build-arg SERVICE=connector|core`). An image contains only that service, `packages/shared` and their production dependencies, and runs as the non-root `node` user. A new workspace package that a service depends on must be copied in the `Dockerfile` as well.
- `docker-compose.yml` is the local stack only. The production stack is a separate file (`OPS-02`). Keep exactly one `connector` and publish no ports for it. Its `migrate` service is a one-shot step, not a fourth long-lived container: it exits with code 0 and the two services wait for that.
- GitHub Actions are pinned to a full commit SHA with the release in a trailing comment. Nothing updates them automatically; bump the SHA and the comment together by hand. The workflow token is read-only (`permissions: contents: read`); CI does not deploy, publish images or write to the repository (`OPS-03` owns deployment).

There is no integration-test or eval command yet beyond the database tests inside `pnpm test`. `QA-01` and `EVL-02` each add theirs to this file. Do not invent commands before then.

## Configuration

Both services take all their settings from environment variables and validate them at start-up. The code is `packages/shared/src/config/`, imported as `@arlo-tern/shared/config`:

- `settings.ts` is the single definition of every setting: the variable name, its validation and its default. The defaults are the initial values of design §9.2. **This is the only file where such a number may appear;** all other code takes the value from the loaded configuration object.
- `load.ts` has `loadConnectorConfig(env)`, `loadCoreConfig(env)` and, for the migration command, `loadDatabaseConfig(env)`, which reads the database connection alone. They are pure functions of the environment record and return a typed, nested object. Only the entry files (`src/main.ts` of a service and `db/migrate-main.ts`) read `process.env`; everything else receives the configuration as a parameter.
- A missing or invalid value throws `ConfigError`. `main.ts` logs `config_invalid` with the variable names and the rule each one broke, then exits with code 1, so a bad value stops the container.

Rules:

- **Secrets come from the environment and never enter the repository.** `.env` is git-ignored. `.env.example` holds names and local development values only, and a test fails if a credential in it has a value. Use obviously fake values in tests.
- **No secret value in logs or errors.** Secrets load as `Secret` objects that print as `[redacted]`; call `.reveal()` only where a client needs the value. `ConfigError` holds variable names and rules, never values. Every validation rule in `fields.ts` has its own message; never pass on a native parse error, because `new URL()` and `JSON.parse` errors quote their input. Never log the loaded configuration or the environment.
- **Unset and empty mean the same thing.** `VAR=` in an env file and `${VAR:-}` in a compose file are "not set". Numbers are parsed strictly, so nothing turns into `0` by accident.
- **Undecided values have no default.** The rows design §9.2 marks 未定 (`undecidedSettings`) load as `undefined` when unset, and the service still starts. Do not give them a default and do not write `?? <number>` at the point of use: the value is the owner's decision (`DEC-04`, `DEC-05`, `DEC-06`). The work item that uses one decides whether the feature stays off or start-up fails while it is unset.
- **Credentials of features that are not built yet are optional** and load as `undefined`. The work item that builds the feature makes its variable required by removing `.optional()` in `settings.ts`. Variables listed in `VARIABLE_GROUPS` must be set together.
- **Each service gets only what it reads.** The migration step gets the database connection and nothing else. The connector reads the database connection and the three conversation-window values, nothing else, and refuses to start when it is given a core credential. `docker-compose.yml` lists the variables per service in its own `environment:` block; do not replace that with a shared `env_file`. The same check applies outside Docker: a connector started from a `.env` that holds credentials, or from a shell that exports `ANTHROPIC_API_KEY`, exits with `config_invalid`.
- **Backend only.** The mobile app must not import `@arlo-tern/shared/config`, and `packages/shared/src/index.ts` must not re-export it. ESLint enforces both.
- Variable names carry no project prefix, so a misspelled name is not detected: the service silently uses the default. Copy names from `.env.example`.

To add a setting:

1. Define it in `settings.ts`, in the group of the service or services that read it, with a validation from `fields.ts` and, for a decided value, its default. Durations are whole seconds with `_SECONDS` in the name.
2. Add it to the configuration type and the mapping in `load.ts`. A rule that spans several variables is a check function there.
3. Add the variable to the `environment:` block of each service that reads it in `docker-compose.yml`, and to `.env.example`. `deployment-files.test.ts` fails until both match `settings.ts`.
4. Add tests to `load.test.ts`: the default, an override, and each invalid value.
5. Record it: a threshold or time constant goes in the table of design §9.2, any other choice in design §13.

## Database

PostgreSQL 18, accessed through Kysely (a typed query builder with its own migrations) on node-postgres (`pg`). The code is `packages/shared/src/db/`, imported as `@arlo-tern/shared/db`. It is backend only, like the configuration: ESLint blocks the import under `apps/**` and in the package's root entry.

- `migrations/` holds one TypeScript module per migration, written as plain SQL, and `migrations/index.ts` lists them by hand. `migrate.ts` has `migrateToLatest(db)`: it applies the pending ones in name order inside one transaction, so a failure changes nothing. The bookkeeping tables are `kysely_migration` and `kysely_migration_lock`.
- `schema.ts` describes every table column by column: PostgreSQL type, nullable or not, default or not, and the allowed values of an enumerated column. `Database`, the type behind `Kysely<Database>`, is derived from it. Nothing generates this file; the database test fails when it disagrees with the migrated database.
- `database.ts` has `createDatabase(config)`, which opens the pool from a loaded `DatabaseConfig`. A `date` column reads as a `YYYY-MM-DD` string and a `time` column as `HH:mm:ss`; neither has a time zone. A `timestamptz` reads as a `Date`.
- `migrate-main.ts` is the migration command. It reads `DATABASE_*` only, logs one JSON line (`migrations_applied` with the names, or `migrations_failed`), and exits 0 or 1.

Applying migrations:

- **The services do not migrate at start-up.** Locally, `docker compose up` runs the one-shot `migrate` service first, and `docker compose run --rm migrate` runs it again. Outside Docker, run `pnpm build`, then `pnpm db:migrate` with `DATABASE_*` in the shell or uncommented in `.env`. In either image the command is `node /app/packages/shared/dist/db/migrate-main.js`; a deployment runs it before it starts new containers (`OPS-02`, `OPS-03`).
- Applying twice is a no-op, and the test checks that.

Rules:

- **Never edit a migration that has reached `main`.** Add a new one. Migrations only go forward; there is no `down`.
- **Every business table has `user_id`**, also a child table whose parent already has one. Only `invites` and `consent_documents` have none (`GLOBAL_TABLES`); do not add to that list without a reason that would survive review. Nothing in the database checks that a child row's `user_id` equals its parent's; the data-access layer (`FND-05`) owns that.
- **Derived data has no column that could hold message text.** The test lists the text and JSON columns of `tasks`, `task_proposals`, `scam_alerts`, `memory_entries` and `notifications` in `DERIVED_DATA_CONTENT_COLUMNS`; a new one there needs the same scrutiny as the ADR-0004 invariant.
- **References to a source message are `ON DELETE SET NULL`**, and every foreign-key column has an index. Both are tested.
- **No value of design §9.2 in SQL**: no default retention, quiet hours, reminder limit or code lifetime. Only `id`, `created_at` and `updated_at` have a database default; the application writes `updated_at`.
- **Message text and LINE credentials are plain columns** (ADR-0005). Do not add encryption in a migration.
- Deliberately absent, each owned by another work item: the keyword index on `messages.text` (`AGT-04`, after `SPK-06`), database roles and grants (`DEC-09`), the connector's connection lease (ADR-0025), and pg-boss's tables (`FND-06`; enqueue inside a transaction with pg-boss's own `fromKysely(trx)`).
- The remaining conventions (identifier and column types, which columns get a `CHECK`, delete behaviour, natural keys) are in the 工具與專案結構 table of the design document. Follow them, and record a new choice there.

To add a migration:

1. Create `packages/shared/src/db/migrations/NNNN_short_name.ts` with the next four-digit number, exporting `up(db)` only, and add it to `migrations/index.ts`. A test fails when the numbers are not consecutive.
2. Change `schema.ts` to match, in the same commit.
3. Extend the expectations in `migrations.test.ts`: a new foreign key goes in `REFERENCES`, a key that is not `PRIMARY KEY (id)` in `KEYS`.
4. Run the database tests, then `docker compose run --rm migrate` (after `docker compose build`) against your local database.
5. Record a new convention or a gap you filled in the design document, and update section 4.2 there when the data model itself changes.

Database tests:

- They are ordinary Vitest tests (`packages/shared/src/db/migrations.test.ts`). For each test file `testing/test-database.ts` creates an empty database with a random name on the server, and drops it afterwards. They never touch the development database.
- The server is `TEST_DATABASE_URL` when set, otherwise the Compose PostgreSQL on `127.0.0.1:5432` with its development defaults. Start it with `docker compose up -d postgres`.
- **Without a server the database tests are skipped, and the run is still green.** A warning says so, but Vitest's reporter for agent sessions hides it: check that the summary shows no skipped tests, or pass `--reporter=default`. When `CI` or `TEST_DATABASE_URL` is set, an unreachable server fails the run instead.
- Run them before pushing a change to anything under `db/`. `pnpm test:coverage` also passes without a server today, so coverage alone does not prove they ran.

## Planned architecture

A TypeScript monorepo on Node.js 24 with this layout (ADR-0019):

- `apps/mobile`: Expo (React Native) app.
- `services/connector`: a long-lived process that holds each user's LINE connection through linejs. It only receives messages, filters them by ingestion scope, writes them to the database and enqueues pipeline jobs.
- `services/core`: the app API, official-account webhooks, the agent, the message pipeline worker, reminders and push sending. One image, started in API or worker mode.
- `packages/shared`: shared types, the database schema and migrations, API contracts.

PostgreSQL is the only stateful component; the job queue is pg-boss on the same database (ADR-0020). The schema, its migrations and the Kysely types are in `packages/shared/src/db/`. The two services exchange data only through PostgreSQL. Core calls the connector through an internal-only control interface for linking and disconnecting.

The message pipeline debounces messages per conversation, then makes one Claude Haiku 5.5 call that returns a scam verdict and task operations as structured output (ADR-0007). The agent runs on the OpenAI Agents SDK (JS) with Claude Opus 5.5 behind the AI SDK adapter (ADR-0013).

## Decisions that override the usual preferences

These are settled in ADRs. Do not "correct" them back to a general preference:

- **The backend is TypeScript, not Python** (ADR-0019). Both key libraries, linejs and the OpenAI Agents SDK, are JS/TS only.
- **The beta runs on a single EC2 instance with Docker Compose in AWS Tokyo**, with the single point of failure accepted. ECS Fargate, RDS and Terragrunt environments come at production launch (ADR-0021).
- **PostgreSQL only.** No Redis, SQS or vector store (ADR-0020, ADR-0015).
- **TypeScript is pinned to 6.0, not the latest 7.x.** Expo SDK 58's template and typescript-eslint supported only up to 6.0 when the scaffold was made (design §13). Check both before bumping it.
- **The agent framework is the OpenAI Agents SDK, the model is Claude.** No OpenAI models and no OpenAI hosted tools. If the adapter validation (`SPK-03`) fails, reopen ADR-0013 rather than switching silently.
- **Message bodies and LINE credentials are stored with disk encryption only** (ADR-0005). This was chosen against the recommendation and is flagged for re-review before production. Do not add application-level encryption without a new ADR, and do not treat its absence as an oversight.

## Invariants

Every change must keep these true. Each comes from an ADR and is easy to break by accident:

- **The connector interface has no method that sends, marks as read, adds friends or changes settings.** Personal accounts are read-only (ADR-0001).
- **A user's LINE connection is held by at most one connector process at a time.** The beta runs exactly one connector instance. Do not run the connector on ECS, or as more than one replica, before the connection lease of ADR-0025 exists; that lease is pre-launch work, not MVP (ADR-0019, ADR-0025).
- **Official accounts only reply to user-initiated messages.** Never use LINE push messages or WhatsApp template messages. System-initiated notifications go through app push only (ADR-0011, ADR-0024).
- **Derived data carries no raw message text.** Tasks, proposals, scam alerts, memory entries and notifications store only AI-summarised fields plus a nullable reference to the source message (ADR-0004). Raw text leaves the API only through the `/source` endpoints and agent replies.
- **User scope comes from the authenticated identity.** No user ID in API paths, request bodies or agent tool parameters. Accessing another user's resource returns 404 (ADR-0013, ADR-0020).
- **The pipeline model call has no tools.** Message content is untrusted input; the model may only produce the fixed output schema, and code decides what happens next (ADR-0007).
- **Agent tool results are data, not instructions.** Destructive tool actions need confirmation in the conversation, and every agent write is recorded and revertible (ADR-0013).
- **Logs never contain message bodies, agent conversation content, or LLM inputs and outputs.**
- **No user data goes to OpenAI.** Agents SDK tracing stays off (ADR-0013).
- **Push payloads are summaries only.** Details load in the app (ADR-0018).
- **Thresholds and time constants are configuration**, never literals in code (design §9.2).

## Working with the documents

- **Accepted ADRs are not rewritten.** To change a decision, add a new ADR and mark the old one as superseded. Adjusting a default assumption or an initial value does not need a new ADR.
- **Do not settle open items on your own.** The undecided items in `docs/adr/README.md` and design §14, and the `DEC-*` work items, belong to the project owner. Ask.
- **Keep the three layers consistent.** A behaviour change usually touches the design document, the OpenAPI spec and the work items together.
- **New defaults go in design §13.** If implementing something forces a choice no ADR made, record it there instead of leaving it implicit in code.
- `docs/plan/work-items.md` uses "工作項目" for units of work because "task" is a product entity. Its dependency column is the source of truth; check that it stays acyclic when you edit it.

## Git

This is the owner's personal repository. Commit with the personal git profile, not the company one; the owner switches profiles with `git-user personal` / `git-user company`. Check `git config user.email` before committing.

The owner asked on 2026-11-13 for commits to go straight to `main` rather than through feature branches.

Commit `pnpm-lock.yaml` together with any dependency change.
