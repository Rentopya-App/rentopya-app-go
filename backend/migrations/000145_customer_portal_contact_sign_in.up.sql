-- TEC-1283: customers sign in to the portal with only their phone number or
-- e-mail address (no reservation reference). Contact values are plain
-- operational data in customers (customers.md), so the lookup narrows by
-- organization and a normalized form and the use case still compares the
-- keyed hashes in constant time. Phone: the last 10 digits (national number
-- of +90 / 0 / 5… forms); e-mail: lower-cased, trimmed.
CREATE INDEX IF NOT EXISTS idx_customers_portal_phone
    ON customers (organization_id, right(regexp_replace(phone, '[^0-9]', '', 'g'), 10))
    WHERE deleted_at IS NULL AND anonymized_at IS NULL AND phone <> '';
CREATE INDEX IF NOT EXISTS idx_customers_portal_email
    ON customers (organization_id, lower(btrim(email)))
    WHERE deleted_at IS NULL AND anonymized_at IS NULL AND email <> '';
