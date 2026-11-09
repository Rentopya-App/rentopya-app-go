-- Self-service account deletion (docs/design/account-deletion.md).

-- name: RestoreDeactivatedUser :one
-- The e-mailed restore link reopens the account until the purge date.
UPDATE users
SET status = 'active',
    deactivated_at = NULL,
    deletion_due_at = NULL,
    restore_token_hash = NULL
WHERE restore_token_hash = sqlc.arg(restore_token_hash)
  AND deleted_at IS NULL
  AND deletion_due_at > sqlc.arg(now)
RETURNING *;

-- name: ListOrganizationsSolelyOwnedByUser :many
-- Live organizations where the user holds the template owner role and no
-- other owner has an open (not deleted, not pending deletion) account. The
-- deletion request is refused while any is listed.
SELECT o.id, o.uuid, o.slug, o.name
FROM organizations o
INNER JOIN organization_members om
    ON om.organization_id = o.id AND om.user_id = sqlc.arg(user_id)::bigint
WHERE o.deleted_at IS NULL
  AND EXISTS (
        SELECT 1
        FROM organization_member_roles omr
        INNER JOIN roles r
            ON r.id = omr.role_id AND r.scope = 'tenant' AND r.organization_id IS NULL AND r.slug = 'owner'
        WHERE omr.organization_id = om.organization_id AND omr.member_id = om.id
      )
  AND NOT EXISTS (
        SELECT 1
        FROM organization_members om2
        INNER JOIN organization_member_roles omr2
            ON omr2.organization_id = om2.organization_id AND omr2.member_id = om2.id
        INNER JOIN roles r2
            ON r2.id = omr2.role_id AND r2.scope = 'tenant' AND r2.organization_id IS NULL AND r2.slug = 'owner'
        INNER JOIN users u2
            ON u2.id = om2.user_id AND u2.deleted_at IS NULL AND u2.deactivated_at IS NULL
        WHERE om2.organization_id = o.id
          AND om2.user_id <> sqlc.arg(user_id)::bigint
      )
ORDER BY o.name, o.id;

-- name: DeleteUserPushTargets :exec
-- Deletion request: no push reaches the closed account's phones or browsers.
WITH devices AS (DELETE FROM push_devices WHERE push_devices.user_id = sqlc.arg(user_id)::bigint)
DELETE FROM push_subscriptions WHERE push_subscriptions.user_id = sqlc.arg(user_id)::bigint;

-- name: ListUsersDueForPurge :many
SELECT id, uuid
FROM users
WHERE deleted_at IS NULL
  AND deletion_due_at IS NOT NULL
  AND deletion_due_at <= sqlc.arg(now)
ORDER BY deletion_due_at, id
LIMIT sqlc.arg(row_limit);

-- name: PurgeUserSignInData :exec
-- Sign-in methods (OAuth links, passkeys, TOTP), sessions, codes and
-- platform roles; nothing else can reach the account.
WITH oauth AS (DELETE FROM oauth_accounts WHERE oauth_accounts.user_id = sqlc.arg(user_id)::bigint),
     passkeys AS (DELETE FROM webauthn_credentials WHERE webauthn_credentials.user_id = sqlc.arg(user_id)::bigint),
     totp AS (DELETE FROM user_totp WHERE user_totp.user_id = sqlc.arg(user_id)::bigint),
     refresh AS (DELETE FROM refresh_tokens WHERE refresh_tokens.user_id = sqlc.arg(user_id)::bigint),
     otps AS (DELETE FROM otp_codes WHERE otp_codes.user_id = sqlc.arg(user_id)::bigint)
DELETE FROM user_roles WHERE user_roles.user_id = sqlc.arg(user_id)::bigint;

-- name: PurgeUserPersonalData :exec
-- Devices, preferences, inbox (every organization's notices to the person)
-- and starred or shared files.
WITH push_subs AS (DELETE FROM push_subscriptions WHERE push_subscriptions.user_id = sqlc.arg(user_id)::bigint),
     push_devs AS (DELETE FROM push_devices WHERE push_devices.user_id = sqlc.arg(user_id)::bigint),
     prefs AS (DELETE FROM notification_preferences WHERE notification_preferences.user_id = sqlc.arg(user_id)::bigint),
     stars AS (DELETE FROM storage_stars WHERE storage_stars.user_id = sqlc.arg(user_id)::bigint),
     shares AS (DELETE FROM storage_shares WHERE storage_shares.user_id = sqlc.arg(user_id)::bigint)
DELETE FROM notifications WHERE notifications.user_id = sqlc.arg(user_id)::bigint;

-- name: ListUserOrganizationIDs :many
-- Organizations the account is a member of.
SELECT om.organization_id
FROM organization_members om
WHERE om.user_id = sqlc.arg(user_id)::bigint
ORDER BY om.organization_id;

-- name: PurgeUserFromOrganization :exec
-- Membership goes (its roles and branch scopes cascade). Rentals,
-- contracts, finance and activity rows keep their created_by / actor
-- references to the anonymised users row.
DELETE FROM organization_members
WHERE organization_members.organization_id = sqlc.arg(organization_id)
  AND organization_members.user_id = sqlc.arg(user_id)::bigint;

-- name: AnonymizeUser :execrows
-- The row stays because rental, contract, finance and audit records point
-- to it; nothing in it identifies the person any more.
UPDATE users
SET email = 'deleted-' || uuid::text || '@deleted.invalid',
    name = sqlc.arg(name),
    surname = '',
    password_hash = '',
    password_set = FALSE,
    status = 'disabled',
    email_verified_at = NULL,
    last_login_at = NULL,
    restore_token_hash = NULL,
    deleted_at = sqlc.arg(now)
WHERE id = sqlc.arg(id) AND deleted_at IS NULL;
