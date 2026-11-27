-- TEC-1289: preview links can be revoked. The epoch is part of a preview
-- token's signature; raising it invalidates every link issued before.
ALTER TABLE site_settings ADD COLUMN preview_epoch integer NOT NULL DEFAULT 0 CHECK (preview_epoch >= 0);
