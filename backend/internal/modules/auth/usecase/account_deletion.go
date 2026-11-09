package usecase

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/auth/model"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/auth/repository"
	notifmodel "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/notifications/model"
)

// Self-service account deletion (docs/design/account-deletion.md).

// AccountRestoreWindow is how long a deleted account can be restored before
// the worker erases it.
const AccountRestoreWindow = 30 * 24 * time.Hour

// purgeBatch bounds one purge run; the next run picks up the rest.
const purgeBatch = 100

// AnonymousUserName replaces the name of an erased account wherever rental,
// contract, finance and audit records still show who acted.
const AnonymousUserName = "Silinmiş kullanıcı"

var (
	// ErrInvalidRestoreLink: the restore token is unknown, used or past its date.
	ErrInvalidRestoreLink = errors.New("invalid or expired restore link")
	// ErrLastOrganizationOwner: the account is the only open owner of an
	// organization; ownership must be handed over before deletion.
	ErrLastOrganizationOwner = errors.New("last organization owner")
)

// LastOrganizationOwnerError lists the organizations that would be left
// without an owner. errors.Is(err, ErrLastOrganizationOwner) holds.
type LastOrganizationOwnerError struct {
	Organizations []model.SoleOwnedOrganization
}

func (e *LastOrganizationOwnerError) Error() string { return ErrLastOrganizationOwner.Error() }

// Unwrap lets errors.Is match ErrLastOrganizationOwner.
func (e *LastOrganizationOwnerError) Unwrap() error { return ErrLastOrganizationOwner }

// SetAccountRestoreURL sets the panel address the restore token is appended
// to in the deletion e-mail, e.g. https://app.example.com/platform/restore-account#.
func (u *AuthUseCase) SetAccountRestoreURL(prefix string) {
	u.restoreURL = prefix
}

// guardSoleOwner refuses deletion while the user is the only open owner of
// a live organization.
func (u *AuthUseCase) guardSoleOwner(ctx context.Context, userID int64) error {
	orgs, err := u.repo.ListOrganizationsSolelyOwnedByUser(ctx, userID)
	if err != nil {
		return err
	}
	if len(orgs) > 0 {
		return &LastOrganizationOwnerError{Organizations: orgs}
	}
	return nil
}

// RestoreAccount reopens a deleted account with the token from the deletion
// e-mail while the restore window is open. The user signs in again as usual.
func (u *AuthUseCase) RestoreAccount(ctx context.Context, token string) (model.User, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return model.User{}, ErrInvalidRestoreLink
	}
	user, err := u.repo.RestoreDeactivatedUser(ctx, hashRestoreToken(token), u.now().UTC())
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return model.User{}, ErrInvalidRestoreLink
		}
		return model.User{}, err
	}
	u.indexUserSearch(ctx, user.UUID.String())
	u.userUpdated(ctx, user.UUID.String())
	if u.notifier != nil {
		uid := user.ID
		email := user.Email
		_, _ = u.notifier.Enqueue(ctx, notifmodel.EnqueueInput{
			UserID: &uid, Channels: []string{notifmodel.ChannelEmail},
			TemplateCode: "auth.account_restored", SourceEvent: "auth.account_restored",
			SecurityEmail: true, Recipient: &email, Language: user.Locale,
			TemplateVars: map[string]string{"name": user.Name},
		})
	}
	return user, nil
}

// PurgeDueAccounts erases every account whose restore window ended (worker,
// hourly) and returns how many it erased. One failing account is logged and
// skipped so it cannot hold back the others.
func (u *AuthUseCase) PurgeDueAccounts(ctx context.Context) (int64, error) {
	now := u.now().UTC()
	due, err := u.repo.ListUsersDueForPurge(ctx, now, purgeBatch)
	if err != nil {
		return 0, err
	}
	var purged int64
	for _, c := range due {
		// The last e-mail goes to the address the account had; read it
		// before the row is anonymised.
		before, err := u.repo.FindUserByID(ctx, c.ID)
		if err != nil && !errors.Is(err, repository.ErrNotFound) {
			if u.log != nil {
				u.log.Error("account_purge_failed", "user_uuid", c.UUID, "error", err)
			}
			continue
		}
		ok, err := u.repo.PurgeUser(ctx, c.ID, AnonymousUserName, now)
		if err != nil {
			if u.log != nil {
				u.log.Error("account_purge_failed", "user_uuid", c.UUID, "error", err)
			}
			continue
		}
		if !ok {
			continue
		}
		purged++
		if u.log != nil {
			u.log.Info("account_purged", "user_uuid", c.UUID)
		}
		u.indexUserSearch(ctx, c.UUID.String())
		u.userUpdated(ctx, c.UUID.String())
		u.notifyAccountDeleted(ctx, before)
	}
	return purged, nil
}

// notifyAccountDeleted sends the "permanently deleted" e-mail. The row is
// not linked to the erased account and keeps neither the address nor the
// name once delivered (SecretVars / ForgetRecipient).
func (u *AuthUseCase) notifyAccountDeleted(ctx context.Context, user model.User) {
	if u.notifier == nil || user.Email == "" {
		return
	}
	email := user.Email
	_, _ = u.notifier.Enqueue(ctx, notifmodel.EnqueueInput{
		Channels:     []string{notifmodel.ChannelEmail},
		TemplateCode: "auth.account_deleted", SourceEvent: "auth.account_deleted",
		SecurityEmail: true, Recipient: &email, Language: user.Locale,
		TemplateVars:    map[string]string{"name": user.Name},
		SecretVars:      []string{"name"},
		ForgetRecipient: true,
	})
}

// newRestoreToken returns a random URL-safe token and the hash stored for it.
func newRestoreToken() (token, hash string, err error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", "", err
	}
	token = base64.RawURLEncoding.EncodeToString(b)
	return token, hashRestoreToken(token), nil
}

func hashRestoreToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// formatPurgeDate writes the purge day in the user's language (Istanbul time).
func formatPurgeDate(t time.Time, locale string) string {
	loc, err := time.LoadLocation("Europe/Istanbul")
	if err != nil {
		loc = time.UTC
	}
	t = t.In(loc)
	if locale == "en" {
		return t.Format("2 January 2006")
	}
	return t.Format("02.01.2006")
}
