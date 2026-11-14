# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

**This repository is documentation-only. No application code exists yet.** Everything under `docs/` is the agreed design for an MVP (closed beta, under 100 users) of a travel planner app for Taiwanese users. The app reads a user's personal LINE chats, extracts tasks into an in-app calendar, sends due reminders, warns about suspicious messages, and offers a personal AI agent reachable from the app, a LINE official account and a WhatsApp official account.

**The app is the primary surface.** The two official-account channels stay in the MVP but are its lowest-priority work: the beta launches app-only (`LCH-02`) and the channels open later behind a second gate (`LCH-03`). Their work items are marked `[OA]` in `docs/plan/work-items.md`. No item without that mark may depend on one that has it, and no app feature may require an official-account channel.

Read these before changing anything, in this order:

| Document | What it holds |
|---|---|
| `docs/adr/README.md` | Index of the 24 ADRs, decisions that differ from the recommended option, validations required before coding, open items |
| `docs/design/system-design.md` | Components, data model, flows, security. §13 lists defaults the design introduced that no ADR decided; §14 lists open items |
| `docs/api/openapi.yaml` | OpenAPI 3.1 spec for the core service's app-facing API and the LINE / WhatsApp webhooks |
| `docs/plan/work-items.md` | The work breakdown with dependencies. Pick work from here and update its status column |

All project documents are written in Traditional Chinese with technical terms in English. Keep that convention.

## Commands

The only command that exists today:

```bash
npx --yes @redocly/cli@latest lint docs/api/openapi.yaml
```

Run it after every edit to the spec; it must report no errors and no warnings.

There are no build, lint or test commands yet. Work item `FND-01` (monorepo scaffold) chooses the package manager, test framework and linter, and its done criterion includes writing the real commands, including how to run a single test, into this file. Do not invent commands before then.

## Planned architecture

A TypeScript monorepo on Node.js 24 with this layout (ADR-0019):

- `apps/mobile`: Expo (React Native) app.
- `services/connector`: a long-lived process that holds each user's LINE connection through linejs. It only receives messages, filters them by ingestion scope, writes them to the database and enqueues pipeline jobs.
- `services/core`: the app API, official-account webhooks, the agent, the message pipeline worker, reminders and push sending. One image, started in API or worker mode.
- `packages/shared`: shared types, the database schema and migrations, API contracts.

PostgreSQL is the only stateful component; the job queue is pg-boss on the same database (ADR-0020). The two services exchange data only through PostgreSQL. Core calls the connector through an internal-only control interface for linking and disconnecting.

The message pipeline debounces messages per conversation, then makes one Claude Haiku 5.5 call that returns a scam verdict and task operations as structured output (ADR-0007). The agent runs on the OpenAI Agents SDK (JS) with Claude Opus 5.5 behind the AI SDK adapter (ADR-0013).

## Decisions that override the usual preferences

These are settled in ADRs. Do not "correct" them back to a general preference:

- **The backend is TypeScript, not Python** (ADR-0019). Both key libraries, linejs and the OpenAI Agents SDK, are JS/TS only.
- **The beta runs on a single EC2 instance with Docker Compose in AWS Tokyo**, with the single point of failure accepted. ECS Fargate, RDS and Terragrunt environments come at production launch (ADR-0021).
- **PostgreSQL only.** No Redis, SQS or vector store (ADR-0020, ADR-0015).
- **The agent framework is the OpenAI Agents SDK, the model is Claude.** No OpenAI models and no OpenAI hosted tools. If the adapter validation (`SPK-03`) fails, reopen ADR-0013 rather than switching silently.
- **Message bodies and LINE credentials are stored with disk encryption only** (ADR-0005). This was chosen against the recommendation and is flagged for re-review before production. Do not add application-level encryption without a new ADR, and do not treat its absence as an oversight.

## Invariants

Every change must keep these true. Each comes from an ADR and is easy to break by accident:

- **The connector interface has no method that sends, marks as read, adds friends or changes settings.** Personal accounts are read-only (ADR-0001).
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

`.DS_Store` is untracked and not ignored; leave it out of commits.
