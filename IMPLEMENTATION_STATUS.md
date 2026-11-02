# Implementation status

Updated: 2026-11-02

## Implemented

- Responsive React dashboard based on the supplied dark violet reference, using the transparent Kenora logo in `client/public/assets/`.
- Added shared tablet/mobile breakpoints for page grids, project details, forms, navigation, dialogs, authentication, and horizontally scrollable tables.
- Separated the repository into root `client/` and `server/` workspaces, placed SDK, backend tests, and API docs under `server/`, and extracted the browser HTTP boundary into `client/src/lib/api.ts`.
- Added a local-only `guide.txt` run guide and ignored it in Git as requested; README documents the maintenance rule to update it alongside website or setup changes.
- Overview and workspace screens for projects, providers, models, credentials, playground, analytics, logs, budgets, prompts, team, notifications, audit, health, and settings.
- Express API with MongoDB persistence, schema validation, structured errors, tenant scoping, health reporting, and project CRUD.
- First-owner bootstrap, Argon2id password hashing, session cookies, CSRF protection, login/bootstrap throttling, invitation acceptance, workspace roles, and team administration.
- AES-256-GCM encryption for stored Gemini API keys. The encryption key is provided only through server configuration.
- Gemini connection testing, provider model synchronization, model activation, manual pricing with history, and project model selection.
- Project API credentials are hashed at rest; new and rotated secrets are displayed once and can be revoked.
- Gemini text generation and chat through the playground and project API, including provider usage/latency, request records, and estimated costs when prices have been configured.
- Atomic hard-budget reservations for standard generation, project credential rate limits, analytics summaries, prompt CRUD, team invitations, notifications, audit entries, settings, and retention cleanup.
- TypeScript SDK workspace `@kenora/ai-client` in `server/sdk/ai-client` for generation, chat, streaming, embeddings, models, project metadata, and usage.
- `.env.example`, local setup instructions, and API smoke test.

## Limits that require follow-up

- Only Gemini is currently implemented as an AI provider adapter.
- Streaming and embeddings are refused when a hard budget is configured; their current routes do not reserve budget atomically.
- Rate limiting is in-process. Use a shared Redis-backed limiter before running multiple API instances.
- Provider API key encryption requires a stable `SECRETS_ENCRYPTION_KEY`; losing it makes saved keys unrecoverable. Back it up in a secret manager.
- Cost values are estimates based on prices entered by an administrator. Unknown prices remain unpriced.
- Production deployment still needs environment-specific HTTPS/domain configuration, monitoring, database backup/restore procedures, and deployment manifests.
- Automated coverage is currently a single API smoke test. Add MongoDB-backed integration tests, authorization/tenant isolation tests, provider adapter tests, and browser end-to-end tests before treating this as fully production validated.
- The development `tsx watch` runner previously failed with a host `uv_os_get_passwd returned ENOMEM`; compiled API execution worked. Recheck on the target development host.
- `npm install` reported a high-severity dependency advisory. Review `npm audit` and upgrade safely before deployment.

## Required configuration

- `MONGODB_URI` — MongoDB connection string.
- `SECRETS_ENCRYPTION_KEY` — base64-encoded 32-byte key.
- `WEB_ORIGIN` — allowed browser origin(s).
- `VITE_API_URL` — web app API URL; defaults to `http://localhost:4000/api/v1`.
- `PORT` — API port; defaults to 4000.

Gemini credentials are configured and encrypted from the dashboard. Do not put provider keys in the web app environment.

## Checks run

- `npm.cmd run typecheck` — passed for API, web, and SDK.
- `npm.cmd test` — passed; 1 API smoke test.
- `npm.cmd run build` — passed for API, web, and SDK. Vite reported non-fatal React Router `use client` directive warnings and a 799 kB JavaScript bundle warning.
