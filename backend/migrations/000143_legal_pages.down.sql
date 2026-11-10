-- Data-loss note: drops every legal page, including text edited by the
-- platform admin after the seed.
DELETE FROM role_permissions WHERE permission_id IN (
    SELECT id FROM permissions WHERE slug IN ('platform.legal.read', 'platform.legal.write'));
DELETE FROM permissions WHERE slug IN ('platform.legal.read', 'platform.legal.write');

DROP TABLE IF EXISTS legal_pages;
