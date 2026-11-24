ALTER TABLE app_settings
    DROP COLUMN IF EXISTS public_leads_per_hour,
    DROP COLUMN IF EXISTS public_reservations_per_hour;
