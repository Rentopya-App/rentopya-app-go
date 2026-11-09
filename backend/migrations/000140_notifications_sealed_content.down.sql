-- Data-loss note: subjects, bodies and action URLs redacted by the up
-- migration cannot be restored, and undelivered sealed rows are cancelled
-- because the old code would send their redacted stand-in.
UPDATE notifications
SET status = 'cancelled',
    cancelled_at = COALESCE(cancelled_at, NOW())
WHERE sealed_content IS NOT NULL
  AND status IN ('queued', 'processing', 'failed');

ALTER TABLE notifications DROP COLUMN sealed_content;
