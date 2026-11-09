# Account deletion

Self-service deletion of a staff / platform account (App Store guideline 5.1.1(v), KVKK m.7). Customers of a company (customer portal `/r/{orgSlug}`, `customers` rows) are the company's records and are not covered here; customer anonymisation is a company action ([customers.md](./customers.md)).

## Flow

1. **Delete.** Mobile account settings or panel Profile → Delete account. `POST /v1/auth/account/deactivate` with an e-mail code (`/v1/auth/account/deactivate/request`) or a step-up grant. The user becomes `disabled` with `deactivated_at`; every refresh session, mobile push device (`push_devices`), browser push subscription and stored Apple token is revoked, and every sign-in answers `403 ACCOUNT_DEACTIVATED`. `deletion_due_at` = now + 30 days (`AccountRestoreWindow`); only the SHA-256 of a random 32-byte restore token is stored (`restore_token_hash`).
2. **E-mail.** `auth.account_deactivated` (tr / en) carries `{{purge_date}}` (Istanbul day, in the user's language) and `{{restore_url}}` = `<FRONTEND_URL>/platform/restore-account#<token>`. The token sits after `#`, so it reaches no server log. The notification row keeps the link only until the delivery is final: the e-mail is enqueued with `SecretVars: ["restore_url"]`, which stores a copy rendered without it in `payload.redact`, and the delivery swaps it in (`RedactNotification`).
3. **Restore (30 days).** `/platform/restore-account` reads the fragment and, when the person presses the button (a mail scanner opening the link changes nothing), calls the public `POST /v1/auth/account/restore {token}` (10 per IP per window). A valid token before the date reopens the account (`active`, dates and token cleared) and sends `auth.account_restored`; the person signs in again. Unknown, used or late tokens → `400 INVALID_RESTORE_LINK`. A platform admin setting status `active` before the purge also clears the schedule.
4. **Purge.** The worker's hourly `app:auth:account-purge` (`PurgeDueAccounts`, at most 100 accounts a run) erases every account past `deletion_due_at`, each in one transaction:
   - deleted: OAuth links (Apple, Google, GitHub), passkeys, TOTP, refresh tokens, OTP codes, platform roles, push devices and subscriptions, notification preferences, every notification addressed to the user, starred / shared files;
   - per organization: the membership (its roles and branch scopes cascade);
   - the `users` row stays, because rentals, reservations, contracts, inspections, payments, cash, invoices, activity and other company records reference it (`created_by`, `actor_id`, …), but it is anonymised: e-mail `deleted-<uuid>@deleted.invalid`, name `Silinmiş kullanıcı`, empty surname and password hash, verification and last-login cleared, `deleted_at` set. Every user query filters `deleted_at IS NULL`, so the row can no longer sign in, be listed or restored, and the e-mail address is free for a new account. Users have no phone or avatar columns.
   - Then `auth.account_deleted` (tr / en) goes to the old address. That row is not linked to the user and is enqueued with `SecretVars: ["name"]` and `ForgetRecipient`, so after delivery it keeps neither the name nor the address.

## Last owner rule

A company must always have an owner. The deletion request (and the code request, so no code is mailed in vain) is refused with `409 LAST_ORGANIZATION_OWNER` while the user holds the template `owner` role in a live organization and no other owner of it has an open account (an owner whose own deletion is pending does not count, so two owners cannot both leave). `error.details[]` lists those organizations (`field = organization`, `message` = name, `code` = slug). The person hands ownership over (Team → roles) or asks support to close the company, then deletes the account. The last super admin keeps the older `409 CONFLICT` rule.

## Mevcut kapatılmış hesaplar

Accounts deactivated before migration 000139 were told that deactivation keeps their data, and they never got a restore link. The migration does not schedule them: they keep `deletion_due_at = NULL`, and the purge only picks rows with a non-null date that has passed (`ListUsersDueForPurge`), so the worker never erases them. They stay `disabled` with `deactivated_at`. A platform admin can reactivate one (status `active`). Scheduling them for erasure later is a separate, explicit decision by the product owner (with notice to the people concerned), not something this change does.

## Notes

- One-time codes in security e-mails (login, password reset, e-mail verification, account deletion, OAuth link) are enqueued with `SecretVars: ["code"]`, so the stored notification drops the code once delivered.
- Tests: usecase (`internal/modules/auth/usecase/account_deletion_test.go`), handler (`auth_flows_test.go`), notification redaction (`notifications/usecase/redact_test.go`), repository against Postgres (`internal/modules/auth/repository/account_deletion_db_test.go`, needs `TEST_DATABASE_URL`).
