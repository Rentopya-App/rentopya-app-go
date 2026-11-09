# Mobile agent notes

Read `README.md` here first; repo-wide rules are in `../AGENTS.md`.

## Expo changes every SDK: do not trust memory

Before touching an Expo, EAS or React Native API, read the `expo` major in
`package.json` and use the matching docs (`https://docs.expo.dev/versions/v58.0.0/`,
index at `https://docs.expo.dev/llms.txt`).

## Rules

- Install with `npx expo install <pkg>` (SDK-compatible versions), never a bare `npm install <pkg>`.
- Routes live in `src/app/` as one-line files; screens and hooks in `src/features/`.
- Never create or edit `ios/` / `android/` (CNG); configure `app.json` and config plugins.
- The app talks to the Go API directly (`EXPO_PUBLIC_API_URL` + `/v1/*`); company panel calls send `X-Organization`. Never put an organization in the token or take it from anything but the picked membership.
- Rentopya terms: organization / company, branch, rental, vehicle. Do not invent workspaces or a `/business` shell.
- After `backend/docs/openapi.yaml` changes: `npm run api:generate` and commit `src/core/api/schema.d.ts` (`npm run api:check`). After `frontend/src/config/permissions.ts` changes: `npm run permissions:gen`.
- Tokens only in `expo-secure-store` (`core/auth/tokens.ts`); never AsyncStorage, sqlite or logs.
- New text: a key in both `src/core/i18n/locales/tr` and `en` (`npm run i18n:check`, also covered by `npm test`).
- New icon: `sf`, `md` and `lucide` in `src/ui/icons.ts`, then `npm run icons:gen`.
- Never run `eas init`, `eas build`, `eas submit` or `eas update`; the owner does (README → Owner TODO).
- Before saying done: `npm run typecheck && npm run lint && npm run i18n:check && npm test && npm run api:check && npx expo-doctor`.
- No AI attribution in commits, PRs, comments or docs (same as the root rules).
