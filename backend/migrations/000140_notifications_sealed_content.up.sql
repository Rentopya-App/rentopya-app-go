-- Security e-mails (one-time codes, password reset / verification links,
-- invitation links, account deletion notices) keep their rendered subject,
-- body and action URL encrypted here, only until delivery succeeds. The plain
-- columns hold a redacted stand-in from the first write (title = template
-- code, body = '[redacted]', action_url = NULL).
ALTER TABLE notifications ADD COLUMN sealed_content TEXT NULL;

-- Rows written before this column hold codes and links in plaintext. Unsent
-- ones cannot be sealed from SQL (the key lives in the app), so they are
-- cancelled: codes expire within minutes, invitations and reset links can be
-- requested again. Rows are classified by template code only; e-mails sent
-- without one of these templates carry no secret.
UPDATE notifications
SET status = CASE
        WHEN status IN ('queued', 'processing', 'failed') THEN 'cancelled'
        ELSE status
    END,
    cancelled_at = CASE
        WHEN status IN ('queued', 'processing', 'failed') THEN COALESCE(cancelled_at, NOW())
        ELSE cancelled_at
    END,
    title = template_code,
    body = '[redacted]',
    action_url = NULL,
    recipient = CASE
        WHEN COALESCE((payload->'redact'->>'forget_recipient')::boolean, FALSE) THEN NULL
        ELSE recipient
    END,
    payload = payload - 'redact'
WHERE channel = 'email'
  AND template_code IN (
    'auth.password_reset',
    'auth.email_verification',
    'auth.login_code',
    'auth.oauth_link_code',
    'auth.account_deactivation_code',
    'auth.account_deactivated',
    'auth.account_restored',
    'auth.account_deleted',
    'organizations.invitation'
  );
