# AGENTS.md — TREK
<!-- https://platform.kimi.ai/console/account -->
> This file is for AI coding agents. Read it before modifying any code.

## Project overview

TREK is a self-hosted, real-time collaborative travel planner distributed as a single Docker image. It includes trip planning with drag-and-drop itineraries, interactive maps, budget tracking, packing lists, a travel journal, vacation planning, an atlas of visited countries, and a built-in MCP (Model Context Protocol) server for AI integration.

The repository is a monorepo with two main packages:
- `client/` — React 18 SPA built with Vite
- `server/` — Express API server with SQLite

License: AGPL v3.

## Technology stack

- **Runtime**: Node.js 22
- **Backend**: Express, TypeScript (compiled via `tsx`), SQLite (`better-sqlite3`)
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Zustand
- **Maps**: Leaflet + Mapbox GL
- **Real-time**: WebSocket (`ws`) on path `/ws`
- **Auth**: JWT sessions, OAuth 2.1, OIDC (SSO), TOTP MFA
- **Testing**: Vitest (both client and server), `@testing-library/react` on client, `supertest` on server
- **PWA**: `vite-plugin-pwa` with Workbox runtime caching for tiles, API, and uploads
- **PDF**: `@react-pdf/renderer` (client-side trip export)
- **Validation**: Zod (server)
- **i18n**: 15 languages (EN, DE, ES, FR, IT, NL, HU, RU, ZH, ZH-TW, PL, CS, AR, BR, ID)

## Directory structure

```
TREK/
├── client/               # React frontend
│   ├── src/
│   │   ├── pages/        # Top-level route pages (e.g. TripPlannerPage.tsx)
│   │   ├── components/   # Feature components by area (Planner/, Budget/, Vacay/, Atlas/, etc.)
│   │   ├── store/        # Zustand stores (auth, trip, settings, vacay, journey, etc.)
│   │   ├── api/          # API call wrappers
│   │   ├── hooks/        # Custom React hooks
│   │   ├── i18n/         # Translations and language config
│   │   ├── utils/        # Shared helpers
│   │   └── types.ts      # Shared TypeScript types
│   ├── tests/            # Unit + integration tests
│   └── public/           # Static assets, PWA icons, fonts
├── server/               # Express backend
│   ├── src/
│   │   ├── routes/       # One file per feature area (e.g. trips.ts, budget.ts, auth.ts)
│   │   ├── services/     # Business logic (one folder per domain)
│   │   ├── db/           # Schema, migrations, seeds, connection
│   │   ├── middleware/   # Auth, rate limiting, SSRF guard, idempotency, trip access, MFA policy
│   │   ├── mcp/          # MCP server (tools, resources, sessions, scopes, OAuth)
│   │   ├── utils/        # Small helpers (e.g. ssrfGuard)
│   │   ├── demo/         # Demo mode seed + reset
│   │   ├── systemNotices/# In-app system notice framework
│   │   ├── types.ts      # Shared TypeScript types
│   │   ├── app.ts        # Express app factory (routes, middleware, static files)
│   │   ├── index.ts      # Entry point (server boot, scheduler, WebSocket, graceful shutdown)
│   │   ├── config.ts     # JWT secret and encryption key resolution
│   │   └── addons.ts     # Addon ID constants
│   └── tests/            # Unit, integration, and WebSocket tests
├── charts/trek/          # Helm chart for Kubernetes
├── wiki/                 # Documentation markdown files
└── uploads/              # Runtime user uploads (avatars, covers, files, photos)
```

## Build and run

### Local development

Run the backend and frontend in separate terminals:

```bash
# Server (default port 3001 in dev)
cd server && npm run dev

# Client (port 5173, proxies /api, /uploads, /ws, /mcp to localhost:3001)
cd client && npm run dev
```

Run DB migrations manually:
```bash
cd server && npm run migrate
```

### Production / Docker

The app ships as a single Docker image (`mauriceboe/trek`) built via the root `Dockerfile`:
1. Multi-stage build: client is built first, then server image copies `client/dist` into `server/public`.
2. The server serves the static frontend in production and proxies API/WebSocket requests.

Quick start:
```bash
ENCRYPTION_KEY=$(openssl rand -hex 32) docker run -d -p 3000:3000 \
  -e ENCRYPTION_KEY=$ENCRYPTION_KEY \
  -v ./data:/app/data -v ./uploads:/app/uploads mauriceboe/trek
```

Docker Compose and Helm charts are provided in `docker-compose.yml` and `charts/trek/`.

## Testing

Both client and server use **Vitest**.

```bash
# Server
cd server && npm test                # all tests
cd server && npm run test:unit       # unit only
cd server && npm run test:integration
cd server && npm run test:ws         # WebSocket tests
cd server && npm run test:coverage

# Client
cd client && npm test                # all tests
cd client && npm run test:unit       # tests/unit only
cd client && npm run test:integration
cd client && npm run test:coverage
```

- Coverage target: **80%+**. Do not drop coverage.
- Tests must pass before any PR is merged.
- CI runs tests on PRs to `main` and `dev` (`.github/workflows/test.yml`).

## Database

- **Engine**: SQLite (`better-sqlite3`) with WAL mode, foreign keys enabled, 5-second busy timeout.
- **File**: `./data/travel.db` (relative to server working directory).
- **Schema**: `server/src/db/schema.ts` creates tables if missing.
- **Migrations**: `server/src/db/migrations.ts` — a numbered array of migration functions. **Always append new migrations to the end. Never rewrite existing migrations.**
- **Seeds**: `server/src/db/seeds.ts` seeds an admin account on first boot (uses `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars if set; otherwise prints a random password to the log).

## Code style and conventions

- **Language**: TypeScript throughout. Client uses `.tsx` for components; server uses `.ts`.
- **Imports**: ES modules (`"type": "module"` in both package.json files).
- **Commits**: [Conventional commits](https://www.conventionalcommits.org/) — `feat(scope): ...`, `fix(scope): ...`, `chore: ...`
- **One change per PR** — do not bundle unrelated fixes or refactors.
- **No breaking changes** — backwards compatibility is required.
- **Target the `dev` branch** for PRs, not `main`.
- **Match existing style** — no reformatting, no linter config changes, no "while I'm here" cleanups.
- **Minimal changes** — do not add error handling, helpers, or abstractions beyond what the task requires.
- **Comments**: avoid unless the logic is genuinely non-obvious.
- **Comments language**: all code comments must be in English. If you encounter German or any other non-English comments while editing a file, translate them to English as part of your change.
- **No new dependencies** without clear justification.

## Architecture notes

### Addons system
Features like Budget, Packing, Documents, Vacay, Atlas, Collab, Journey, and MCP are **admin-toggleable addons**. Code behind addons must check `isAddonEnabled(...)` before registering routes, tools, or UI components. The addon list is stored in the `addons` table and exposed via `GET /api/addons`.

### Authentication
- Web sessions use JWT (access token + HTTP-only refresh cookie).
- `JWT_SECRET` is auto-generated and persisted to `data/.jwt_secret`.
- `ENCRYPTION_KEY` (env var or auto-generated into `data/.encryption_key`) encrypts stored secrets (MFA TOTP, SMTP password, OIDC client secret, API keys).
- OAuth 2.1 + OIDC SSO is supported. `APP_URL` must be set when using OIDC.
- TOTP MFA can be enforced globally via the admin panel.

### Real-time sync
WebSocket server (`server/src/websocket.ts`) broadcasts CRUD events to all connected clients of a trip. The client normalizes incoming events into Zustand stores.

### MCP server
Built-in MCP endpoint at `/mcp` (OAuth 2.1 authenticated). Exposes 150+ tools and 30 resources. See `MCP.md` for full documentation.
- Addon-gated tools require both the scope **and** the addon to be enabled.
- Rate limit: 300 req/min per user (configurable via `MCP_RATE_LIMIT`).
- Session limit: 20 concurrent per user (configurable via `MCP_MAX_SESSION_PER_USER`).

### File uploads
- Avatars, covers, and journey photos are served statically (unauthenticated by design; filenames are UUID v4).
- Uploaded files (`/uploads/files/`) are **never** served statically — they require API authentication.
- Photos (`/uploads/photos/`) require either a valid session JWT or a share token scoped to the exact trip.

### Security
- Helmet with a strict CSP.
- SSRF protection (`server/src/utils/ssrfGuard.ts`) blocks private IPs unless `ALLOW_INTERNAL_NETWORK=true`.
- CORS controlled by `ALLOWED_ORIGINS`.
- `FORCE_HTTPS=true` enables HTTPS redirect, HSTS, and secure cookies (only behind a TLS-terminating proxy).
- Sensitive request fields (passwords, tokens, secrets) are redacted from debug logs.

## CI/CD

- **Tests**: `.github/workflows/test.yml` runs server and client tests with coverage on every PR to `main`/`dev`.
- **Docker build**: `.github/workflows/docker.yml` bumps version (from git tags), builds multi-arch images (`linux/amd64`, `linux/arm64`), pushes to Docker Hub, and publishes the Helm chart on every push to `main`.
- **Branch enforcement**: `.github/workflows/enforce-target-branch.yml` ensures external contributors target `dev`, not `main`.

## Environment variables (key ones)

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default `3000`) |
| `NODE_ENV` | `production` or `development` |
| `ENCRYPTION_KEY` | At-rest encryption key (generate with `openssl rand -hex 32`) |
| `TZ` | Timezone for logs and scheduled jobs |
| `LOG_LEVEL` | `info` or `debug` |
| `ALLOWED_ORIGINS` | CORS origins |
| `APP_URL` | Public base URL (required for OIDC and email links) |
| `FORCE_HTTPS` | Enable HTTPS redirects / HSTS / secure cookies |
| `TRUST_PROXY` | Number of trusted reverse proxies |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First-boot admin credentials |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | OIDC SSO config |
| `DEMO_MODE` | Hourly data reset (default `false`) |

See `server/.env.example` and `docker-compose.yml` for the full reference.

## Useful reminders

- The WebSocket path is `/ws` — reverse proxies must support WebSocket upgrades on that path.
- Database changes require a new migration appended to `server/src/db/migrations.ts`.
- Changes made through MCP are broadcast via WebSocket just like web UI changes.
- When an admin toggles an addon, all active MCP sessions are invalidated.
- Demo mode blocks all MCP write operations.
- All new features must be discussed in Discord `#github-pr` before implementation (see `CONTRIBUTING.md`).
