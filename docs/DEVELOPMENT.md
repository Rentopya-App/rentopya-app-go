# Development

## Prerequisites

- Go (version in `backend/go.mod`, currently 1.26)
- Node (version in `frontend/.nvmrc` / `site/.nvmrc`, currently 22) and pnpm; npm for `mobile/`
- Docker + Compose
- golang-migrate, sqlc, air, golangci-lint, gofumpt — see [backend/TOOLCHAIN.md](../backend/TOOLCHAIN.md)

## First clone

```sh
cp .env.example .env
```

Set these **before** sharing a Docker host with another stack:

| Variable | Purpose |
|----------|---------|
| `NAME_PREFIX` | **Required in prod.** Container, volume and network names (`${NAME_PREFIX}-postgres`, `${NAME_PREFIX}-app`, …) |
| `COMPOSE_PROJECT_NAME` | Compose project name |
| `LOCAL_NETWORK_NAME` | Local bridge |
| `APP_NETWORK_NAME` | Prod private bridge (default `${NAME_PREFIX}-app`) |
| `*_VOLUME_NAME` | Named volumes so SeaweedFS/Postgres do not collide |

In `compose.prod.yml` every internal host is qualified as `<service>.${APP_NETWORK_NAME}` (`postgres.myapp-app`, `backend.myapp-app`, …). Never use a bare service name: on the shared `dokploy-network` it can resolve to another stack's container.

Root `.env` is canonical. `backend/.env` is a fallback only. Do not keep a long-lived `frontend/.env.local` for API URLs; `API_URL` comes from the root env.

`API_URL` **must** include `/v1` (Go routes are `/v1/...`). Default: `http://127.0.0.1:8080/v1`.

## Local

```sh
make local-dev
make create-super-admin SA_EMAIL=you@example.com
```

Sign in at http://localhost:3000/platform/login, create an organization under Platform → Organizations and open its panel at `/t/{slug}`. Organization routes need `TENANCY_ENABLED=true` (the `.env.example` value).

Helpers:

| Target | What it does |
|--------|----------------|
| `make infra` / `make infra-down` | Compose infra only (`make infra-ps`, `make infra-logs`) |
| `make backend-dev` | air on `:8080` |
| `make frontend-dev` | `pnpm dev` on `:3000` |
| `make site-dev` | Branded site (`site/`) on `:3100`: open `http://{subdomain}.localhost:3100` ([branded-site.md](./design/branded-site.md)) |
| `make -C backend worker` | Asynq worker as its own process (set `QUEUE_WORKER_INPROCESS=false`; by default the API runs it in-process) |
| `make migrate-up` | Apply SQL migrations |
| `make create-super-admin` | Upsert platform admin + `super_admin` role |
| `make search-reindex` | Rebuild Meilisearch indexes (users, roles, …) |
| `make check-i18n` | Find missing / unwired translation keys (en+tr, activity, RBAC, exports) |
| `make free-dev-ports` | Free :8080 / :3000 from stale air / Next.js processes |
| `make tools` | Print Docker / Compose / Go toolchain versions |

### Provider fakes

Outside production the API registers fake providers (`kabis_fake`, `einvoice_fake`, `hgs_fake`, `yolcu360_fake`, `obilet_fake`, `whatsapp_fake`); connect them under `/t/{slug}/settings/integrations` like real accounts (WhatsApp under `/t/{slug}/settings/whatsapp`). The KABİS, e-invoice and channel fakes take a non-secret `scenario` field (for example `ok`, `outage`, `timeout`, `reject`; each fake's package comment lists its values). Two providers have HTTP fakes for end-to-end runs (from `backend/`):

| Fake | Command | Env |
|------|---------|-----|
| iyzico | `go run ./cmd/iyzico-fake -addr 127.0.0.1:18090 -webhook http://127.0.0.1:8080/v1/public/payments/iyzico/webhook` | `IYZICO_SANDBOX_BASE_URL=http://127.0.0.1:18090`, connect an iyzico account in sandbox mode with the fake's keys |
| Netgsm | `go run ./cmd/netgsm-fake -addr 127.0.0.1:18091` | `NETGSM_SANDBOX_BASE_URL=http://127.0.0.1:18091`, connect a Netgsm account in sandbox mode; received messages are listed on the fake's `/` page |

`SMS_LOG_PROVIDER=true` adds an SMS provider that only writes masked log lines.

### Local URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API | http://127.0.0.1:8080 |
| Scalar docs | http://127.0.0.1:8080/docs/ |
| Health / ready | http://127.0.0.1:8080/healthz · `/readyz` |
| Adminer | http://127.0.0.1:8081 |
| SeaweedFS filer UI | http://127.0.0.1:8888 |
| MailHog | http://127.0.0.1:8025 |
| Meilisearch | http://127.0.0.1:7700 |
| Centrifugo WS | ws://127.0.0.1:8000/connection/websocket |

Login: http://localhost:3000/platform/login

## Branding

The product is **Rentopya**: name and colors in `frontend/src/config/brand.ts`, CSS tokens in `frontend/src/styles/theme.css`, logos in `frontend/src/components/brand/`. Brand kit, usage rules and the identifiers that intentionally stay `rentopia`: [brand.md](./brand.md).

## VAPID (optional Web Push)

```sh
npx web-push generate-vapid-keys
```

Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` in `.env`. The frontend registers via `/app-push-sw.js` → BFF → `/v1/notifications/vapid-public-key` + push-subscriptions.

Closed-browser push does not work until these three are set.

Optional frontend public vars (root `.env`): `NEXT_PUBLIC_BFF_BASE_URL`, `NEXT_PUBLIC_REALTIME_ENABLED`, `NEXT_PUBLIC_CENTRIFUGO_URL`, `NEXT_PUBLIC_DEFAULT_LOCALE`, `NEXT_PUBLIC_FALLBACK_LOCALE`.

## Production / Dokploy

Production never starts from a copy of `.env.example`. The env comes from `deploy/env/schema` ([design/env-core.md](./design/env-core.md)).

1. `make prod-env`: asks only for the public app URL (e.g. `https://panel.example.com`), derives every URL from it and generates all secrets and the VAPID pair into `.env.server` (mode 600). Centrifugo gets `realtime.<app host>`; edit `REALTIME_HOST` and the two Centrifugo URLs if you want another host. Company sites answer on `{subdomain}.<host of SITE_BASE_URL>` (default: the app host).
   Fill `SMTP_*` yourself. TEC-1165 adds `SMTP_TLS` (`auto`: implicit TLS on port 465, STARTTLS required on any other port; `starttls` / `implicit` force one; `none` is refused in production) and `SMTP_TIMEOUT` (default `10s`). Leave `TRUSTED_PROXIES` empty behind Traefik on the docker networks (loopback + private ranges are trusted); list your proxies' CIDRs if another proxy sits in front, or `none` to ignore `X-Forwarded-For`.
2. Set `IMAGE_TAG` to the release to run (`v0.N`, see [Images](#images-ghcr)), then `make prod-env-check`, `make prod-config` and `make prod-up`. On Dokploy, paste `.env.server` into the compose app's environment and point the frontend domain at port 3000, the Centrifugo domain at port 8000 and the wildcard site domain (`*.<app host>`) at the `site` service, port 3000.
3. Plain Docker host only (Dokploy creates it for you): `docker network create dokploy-network` once

### Images (GHCR)

The server does not build the app images. CI builds every service in `deploy/images.json` and, on a green `main` push, publishes `ghcr.io/rentopya-app/rentopya-app-go-<service>` as `:sha-<short>` and `:v0.N` (never `latest`). `compose.prod.yml` runs `${IMAGE_REPO}-<service>:${IMAGE_TAG}` for `backend` (also `migrate` and `worker`), `frontend`, `site` and `backup`, with `pull_policy: ${IMAGE_PULL_POLICY:-always}`.

- `IMAGE_REPO` comes from the schema (`ghcr.io/rentopya-app/rentopya-app-go`).
- `IMAGE_TAG` has no default: compose refuses to start without it. On Dokploy set it in the compose app's environment to the release being deployed (`v0.N`); to roll back, set the previous `v0.N` and redeploy (migrations are not reverted).
- Private packages: add a `ghcr.io` registry with a `read:packages` token in Dokploy (plain host: `docker login ghcr.io`).
- Build on the host instead (smoke test of an unreleased commit): `make prod-build` / `make prod-up-build` use the `compose.build.yml` override, which adds the `build:` sections back (contexts as in `deploy/images.json`) under the same image names. Use a non-release tag such as `IMAGE_TAG=local`.

### Plain Docker host with automatic updates (deprecated)

`scripts/server-sync.sh` (or `make prod-sync`) is kept for the current plain-host cron until production is switched to Dokploy pulling GHCR images. It follows `main` (only CI-green commits reach it): when `origin/main` moved it fast-forwards, upgrades `.env.server` if the env schema changed, starts the stack, waits for the backend to be healthy and prunes old images. One run at a time (flock). `SYNC_MODE=build` (default, the previous behaviour) builds the images on the host with `compose.build.yml` under `IMAGE_TAG=local`; `SYNC_MODE=pull` pulls the `:sha-<short>` images CI published for the target commit instead (needs `docker login ghcr.io`) and only moves the checkout once the pull succeeded. Cron example:

```
*/5 * * * * /opt/rentopia/scripts/server-sync.sh >> /var/log/rentopia-sync.log 2>&1
```

Rollback: `touch .sync-paused`, `git checkout <previous sha>`, `scripts/server-sync.sh --force` (redeploys the checked-out commit without pulling git; migrations are not reverted). Remove `.sync-paused` to resume. First admin: `make prod-super-admin SA_EMAIL=…` (runs `/app/create-super-admin` inside the backend container; without `SA_PASSWORD` it prints a generated password once, see [Super admin](#super-admin)). TSB list import from the host: `docker compose --env-file .env.server -f compose.prod.yml exec backend /app/catalog-import -file /path/in/container.xlsx -apply` (or use Platform → Araç kataloğu → Aktarımlar).

### Upgrading the env for a new release

`make prod-env-upgrade` (or `scripts/prod-env.sh upgrade <your env file>`) brings an env written by an older release up to the current schema (`deploy/env/schema`, versioned by `ENV_SCHEMA_VERSION`):

- every existing value is kept, so secrets such as `DB_PASSWORD` and `APP_ENCRYPTION_KEY` never change;
- keys renamed in the schema move with their value, new keys are generated or given their default, retired keys are commented out;
- keys the schema does not know (your own additions) are kept under "Unmanaged";
- the file is rewritten in place and the previous one is kept as `<file>.bak.<timestamp>`.

`make prod-env-check` exits non-zero when the file is behind the schema, a secret or URL is blank, or a secret still holds its public `.env.example` value. The backend refuses to start outside development with a blank or development secret (`backend/internal/config/guard.go`) and with an unknown `APP_ENV`. `.env.server.example` is generated (`scripts/prod-env.sh example`); never edit it by hand. When a release needs a new env key, follow [EXTENDING.md](./EXTENDING.md) → Environment variables (schema line, `@version` bump, `make env-check`); design: [design/env-core.md](./design/env-core.md).

Networks: Compose creates a private bridge network per app (`${APP_NETWORK_NAME:-${NAME_PREFIX}-app}`) and every service joins it. Only **frontend** (`:3000`), **site** (`:3000`) and **centrifugo** (`:8000`) also join the shared `dokploy-network`, so the proxy can route their domains. The backend is reached through the frontend's `/api` proxy (the site calls it on the private network), and SeaweedFS, Postgres, Redis, Meilisearch, wuzapi and the worker stay private (files reach browsers through API endpoints, never a bucket URL). No service publishes host ports.

`APP_ENCRYPTION_KEY` (32-byte, raw or base64) derives every at-rest key: OAuth / GitHub secrets, organization integration credentials, encrypted personal data and blind indexes. Generate once (`openssl rand -base64 32`, `make prod-env` does it) and never change it on an install with data.

## Error tracking (optional, Sentry protocol)

The tracker is a self-hosted, Sentry-protocol endpoint (events only; it has no `sentry-cli` API, so nothing is uploaded at build time: no source maps, no releases, no auth token). Every variable is optional; an empty DSN turns reporting off.

| Env (Dokploy / `.env.server`) | Passed as | Read by |
|---|---|---|
| `BACKEND_SENTRY_DSN` | `SENTRY_DSN` | backend API + worker |
| `FRONTEND_SENTRY_DSN` | `SENTRY_DSN` | Next.js server, edge, browser |
| `SITE_SENTRY_DSN` | `SENTRY_DSN` | branded site server + edge |
| `SENTRY_ENVIRONMENT` (default: `APP_ENV`) | same | all |
| `SENTRY_RELEASE` (optional) | same | all |
| `SENTRY_TRACES_SAMPLE_RATE` (default `0`) | same | backend only |

Local dev reads `SENTRY_DSN` from the root `.env` directly. `APP_ENV` (development / staging / production), the production endpoint guard, log masking and failed-work alerts (`ALERT_EMAIL`): [operations/observability.md](./operations/observability.md).

- **Backend**: 5xx responses and panics (route pattern, status, `request_id` tag), auth misconfiguration warnings (adapter secret mismatch, provider disabled, id_token audience/issuer), failed queue tasks (`task_type`, `task_id` and the payload's ids), integration jobs that fail or need verification (`job_kind`, `job_uuid`), and `ERROR` log lines (one event per message per minute). Requests the client cancelled are logged as `499` at INFO and never reported. One `http_request` INFO line is written per 4xx and per `/v1/auth/*` / `/v1/internal/auth/*` request (method, route, status, duration, request_id, error_code, scrubbed reason).
- **Frontend**: `instrumentation.ts` (server/edge, `onRequestError`), `instrumentation-client.ts` (browser), `global-error.tsx`, route error boundaries, the `/api/v1` BFF proxy, and the NextAuth `logger.error` hook (user errors like `CredentialsSignin` are logged, not reported). The browser gets its DSN at runtime from `/api/client-env` (loaded `beforeInteractive` in the root layout), so the image needs no build arg.
- **Never sent**: request bodies, cookies, query strings, `Authorization` / adapter headers, tokens, secrets, emails, phone numbers. The user is the internal user uuid only. Code: `backend/internal/observability`, `frontend/src/lib/observability`.

## Super admin

From the repo root (loads `.env`):

```sh
make create-super-admin SA_EMAIL=you@example.com                 # generates a password, printed once
SA_PASSWORD='…' make create-super-admin SA_EMAIL=you@example.com SA_NAME=Ada SA_SURNAME=Admin
make create-super-admin SA_EMAIL=you@example.com SA_RESET_PASSWORD=true   # reset an existing user
```

The same target exists under `backend/` (`make -C backend create-super-admin …`).

There are no default credentials (the old `admin@example.com` / `Password1` is gone):

- `SA_EMAIL` (`-email`) is required.
- `SA_PASSWORD` (`-password`) must pass the sign-up password policy (min 8, upper + lower + digit). Prefer the env var: a flag shows up in the process list. Without it, `-generate-password` (what `make` passes) creates a 20-character random password and prints it once to stdout; it is not logged anywhere else.
- An existing user is refused unless `SA_RESET_PASSWORD=true` (`-reset-password`), which overwrites its password and grants `super_admin`.

Production (pull-only host, no source tree): `make prod-super-admin SA_EMAIL=you@example.com`, or directly `docker compose --env-file .env.server -f compose.prod.yml exec backend /app/create-super-admin -email you@example.com -generate-password`.

## Mobile app

`mobile/` is the Expo app (SDK 58) for the company panel. It calls the Go API directly (`EXPO_PUBLIC_API_URL` + `/v1/*`, no `/v1` in the variable) with its own Bearer token pair, and sends the picked organization in `X-Organization` on `/v1/tenant/*`.

```sh
cd mobile
cp .env.example .env.local      # EXPO_PUBLIC_API_URL=http://localhost:8080
npm install
npx expo start
```

`make local-dev` gives it the API on `:8080`. Native modules need a development build (`npx expo run:ios` / `run:android`); `ios/` and `android/` are generated and never committed. Commands, variables and rules: [mobile/README.md](../mobile/README.md) and [mobile/AGENTS.md](../mobile/AGENTS.md). CI and release: `.agents/skills/mobile-ci`.

## After a backend contract change

```sh
make -C backend sqlc
make -C backend openapi-lint
cd frontend && pnpm api:generate && pnpm typecheck
cd ../mobile && npm run api:generate && npm run api:check   # commit src/core/api/schema.d.ts
```

Any `backend/docs/openapi.yaml` change (descriptions too) regenerates the mobile types; `npm run api:check` fails on stale ones.

## CI

`.github/workflows/ci.yml` runs on every branch push (and by hand via `workflow_dispatch`). All jobs run on `ubuntu-24.04`.

- `changes` diffs the branch against its merge-base with `main` and decides which area jobs run: `backend` (sqlc up to date, `go vet`, golangci-lint v2, migrations + `go test` against Postgres, OpenAPI lint), `frontend`, `site`, `env` + `prod-env`, `mobile` (on `mobile/**`, `backend/docs/openapi.yaml` and the release scripts: typecheck, lint, tests, `npm run api:check` so stale mobile API types fail, expo-doctor, `scripts/ci/mobile-release.test.sh`). Docs and `*.md` changes run nothing heavy. Everything runs on a `main` push, a manual run, a change under `.github/workflows/`, or a head commit message containing `[ci-full]`.
- `commit-policy` always runs; `acceptance` runs the Go acceptance scenarios when backend or frontend ran.
- `mobile-release` calls `.github/workflows/mobile-release.yml` (OTA or store build) only on a green `main` push that changed `mobile/` and only while the repo variable `MOBILE_RELEASE_ENABLED` is `true`; everywhere else it is skipped. Owner setup: `mobile/docs/OTA.md`.
- `ci` is the single required status check: it fails if any needed job failed or was cancelled and treats skipped jobs as passed.
- Caches: Go modules/build (`setup-go`), the pnpm store (frontend, site), npm (mobile) and golangci-lint's own cache.

Shipping: push a feature branch and open a PR. The `auto-pr` job is disabled (`if: false`), so nothing merges by itself; the owner merges. Commit messages carry the Linear id and no AI attribution (`commit-policy`).

### Images and releases (GHCR, `v0.N`)

- **Which images**: every entry in [`deploy/images.json`](../deploy/images.json) (backend, frontend, site, backup). CI loops over it as a matrix; ship a new container by adding an entry there plus its service in `compose.prod.yml`. `migrate` and `worker` run the backend image; postgres, redis, seaweedfs, meilisearch, centrifugo and wuzapi are upstream images.
- **Names** come from the repository, lower-cased: `ghcr.io/<owner>/<repo>-<service>` (for this repo `ghcr.io/rentopya-app/rentopya-app-go-backend`, `…-frontend`, `…-site`, `…-backup`). No app name is hard-coded.
- **Every branch push**: `image-build` builds every image without pushing (gha cache per service). It is part of the `ci` gate, so it is also where the panel's production `next build` is checked.
- **Test push (manual)**: Actions → CI → Run workflow with `push_test_images` ticked pushes `:test-<short-sha>` only. Never `latest` or `v0.*`.
- **`main` push**: the whole suite runs; only when every test job passed (`commit-policy`, `prod-env`, `env`, `backend`, `frontend`, `site`, `acceptance`; a failed, cancelled or skipped one blocks it) does `publish-images` push `:sha-<short>` and `:v0.N`. Then `release-tag` creates the git tag `v0.N` and a GitHub release whose notes are `git log --no-merges <previous v0.* tag>..HEAD` (the whole history for the first release, capped at 200 lines). `release-meta` picks the number before the build: the highest existing `v0.*` tag plus one.
- **The first merge into `main`** (no `v0.*` tag yet) produces `v0.1`: the git tag, a GitHub release, and images `:sha-<short>` and `:v0.1` for every service.
- **Provenance**: every image carries OCI labels (`org.opencontainers.image.version`, `.created`, `.revision`, `.source`; release images also `.description` with the notes on one line). The backend bakes in version, git SHA and build time (ldflags) plus `release.json` with the notes (`internal/buildinfo`); `/healthz` reports `version` (`v0.N`, `sha-<short>` on a branch build, `dev` locally), `git_sha` and `built_at`. On each deploy the `migrate` service runs `release-record` after `migrate up` and adds one row to `app_releases` (an event log; fail-soft, never blocks a deploy).
- Permissions: only `publish-images` / `image-test-push` get `packages: write` and only `release-tag` gets `contents: write` (the built-in `GITHUB_TOKEN`; no secret to add). The server still builds from `compose.prod.yml` until the pull-based deploy lands.

## Boilerplate sync

Rentopya shares no git history with the boilerplate. Changes are read and re-applied by hand. Base SHA, inventory and work packages: [BOILERPLATE_SYNC.md](./BOILERPLATE_SYNC.md).
