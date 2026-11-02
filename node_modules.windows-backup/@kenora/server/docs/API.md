# API and client/server boundaries

## Workspace layout

```text
client/                Browser frontend: React pages, routing, styles, and Vite config
server/                Backend: Express HTTP API, MongoDB persistence, auth, and provider gateway
packages/
  ai-client/           Reusable TypeScript SDK for server-side consuming applications
tests/                 API smoke tests
```

The browser talks to the backend through `VITE_API_URL` (default `http://localhost:4000/api/v1`). Provider keys and project credential secrets belong on trusted servers; the dashboard sends provider keys only to the API over its configured origin. The SDK targets the local API by default and accepts a custom `baseUrl` for deployments.

## API conventions

- Health: `GET /health`.
- Dashboard API routes use `/api/v1` and cookie-backed workspace sessions with CSRF protection on writes.
- Project gateway routes use `/v1` and project bearer credentials.
- JSON responses use `{ data: ... }`; errors use `{ error: { code, message } }`.
- MongoDB records are scoped to the authenticated workspace or project credential.

## Main route groups

- `/auth`: owner setup, login, logout, refresh, current session, invitation acceptance.
- `/projects`: project CRUD, credentials, budgets, and project-level gateway configuration.
- `/providers`, `/models`: Gemini key configuration, connection test, model sync, activation, and pricing history.
- `/playground`, `/prompts`: workspace generation and prompt library.
- `/analytics`, `/logs`, `/notifications`, `/audit`, `/settings`, `/team`: operational workspace screens.
- `/v1/generate`, `/v1/chat`, `/v1/generate/stream`, `/v1/embeddings`: project gateway.
- `/v1/models`, `/v1/projects/me`, `/v1/usage/me`: project metadata and usage.

## Local development

See root `README.md` and the local `guide.txt` for setup steps. `guide.txt` is ignored by Git at the user's request; update the local guide whenever the website or local setup changes, and keep this version-controlled API guide and README aligned.
