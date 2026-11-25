# Site leads

TEC-786, migration `000130_site_leads`. Website servers submit enquiries through
`POST /v1/public/site/leads` with a web booking session minted from the site's
publishable key. Secret keys, widget sessions, foreign site keys, unpublished or
disabled sites cannot submit. Scope: `catalog.read`. Organization comes from the
credential; source host comes from the session origin, never from the body.

Kinds and required fields:

| Kind | Fields |
|---|---|
| newsletter | email |
| contact | name, email, message |
| corporate | company, name, email, phone |
| franchise | name, email, phone, city |

All require `consent_kvkk: true`; marketing consent is separate and defaults false.
Locale defaults to `tr`, accepts `tr/en`. Limits: name 160, email 254, phone 40,
company 200, city 100, message/note 5000 characters; corporate fleet size 0–100000.
No HTML is rendered. A nonempty `honeypot` returns the same 202 `{accepted:true}`
without storing anything. Newsletter email is trimmed/lowercased and unique per
organization; repeats return the same acknowledgement without changing consent
or producing another notification. No Idempotency-Key is needed for lead forms.

The existing Redis limiter enforces 10 submissions per organization/IP per hour
and 5 per session per hour, alongside public API general limits. Limits include
invalid and honeypot attempts. Redis failure follows the existing fail-open policy.
Stored `ip_hash` is HMAC-SHA-256, domain-separated by organization and salted with
the application's existing private encryption key. No raw IP is stored in leads;
rotating that key changes hashes. User agent is truncated to 300 characters. Hash
and user agent are excluded from tenant responses. Public answers expose no IDs.

`config.leads.{contact,corporate,franchise,newsletter}` enables each form, all true
when the configuration has no `leads` object. Published configuration controls
submissions. The resolve response carries these flags for server-rendered pages.

Staff routes:

- `GET /v1/tenant/site/leads/meta`: DataTable metadata, no export/import/bulk.
- `GET /v1/tenant/site/leads`: limit/offset/q; kind/status; RFC3339 `date_from`
  inclusive, `date_to` exclusive; newest first by default (`sort=-created_at`), or oldest first (`sort=created_at`).
- `GET /v1/tenant/site/leads/{uuid}`: detail, foreign UUID returns 404.
- `PATCH /v1/tenant/site/leads/{uuid}`: status (`new`, `in_progress`, `done`, `spam`)
  and note; stamps staff actor/time and records activity without copying lead PII.

Read requires `tenant.site_leads.read`; patch additionally requires
`tenant.site_leads.manage`. Owner, admin and merkez_yoneticisi templates get both.
Every query includes organization scope. New leads emit `site_lead.created` through
the notification engine, in-app only, to current members with the read permission.
Notifications contain kind only, no enquiry text or contact details. Duplicate
newsletter and honeypot submissions produce no notification. Notification failures
are logged without failing a saved lead. Export is deferred to the panel task.

The site forms and the panel's "Site başvuruları" page are described in
[branded-site.md §12.2](./branded-site.md#122-lead-forms-site-and-panel). The panel
has no export yet.

## Marketing double opt-in (TEC-1287, KVKK / İYS)

- A lead that asks for marketing (every newsletter subscription, and any form sent with `consent_marketing: true`) is **pending** until the person confirms it. Its `marketing_status` is `none`, `pending`, `confirmed` or `unsubscribed`; the API's `consent_marketing` is true only when the status is `confirmed`, and only such leads may receive marketing (or be exported as having permission).
- On submit the API stores two SHA-256-hashed tokens and e-mails the address (plain text, the lead's language) a **confirmation link** (single use, 7 days) and an **unsubscribe link** (no expiry, repeatable): `{site origin}/abonelik?confirm=…` / `?unsubscribe=…` (`/subscription` in English). The site page asks for a button press and only then calls `POST /v1/public/site/leads/confirm` or `/unsubscribe` with `{token}`, so mail scanners that open links cannot act for the person. Those routes need no credential (the 32-byte token is it) and allow 30 calls per minute per IP; unknown, used or expired links answer 404.
- Without SMTP (`SMTP_HOST` empty) no e-mail goes out and the request stays pending: never treat it as consent.
- A duplicate newsletter subscription sends no second e-mail (no mail bombing through the form).
- Confirmation and unsubscribe are recorded in the organization's activity (`site_lead.marketing_confirmed`, `site_lead.unsubscribed`).

## Retention (TEC-1287)

- `site_settings.lead_retention_months` (1 – 120, default 24) is the storage period of an organization's leads, set in the panel (Site başvuruları → Saklama süresi; `GET/PUT /v1/tenant/site/leads/settings`, `tenant.site_leads.manage` to change).
- The worker's nightly task `app:site-leads:retention` (03:40 Istanbul) deletes leads older than that and records `site_lead.retention_deleted` with the count in the organization's activity.
