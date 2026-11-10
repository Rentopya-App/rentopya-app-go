-- Restoring the global host constraint keeps, per host, the verified row or else the oldest claim.
DELETE FROM site_domains d WHERE EXISTS (
    SELECT 1 FROM site_domains o WHERE o.host = d.host AND o.id <> d.id
      AND (o.status = 'verified' OR (d.status <> 'verified' AND o.id < d.id))
);
DROP INDEX IF EXISTS idx_site_domains_host;
DROP INDEX IF EXISTS uq_site_domains_verified_host;
ALTER TABLE site_domains DROP CONSTRAINT IF EXISTS uq_site_domains_org_host;
ALTER TABLE site_domains ADD CONSTRAINT site_domains_host_key UNIQUE (host);
