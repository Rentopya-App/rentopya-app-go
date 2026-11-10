# Legal pages

Admin-editable public texts: privacy policy / KVKK aydınlatma metni, terms of use and the account deletion guide, plus a static support page. Ported from otopoly-go (`legal` module) and adapted to Rentopya.

## Public URLs

English URLs only; the Turkish page sits at the root, the English one under `/en`. An empty English body falls back to Turkish (the API answers `locale: "tr"`).

| Page | Turkish | English | Source |
|------|---------|---------|--------|
| Privacy policy | `/privacy` | `/en/privacy` | `legal_pages.slug = privacy` |
| Terms of use | `/terms` | `/en/terms` | `terms` |
| Account deletion | `/account/delete` | `/en/account/delete` | `account-deletion` + a sign-in button (`/platform/login`) |
| Support | `/support` | `/en/support` | static (`features/legal/components/support-page.tsx`, `legal.support.*` keys) |

The routes live in `frontend/src/app/(public)` and are outside the proxy matcher (`frontend/src/proxy.ts`), so they need no session. Linked from the landing footer; listed in `app/robots.ts` and `app/sitemap.ts` (origin taken from the request host). Pages are server-rendered from `GET /v1/public/legal/{slug}?locale=tr|en` with a 60 s revalidate; the API sends `Cache-Control: public, max-age=60, stale-while-revalidate=300`. Markdown goes through `components/markdown/markdown.tsx` (React elements only, raw HTML shown as text, `http(s)`, `mailto:` and same-site links).

## Editing

`/platform/legal/privacy`, `/platform/legal/terms`, `/platform/legal/account-deletion` (platform sidebar → Yasal sayfalar). Turkish and English tabs, Markdown with live preview, at most 100 KB per locale and 200 characters per title; Turkish title and body are required. A save sends only the changed fields (`PATCH /v1/platform/legal/{slug}`), records the editor in `updated_by` and writes the `legal.page.updated` activity entry. Changes reach the public page within about a minute.

Permissions: `platform.legal.read` (view the editor), `platform.legal.write` (save). Migration 000143 grants both to `super_admin`.

## Data

`legal_pages` (migration 000143): `slug` (unique, kebab-case), `title_tr`, `title_en`, `body_tr`, `body_en`, `updated_by → users`, timestamps. The migration seeds the three pages. The seed text is a starting point, not a legal review. Before you publish, replace `[Adres]` and `[MERSİS no]` in the privacy page and check the text with counsel. Once the pages are in use, the editor owns the text; a later migration must not overwrite it.

Backend: `backend/internal/modules/legal` (self-registering module, `internal/httpserver/modules.go`), queries `internal/database/queries/legal_pages.sql`.

## Store listing fields

| Store field | URL |
|-------------|-----|
| App Store Connect → Privacy Policy URL | `https://rentopya.app/privacy` (English listing: `https://rentopya.app/en/privacy`) |
| App Store Connect → Support URL | `https://rentopya.app/support` (`/en/support`) |
| Google Play → Privacy policy | `https://rentopya.app/privacy` |
| Google Play → Data safety → Delete account URL | `https://rentopya.app/account/delete` (`/en/account/delete`) |

The account deletion page describes the real flow in [account-deletion.md](./account-deletion.md): delete in the app (Menu → account → Account and security → Delete account) or in the panel (Profile → Delete account), 30-day restore link by e-mail, then permanent erasure by the worker purge. If that flow changes, update the `account-deletion` page in the editor too.
