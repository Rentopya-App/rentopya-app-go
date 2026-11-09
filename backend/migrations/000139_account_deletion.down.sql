-- Data-loss note: pending deletion dates and restore links are dropped;
-- deactivated accounts stay deactivated without a purge date. Accounts the
-- worker already anonymised stay anonymised.
DELETE FROM notification_templates WHERE code IN ('auth.account_restored', 'auth.account_deleted');

UPDATE notification_templates
SET subject = 'Hesabınız silindi',
    body = E'Merhaba {{name}},\n\nHesabınız isteğiniz üzerine pasifleştirildi ve tüm oturumlarınız kapatıldı. Artık giriş yapamazsınız.\n\nBu işlemi siz yapmadıysanız lütfen destek ekibiyle iletişime geçin.'
WHERE code = 'auth.account_deactivated' AND channel = 'email' AND language = 'tr';

UPDATE notification_templates
SET subject = 'Your account was deleted',
    body = E'Hello {{name}},\n\nYour account was deactivated at your request and all sessions were signed out. You can no longer sign in.\n\nIf you did not do this, please contact support.'
WHERE code = 'auth.account_deactivated' AND channel = 'email' AND language = 'en';

DROP INDEX IF EXISTS uq_users_restore_token_hash;
DROP INDEX IF EXISTS idx_users_deletion_due;

ALTER TABLE users
    DROP COLUMN IF EXISTS restore_token_hash,
    DROP COLUMN IF EXISTS deletion_due_at;
