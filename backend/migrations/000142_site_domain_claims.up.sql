-- TEC-1199: a host is reserved only by a verified domain. Several organizations may hold
-- pending claims for the same host; the first to prove DNS ownership wins and the
-- verification sweep fails the other pending claims. Each organization keeps at most
-- one row per host.
ALTER TABLE site_domains DROP CONSTRAINT site_domains_host_key;
ALTER TABLE site_domains ADD CONSTRAINT uq_site_domains_org_host UNIQUE (organization_id, host);
CREATE UNIQUE INDEX uq_site_domains_verified_host ON site_domains(host) WHERE status = 'verified';
CREATE INDEX idx_site_domains_host ON site_domains(host);
