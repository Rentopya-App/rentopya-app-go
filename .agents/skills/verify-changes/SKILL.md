---
name: verify-changes
description: >-
  Run the same checks CI runs (backend vet/test/lint, OpenAPI lint, frontend
  typecheck/lint/i18n/build, site typecheck/lint/test/build, prod env schema)
  before committing or opening a PR. Use before saying a
  change is done.
---

# Verify changes

CI (`.github/workflows/ci.yml`) runs on every branch push. A `changes` job picks the area jobs from the changed paths (docs-only pushes skip them; `[ci-full]` in the head commit message runs everything), and the `ci` job is the single required check. Run the matching subset locally first.

## Backend (any `backend/**` change)

```bash
cd backend
sqlc generate && git diff --exit-code   # CI fails on stale sqlc output
gofmt -l .            # must print nothing
go build ./...
go vet ./...
go test ./...
make openapi-lint     # when backend/docs/openapi.yaml changed
```

`make lint` runs golangci-lint (needs `make tools`; CI pins v2.15.0).

## Frontend (any `frontend/**` change)

```bash
cd frontend
pnpm api:generate     # after OpenAPI changes; commit src/generated/api.d.ts
pnpm typecheck
pnpm lint
pnpm test             # node --test on src/**/*.test.ts (pure modules)
pnpm format:check
pnpm build            # slow; run before a PR
```

From the repo root: `node scripts/check-i18n.mjs` (CI runs it; 0 errors).

Stale `.next/types` after deleting a route: `rm -rf .next/types` and typecheck again.

## Site (any `site/**` change)

```bash
cd site
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

## Mobile (any `mobile/**` change)

```bash
cd mobile
npm ci
npx tsc --noEmit
npm run lint
npm run i18n:check
npm test
npm run api:check     # openapi-typescript pinned + src/core/api/schema.d.ts up to date
npx expo-doctor
```

(the CI `mobile` job; it runs only when `mobile/**` changed, or on a full run). After any `backend/docs/openapi.yaml` change, run `npm run api:generate` here and commit `src/core/api/schema.d.ts`, even when `mobile/` is otherwise untouched. Release rules: `mobile-ci` skill.

## Database

New migration → round-trip it (see the `db-migration` skill). Database tests (`TEST_DATABASE_URL`, including the RT-A01 isolation test in `internal/httpserver`) run in CI against a Postgres service (backend and acceptance jobs); run them locally too when you touch tenant tables, queries or `/v1/tenant` routes.

## Prod compose / env schema

```bash
scripts/prod-env.sh init -o /tmp/prod.env --app-url https://ci.example.com
docker compose --env-file /tmp/prod.env -f compose.prod.yml config -q
scripts/prod-env.sh check /tmp/prod.env
```

(the CI `prod-env` job; run it when `deploy/env/schema` or `compose.prod.yml` changed)

```bash
make env-check
```

(the CI `env` job: `.env.server.example` matches the schema, `.env.example` has every schema key and every `compose.prod.yml` variable, every backend env read reaches compose or has a decision in `deploy/env/compose-env.allow`; run it when the schema, `compose.prod.yml`, `.env.example` or a backend env read changed. Fix drift: `scripts/prod-env.sh example > .env.server.example`.)

`NAME_PREFIX` must be set; internal hosts stay `<service>.<app network>`.

## CI workflow changes

```bash
actionlint .github/workflows/*.yml   # go install github.com/rhysd/actionlint/cmd/actionlint@latest
```

Any change under `.github/workflows/` runs every job. `ci` is the single gate: a job passes when it succeeds or is skipped.

## Shipping

Push a feature branch and wait for the `ci` check to go green. The `auto-pr` job is currently disabled (`if: false`); when enabled it opens a PR into `main` after `ci` passes and merges the tested commit, and `[no-automerge]` in the head commit message keeps the PR open.
