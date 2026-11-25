-- TEC-1282: hourly caps per organization on anonymous public writes (site
-- and API reservations, site leads), set by the platform. A distributed
-- flood that stays under every per-IP and per-session limit still cannot
-- open more than this many reservations or leads per organization per hour.
ALTER TABLE app_settings
    ADD COLUMN public_reservations_per_hour INTEGER NOT NULL DEFAULT 60
        CHECK (public_reservations_per_hour BETWEEN 1 AND 100000),
    ADD COLUMN public_leads_per_hour INTEGER NOT NULL DEFAULT 120
        CHECK (public_leads_per_hour BETWEEN 1 AND 100000);
