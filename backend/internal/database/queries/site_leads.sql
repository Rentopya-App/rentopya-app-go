-- name: InsertSiteLead :one
INSERT INTO site_leads (organization_id, kind, name, email, phone, company, city, message, fleet_size,
 locale, consent_kvkk, consent_marketing, source_host, ip_hash, user_agent)
VALUES (sqlc.arg(organization_id),sqlc.arg(kind),sqlc.arg(name),sqlc.arg(email),sqlc.arg(phone),sqlc.arg(company),sqlc.arg(city),
 sqlc.arg(message),sqlc.narg(fleet_size),sqlc.arg(locale),sqlc.arg(consent_kvkk),sqlc.arg(consent_marketing),sqlc.arg(source_host),sqlc.arg(ip_hash),sqlc.arg(user_agent))
ON CONFLICT (organization_id, lower(email)) WHERE kind = 'newsletter' DO NOTHING RETURNING *;

-- name: GetSiteLead :one
SELECT * FROM site_leads WHERE organization_id = sqlc.arg(organization_id) AND uuid = sqlc.arg(uuid);

-- name: PatchSiteLead :one
UPDATE site_leads SET status = COALESCE(sqlc.narg(status)::text,status), note = COALESCE(sqlc.narg(note)::text,note),
 handled_by = sqlc.narg(handled_by), handled_at = now()
WHERE organization_id = sqlc.arg(organization_id) AND uuid = sqlc.arg(uuid) RETURNING *;

-- name: ListSiteLeads :many
SELECT * FROM site_leads WHERE organization_id = sqlc.arg(organization_id)
 AND (sqlc.narg(kind)::text IS NULL OR kind = sqlc.narg(kind))
 AND (sqlc.narg(status)::text IS NULL OR status = sqlc.narg(status))
 AND (sqlc.narg(date_from)::timestamptz IS NULL OR created_at >= sqlc.narg(date_from))
 AND (sqlc.narg(date_to)::timestamptz IS NULL OR created_at < sqlc.narg(date_to))
 AND (sqlc.arg(q)::text = '' OR name ILIKE '%' || sqlc.arg(q) || '%' OR email ILIKE '%' || sqlc.arg(q) || '%' OR company ILIKE '%' || sqlc.arg(q) || '%')
ORDER BY
 CASE WHEN sqlc.arg(sort_desc)::boolean THEN created_at END DESC,
 CASE WHEN NOT sqlc.arg(sort_desc)::boolean THEN created_at END ASC,
 id DESC LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: CountSiteLeads :one
SELECT count(*) FROM site_leads WHERE organization_id = sqlc.arg(organization_id)
 AND (sqlc.narg(kind)::text IS NULL OR kind = sqlc.narg(kind))
 AND (sqlc.narg(status)::text IS NULL OR status = sqlc.narg(status))
 AND (sqlc.narg(date_from)::timestamptz IS NULL OR created_at >= sqlc.narg(date_from))
 AND (sqlc.narg(date_to)::timestamptz IS NULL OR created_at < sqlc.narg(date_to))
 AND (sqlc.arg(q)::text = '' OR name ILIKE '%' || sqlc.arg(q) || '%' OR email ILIKE '%' || sqlc.arg(q) || '%' OR company ILIKE '%' || sqlc.arg(q) || '%');

-- name: SiteLeadRecipients :many
SELECT DISTINCT m.user_id FROM organization_members m
JOIN organization_member_roles mr ON mr.organization_id = m.organization_id AND mr.member_id = m.id
JOIN role_permissions rp ON rp.role_id = mr.role_id
JOIN permissions p ON p.id = rp.permission_id AND p.slug = 'tenant.site_leads.read'
JOIN users u ON u.id = m.user_id AND u.deleted_at IS NULL
WHERE m.organization_id = sqlc.arg(organization_id);

-- name: SetSiteLeadConsentTokens :exec
-- TEC-1287: the confirmation (single use, expiring) and unsubscribe tokens
-- of a lead that asked for marketing.
UPDATE site_leads SET confirm_token_hash = sqlc.arg(confirm_token_hash), confirm_expires_at = sqlc.arg(confirm_expires_at),
    unsubscribe_token_hash = sqlc.arg(unsubscribe_token_hash)
WHERE organization_id = sqlc.arg(organization_id) AND id = sqlc.arg(id);

-- name: ConfirmSiteLeadMarketing :one
-- Global lookup by the token hash (the token names one lead of one
-- organization); single use: the hash is cleared.
UPDATE site_leads SET marketing_confirmed_at = now(), confirm_token_hash = NULL, confirm_expires_at = NULL
WHERE confirm_token_hash = sqlc.arg(token_hash) AND confirm_expires_at > now() AND unsubscribed_at IS NULL
RETURNING organization_id, uuid, kind;

-- name: UnsubscribeSiteLead :one
-- Global lookup by the token hash; repeating it is harmless.
UPDATE site_leads SET unsubscribed_at = COALESCE(unsubscribed_at, now()), consent_marketing = false,
    confirm_token_hash = NULL, confirm_expires_at = NULL
WHERE unsubscribe_token_hash = sqlc.arg(token_hash)
RETURNING organization_id, uuid, kind;

-- name: SiteLeadRetention :many
-- Organizations with leads older than their retention period.
SELECT DISTINCT l.organization_id, COALESCE(s.lead_retention_months, 24)::int AS retention_months
FROM site_leads l
LEFT JOIN site_settings s ON s.organization_id = l.organization_id
WHERE l.created_at < now() - make_interval(months => COALESCE(s.lead_retention_months, 24));

-- name: DeleteExpiredSiteLeads :execrows
DELETE FROM site_leads
WHERE organization_id = sqlc.arg(organization_id)
  AND created_at < now() - make_interval(months => sqlc.arg(retention_months)::int);

-- name: GetSiteLeadRetention :one
SELECT lead_retention_months FROM site_settings WHERE organization_id = sqlc.arg(organization_id);

-- name: SetSiteLeadRetention :one
UPDATE site_settings SET lead_retention_months = sqlc.arg(lead_retention_months)
WHERE organization_id = sqlc.arg(organization_id)
RETURNING lead_retention_months;
