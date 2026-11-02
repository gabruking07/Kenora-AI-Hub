# Kenora AI Hub

Kenora AI Hub is a multi-tenant control plane for registering projects, configuring Gemini access, managing project API credentials, and routing AI requests through a central API. The repository contains a React dashboard, Express API, MongoDB persistence, and a TypeScript client SDK.

## Client/server structure

- `client` is the browser frontend: React UI, routing, and styles.
- `server` is the backend: Express routes, authentication, MongoDB persistence, provider integrations, and the gateway.
- `server/sdk/ai-client` is the reusable SDK for applications calling the gateway.
- `server/tests` contains backend smoke tests; `server/docs/API.md` describes the boundary and route groups.

## Run locally

Requirements: Node.js 22+, npm, and a reachable MongoDB instance.

1. Run `npm.cmd install` at the repository root.
2. Copy `.env.example` to `.env` and set `MONGODB_URI`.
3. Generate a 32-byte secret encryption key and set `SECRETS_ENCRYPTION_KEY`:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

4. Run `npm.cmd run dev` and open `http://localhost:5173`.
5. On first startup, create the workspace owner account. Configure a Gemini API key in **Providers**, test the connection, and sync the available models.
6. Create a project, choose its provider and model, enable AI, then create a project credential. The credential secret is shown once; copy it into your application’s server-side environment.

The dashboard API defaults to `http://localhost:4000/api/v1`. Configure `VITE_API_URL` and `WEB_ORIGIN` when using different local ports or a deployed web origin. Keep `.env` and project credentials out of source control and browser code.

## What works

- Owner bootstrap and sign-in, password hashing, rotating sessions, CSRF protection, invitation acceptance, workspace roles, and tenant-scoped records.
- Project CRUD and project-level provider/model selection.
- Encrypted Gemini provider key storage, connectivity check, live model discovery, model activation and manually maintained price history.
- One-time project credentials with rotation and revocation.
- Playground and gateway text generation/chat, token usage and latency records, request logs, analytics, and prompt library CRUD.
- Monthly/daily project budgets with atomic request reservations for standard generation; project credential rate limits.
- Team invitations and membership management, notifications, audit history, platform settings, and MongoDB health.
- `@kenora/ai-client` TypeScript SDK for generation, chat, model and project metadata, usage, embeddings, and streaming.

## Important limits

MongoDB and a valid Gemini key are required for those workflows. Prices are entered by the workspace and used to estimate costs; the app does not fetch or invent prices. Hard-budget enforcement is applied to standard `/v1/generate` and playground generation. Streaming and embeddings are rejected when a hard project budget is configured until budget reservation is wired into those endpoints. Rate-limit counters are process-local, so multi-instance deployments need a shared limiter. Provider configuration currently supports Gemini. Configure a real HTTPS origin, secure environment secrets, database backups, and centralized rate limiting before public production use.

See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for verified checks and remaining production work.

The root `guide.txt` is a local convenience guide and is intentionally ignored by Git. When website behavior, setup requirements, or routes change, update that file in the same work session. Keep this README and `server/docs/API.md` in sync for committed documentation.

## Useful commands

- `npm.cmd run dev` — start API and web development servers.
- `npm.cmd run typecheck` — type-check API, web, and SDK.
- `npm.cmd run build` — build all three workspaces.
- `npm.cmd test` — build the API and run its current smoke test.
