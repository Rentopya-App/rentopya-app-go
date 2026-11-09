-- Self-service account deletion becomes real deletion (docs/design/account-deletion.md):
-- a deleted account can be restored for 30 days with the link in the
-- confirmation e-mail, then the worker erases the profile (sign-in methods,
-- sessions, devices, memberships, inbox) and anonymises the users row that
-- rental, contract, finance and audit records still point to.
ALTER TABLE users
    ADD COLUMN deletion_due_at    TIMESTAMPTZ  NULL,
    ADD COLUMN restore_token_hash VARCHAR(128) NULL;

-- Accounts deactivated before this change were promised that their rows are
-- kept and never got a restore link: they keep deletion_due_at = NULL, so the
-- worker never purges them (docs/design/account-deletion.md).

CREATE INDEX idx_users_deletion_due
    ON users (deletion_due_at)
    WHERE deletion_due_at IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX uq_users_restore_token_hash
    ON users (restore_token_hash)
    WHERE restore_token_hash IS NOT NULL;

UPDATE notification_templates
SET subject = 'Hesabınız silinecek',
    body = E'Merhaba {{name}},\n\nHesabınız isteğiniz üzerine kapatıldı ve tüm oturumlarınız sonlandırıldı.\n\nHesap bilgileriniz {{purge_date}} tarihinde kalıcı olarak silinecek. Bu tarihe kadar fikrinizi değiştirirseniz hesabınızı aşağıdaki bağlantıyla geri alabilirsiniz:\n{{restore_url}}\n\nKiralama, sözleşme ve muhasebe kayıtları yasal saklama yükümlülükleri nedeniyle firmalarda kalır; bu kayıtlarda adınız yerine "Silinmiş kullanıcı" görünür.\n\nBu işlemi siz yapmadıysanız bağlantıyla hesabınızı geri alın ve şifrenizi değiştirin.'
WHERE code = 'auth.account_deactivated' AND channel = 'email' AND language = 'tr';

UPDATE notification_templates
SET subject = 'Your account will be deleted',
    body = E'Hello {{name}},\n\nYour account was closed at your request and all sessions were signed out.\n\nYour account details will be permanently deleted on {{purge_date}}. If you change your mind before then, restore your account with this link:\n{{restore_url}}\n\nRental, contract and accounting records stay with the companies because of legal retention duties; they show "Deleted user" instead of your name.\n\nIf you did not do this, restore your account with the link and change your password.'
WHERE code = 'auth.account_deactivated' AND channel = 'email' AND language = 'en';

INSERT INTO notification_templates (code, channel, language, subject, body, active)
VALUES
    ('auth.account_restored', 'email', 'tr', 'Hesabınız geri alındı',
     E'Merhaba {{name}},\n\nHesap silme talebiniz iptal edildi ve hesabınız yeniden açıldı. Artık her zamanki gibi giriş yapabilirsiniz.\n\nBu işlemi siz yapmadıysanız şifrenizi değiştirin ve destek ekibiyle iletişime geçin.', TRUE),
    ('auth.account_restored', 'email', 'en', 'Your account was restored',
     E'Hello {{name}},\n\nYour account deletion request was cancelled and your account is open again. You can sign in as usual.\n\nIf you did not do this, change your password and contact support.', TRUE),
    ('auth.account_deleted', 'email', 'tr', 'Hesabınız kalıcı olarak silindi',
     E'Merhaba {{name}},\n\nHesap silme talebinizin geri alma süresi doldu ve hesap bilgileriniz kalıcı olarak silindi. Bu e-posta adresiyle artık giriş yapılamaz; dilerseniz yeni bir hesap açabilirsiniz.\n\nBu, size bu hesapla ilgili göndereceğimiz son e-postadır.', TRUE),
    ('auth.account_deleted', 'email', 'en', 'Your account was permanently deleted',
     E'Hello {{name}},\n\nThe restore period of your deletion request ended and your account details were permanently deleted. This e-mail address can no longer sign in; you can create a new account if you wish.\n\nThis is the last e-mail we send about this account.', TRUE)
ON CONFLICT (code, channel, language) DO NOTHING;
