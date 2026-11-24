-- TEC-1287: double opt-in for marketing consent (newsletter, or any form
-- with consent_marketing) and a retention period for site leads.
--
-- A lead that asks for marketing gets a single-use confirmation link
-- (7 days) and an unsubscribe link by e-mail; only a confirmed, not
-- unsubscribed lead counts as marketing permission. Tokens are stored as
-- SHA-256 hashes.
ALTER TABLE site_leads
    ADD COLUMN confirm_token_hash text CHECK (confirm_token_hash ~ '^[0-9a-f]{64}$'),
    ADD COLUMN confirm_expires_at timestamptz,
    ADD COLUMN marketing_confirmed_at timestamptz,
    ADD COLUMN unsubscribe_token_hash text CHECK (unsubscribe_token_hash ~ '^[0-9a-f]{64}$'),
    ADD COLUMN unsubscribed_at timestamptz;

CREATE UNIQUE INDEX uq_site_leads_confirm_token ON site_leads(confirm_token_hash) WHERE confirm_token_hash IS NOT NULL;
CREATE UNIQUE INDEX uq_site_leads_unsubscribe_token ON site_leads(unsubscribe_token_hash) WHERE unsubscribe_token_hash IS NOT NULL;
CREATE INDEX idx_site_leads_retention ON site_leads(organization_id, created_at);

-- Months a site lead is kept before the daily job deletes it (KVKK
-- storage limitation); per organization, default 24.
ALTER TABLE site_settings
    ADD COLUMN lead_retention_months integer NOT NULL DEFAULT 24
        CHECK (lead_retention_months BETWEEN 1 AND 120);
