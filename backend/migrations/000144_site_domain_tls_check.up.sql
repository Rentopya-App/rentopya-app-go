-- TEC-1279: TLS "active" is proven, not asserted. The API and the worker dial the host with
-- SNI and verify the certificate chain, the name and the validity window; the result and the
-- certificate expiry are kept so the daily check and platform health can warn before expiry.
ALTER TABLE site_domains ADD COLUMN tls_checked_at TIMESTAMPTZ;
ALTER TABLE site_domains ADD COLUMN tls_expires_at TIMESTAMPTZ;
