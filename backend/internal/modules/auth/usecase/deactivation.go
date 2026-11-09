package usecase

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/auth/model"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/auth/repository"
	notifmodel "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/notifications/model"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/rbac"
	"github.com/google/uuid"
)

// ErrConfirmationRequired: deactivation needs a step-up grant or an email code.
var ErrConfirmationRequired = errors.New("confirmation required")

// RequestAccountDeactivationCode emails a confirmation code to the caller.
// Passwordless users (Apple / Google / email-code only) confirm with it.
func (u *AuthUseCase) RequestAccountDeactivationCode(ctx context.Context, userUUID uuid.UUID) error {
	user, err := u.repo.FindUserByUUID(ctx, userUUID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotFound
		}
		return err
	}
	// Tell a sole owner before any code is sent.
	if err := u.guardSoleOwner(ctx, user.ID); err != nil {
		return err
	}
	if u.isReviewAccount(normalizeEmail(user.Email)) {
		return nil
	}
	return u.sendEmailCode(ctx, user, normalizeEmail(user.Email), otpTypeAccountDeactivation, "auth.account_deactivation_code", nil)
}

// DeactivateAccount is self-service account deletion (App Store 5.1.1(v)).
// The user is disabled at once: every refresh session, push device / browser
// subscription and stored Apple token is revoked. The worker erases the
// account after AccountRestoreWindow (PurgeDueAccounts); the confirmation
// e-mail carries a link that restores it until then
// (docs/design/account-deletion.md).
//
// Refused with ErrLastOrganizationOwner while the user is the only open
// owner of a live organization (ownership is handed over first).
//
// Confirmation: stepUpVerified (recent /v1/auth/step-up/* grant) or a valid
// account-deactivation email code.
func (u *AuthUseCase) DeactivateAccount(ctx context.Context, userUUID uuid.UUID, code string, stepUpVerified bool) error {
	user, err := u.repo.FindUserByUUID(ctx, userUUID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotFound
		}
		return err
	}
	if user.DeactivatedAt != nil {
		return ErrAccountDeactivated
	}
	isSuperAdmin, err := u.repo.UserHasRoleSlug(ctx, user.ID, rbac.RoleSuperAdmin)
	if err != nil {
		return err
	}
	if isSuperAdmin {
		n, err := u.repo.CountUsersWithRole(ctx, rbac.RoleSuperAdmin)
		if err != nil {
			return err
		}
		if n <= 1 {
			return ErrLastSuperAdmin
		}
	}
	if err := u.guardSoleOwner(ctx, user.ID); err != nil {
		return err
	}

	var otpID int64
	code = strings.TrimSpace(code)
	switch {
	case code != "":
		otpID, err = u.checkEmailCode(ctx, normalizeEmail(user.Email), otpTypeAccountDeactivation, code)
		if err != nil {
			return err
		}
	case !stepUpVerified:
		return ErrConfirmationRequired
	}

	restoreToken, restoreHash, err := newRestoreToken()
	if err != nil {
		return err
	}
	dueAt := u.now().UTC().Add(AccountRestoreWindow)
	if _, err := u.repo.DeactivateUser(ctx, user.ID, dueAt, restoreHash); err != nil {
		return err
	}
	if otpID != 0 {
		_ = u.repo.ConsumeOTP(ctx, otpID)
	}
	if err := u.repo.RevokeAllRefresh(ctx, user.ID); err != nil {
		return err
	}
	if err := u.repo.DeleteUserPushTargets(ctx, user.ID); err != nil {
		return err
	}
	u.revokeAppleTokens(ctx, user.ID)
	u.indexUserSearch(ctx, user.UUID.String())
	u.userUpdated(ctx, user.UUID.String())
	if u.notifier != nil {
		uid := user.ID
		email := user.Email
		_, _ = u.notifier.Enqueue(ctx, notifmodel.EnqueueInput{
			UserID: &uid, Channels: []string{notifmodel.ChannelEmail},
			TemplateCode: "auth.account_deactivated", SourceEvent: "auth.account_deactivated",
			SecurityEmail: true, Recipient: &email, Language: user.Locale,
			TemplateVars: map[string]string{
				"name":        user.Name,
				"purge_date":  formatPurgeDate(dueAt, user.Locale),
				"restore_url": u.restoreURL + restoreToken,
			},
			// The restore link is a bearer secret: the stored copy of
			// the e-mail drops it once delivered.
			SecretVars: []string{"restore_url"},
		})
	}
	return nil
}

// revokeAppleTokens revokes every stored Apple refresh token of the user.
// Failures are logged and skipped: deactivation must not depend on Apple.
func (u *AuthUseCase) revokeAppleTokens(ctx context.Context, userID int64) {
	if u.native.Apple == nil || u.box == nil {
		return
	}
	accounts, err := u.repo.ListOAuthAccountsByUserID(ctx, userID)
	if err != nil {
		return
	}
	for _, acc := range accounts {
		if acc.Provider != model.OAuthProviderApple || acc.RefreshTokenEnc == nil || *acc.RefreshTokenEnc == "" {
			continue
		}
		token, err := u.box.Decrypt(*acc.RefreshTokenEnc)
		if err != nil || token == "" {
			continue
		}
		clientID, clientSecret := "", ""
		if acc.ClientID != nil && *acc.ClientID != "" {
			clientID = *acc.ClientID // native: secret is generated from the .p8 key
		} else if u.native.Clients != nil {
			// Web (NextAuth) token: use the web client; prefer a generated
			// secret, fall back to the configured web client secret JWT.
			id, secret, err := u.native.Clients.ClientCredentials(ctx, model.OAuthProviderApple)
			if err == nil {
				clientID = id
				if !u.native.Apple.Configured(ctx) {
					clientSecret = secret
				}
			}
		}
		if clientID == "" || (clientSecret == "" && !u.native.Apple.Configured(ctx)) {
			continue
		}
		rctx, cancel := context.WithTimeout(ctx, 10*time.Second)
		err = u.native.Apple.Revoke(rctx, clientID, clientSecret, token)
		cancel()
		if err != nil {
			if u.log != nil {
				u.log.Warn("apple_token_revoke_failed", "user_id", userID, "error", err)
			}
			continue
		}
		cid := clientID
		if err := u.repo.UpdateOAuthAccountRefreshToken(ctx, acc.ID, nil, &cid); err != nil && u.log != nil {
			u.log.Warn("apple_token_clear_failed", "user_id", userID, "error", err)
		}
	}
}
