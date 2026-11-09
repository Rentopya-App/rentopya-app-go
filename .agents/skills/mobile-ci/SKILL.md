---
name: mobile-ci
description: >-
  CI and release rules for the Expo app in mobile/: committed, pinned OpenAPI
  client types (npm run api:check), why a backend/OpenAPI change never ships a
  mobile release, the mobile-release pipeline (OTA vs EAS Build vs Xcode Cloud
  tag) and mobile/release.env. Use when touching mobile/ API types, the mobile
  CI jobs, scripts/ci/mobile-release*.sh, Xcode Cloud scripts or a release trigger.
---

# Mobile CI / release

Owner docs: `mobile/docs/OTA.md`. Never run `eas` commands or push `ios-build-*` tags yourself.

## API types contract

- `openapi-typescript` is pinned to an exact version in `mobile/package.json` (no `^`/`~`); bump it on purpose with the regenerated file.
- `mobile/src/core/api/schema.d.ts` is committed. After any `backend/docs/openapi.yaml` change (descriptions too): `cd mobile && npm run api:generate` and commit. `npm run api:check` (CI `mobile` job) fails otherwise.
- The `mobile` job runs on `mobile/**`, `backend/docs/openapi.yaml`, `scripts/ci/mobile-release*`, `.easignore` or a full run.

## Why backend changes don't release the app

The release trigger (`changes.outputs.mobile_release`) is a `main` push whose own diff touches a shipping file under `mobile/` (not `*.md`, not `mobile/docs/`). `openapi.yaml` never feeds it and neither does a full run. `openapi-typescript` output is deterministic:

| Backend change | `schema.d.ts` after `api:generate` | Mobile release? |
|---|---|---|
| Internal edit, spec reformatted | identical | no |
| API change, types regenerated and committed | diff under `mobile/**` | yes |
| API change, types not regenerated | — | `mobile` job fails |

## Release pipeline

- `ci.yml` `mobile-release` → `.github/workflows/mobile-release.yml` → `scripts/ci/mobile-release.sh`. Only on a green `main` push with `vars.MOBILE_RELEASE_ENABLED == 'true'`; skipped (green) everywhere else.
- Per platform: fingerprint unchanged → `eas update --channel production`; changed → Android `eas build --auto-submit`, iOS tag `ios-build-<hash12>` (Xcode Cloud, Tag Changes).
- The script refuses when the EAS `production` env differs from `mobile/release.env`, lacks an https `EXPO_PUBLIC_API_URL`, or is not `EXPO_PUBLIC_API_MODE=live`. `dry_run` publishes nothing.
- Values that change the native fingerprint go in `mobile/release.env` only; Xcode Cloud's `ci_post_clone.sh` reads the same file.
- Xcode Cloud scripts: edit `mobile/scripts/xcode-cloud/*.sh`, copy to `mobile/ios/ci_scripts/`.
- Tests: `scripts/ci/mobile-release.test.sh` (fake eas / fingerprint / git remote). Extend it with every behaviour change.
