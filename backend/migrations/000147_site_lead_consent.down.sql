-- Data-loss note: drops marketing confirmations, unsubscribes and the
-- retention setting.
ALTER TABLE site_settings DROP COLUMN IF EXISTS lead_retention_months;
DROP INDEX IF EXISTS idx_site_leads_retention;
DROP INDEX IF EXISTS uq_site_leads_unsubscribe_token;
DROP INDEX IF EXISTS uq_site_leads_confirm_token;
ALTER TABLE site_leads
    DROP COLUMN IF EXISTS unsubscribed_at,
    DROP COLUMN IF EXISTS unsubscribe_token_hash,
    DROP COLUMN IF EXISTS marketing_confirmed_at,
    DROP COLUMN IF EXISTS confirm_expires_at,
    DROP COLUMN IF EXISTS confirm_token_hash;
