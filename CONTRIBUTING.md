# Contributing

Rentopya is a multi-company car rental SaaS built on a Next.js + Go boilerplate. Keep the conventions strict: most work is organization-scoped (`/t/{slug}`, `/v1/tenant/*`), and the platform layer (auth, RBAC, engines) stays shared.

## Working rules

- Prefer the nearest app boundary (`backend/`, `frontend/`, `site/` or `mobile/`) before widening scope.
- Canonical env is the repo-root `.env`.
- Do not treat `.next/` or generated output as source. Commit `backend/internal/database/db` after `make -C backend sqlc`.
- New or changed `/v1` routes update `backend/docs/openapi.yaml` in the same change. Then regenerate both clients: `cd frontend && pnpm api:generate` and `cd mobile && npm run api:generate`.
- New production env key: `deploy/env/schema` + `@version` bump, `scripts/prod-env.sh example > .env.server.example`, `make env-check` ([docs/EXTENDING.md](./docs/EXTENDING.md) → Environment variables). Never hand-edit `.env.server.example`.
- Media URLs are API-owned. Never assemble S3 keys or bucket URLs in the browser.
- Organization-owned data: `organization_id` in every table and query, organization from `orgctx`, another organization's record → 404 (`.agents/skills/add-tenant-resource`).
- Provider credentials are per organization and encrypted; never in env, logs or responses (`.agents/skills/integration-adapter`).
- If you change a convention (envelope, RBAC, shells, env), update the matching file under `docs/` or `backend/docs/` in the same change.
- Agent checklists live under `.agents/skills/`. Index: [AGENTS.md](./AGENTS.md).

## Backend

Start from [backend/API_CONVENTIONS.md](./backend/API_CONVENTIONS.md) and [backend/DATABASE_RULES.md](./backend/DATABASE_RULES.md).

```sh
make -C backend test
make -C backend lint
make -C backend openapi-lint
```

Database tests and the RT-A01 isolation test need `TEST_DATABASE_URL`. CI runs them against a Postgres service; run them locally too when you touch tenant tables, queries or `/v1/tenant` routes.

## Frontend

```sh
cd frontend
pnpm typecheck
pnpm lint
```

From repo root: `make check-i18n` (missing translation keys). Date fields use the shared pickers (`.agents/skills/admin-date-picker`). Do not add native `<input type="date" />`.

## Site

```sh
cd site
pnpm typecheck
pnpm lint
pnpm test
```

## Mobile

```sh
cd mobile
npm ci
npm run typecheck && npm run lint && npm run i18n:check && npm test && npm run api:check
npx expo-doctor
```

Read `mobile/README.md` and `mobile/AGENTS.md` first. Never run `eas` commands; release rules are in `.agents/skills/mobile-ci`.

## CI and shipping

`.github/workflows/ci.yml` runs on every branch push. A `changes` job picks the area jobs from the changed paths; docs-only pushes skip them, and `[ci-full]` in the head commit message runs everything. `ci` is the single required check. The `auto-pr` job is disabled (`if: false`): push a feature branch, open a PR, and the owner merges. Commit messages carry the Linear id (`TEC-1234: …`) and no AI attribution (`commit-policy` job).

## Docs

Domain designs live in `docs/design/` (one file per area, linked from the module's package comment). Update the matching design doc when a change alters its behaviour. The full pre-PR checklist is `.agents/skills/verify-changes`.
