package usecase

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/auth/model"
	"github.com/google/uuid"
)

const testRestorePrefix = "https://panel.example/platform/restore-account#"

func deactivateWithCode(t *testing.T, e *flowEnv, email string) (userID int64, restoreToken string) {
	t.Helper()
	ctx := context.Background()
	u := e.user(t, email)
	if err := e.uc.RequestAccountDeactivationCode(ctx, u.UUID); err != nil {
		t.Fatal(err)
	}
	if err := e.uc.DeactivateAccount(ctx, u.UUID, e.notif.lastCode(t, "auth.account_deactivation_code"), false); err != nil {
		t.Fatalf("deactivate: %v", err)
	}
	var sent bool
	var vars map[string]string
	for _, n := range e.notif.sent {
		if n.TemplateCode == "auth.account_deactivated" {
			vars = n.TemplateVars
			sent = slices.Contains(n.SecretVars, "restore_url")
		}
	}
	link := vars["restore_url"]
	if !strings.HasPrefix(link, testRestorePrefix) || vars["purge_date"] == "" {
		t.Fatalf("deletion e-mail vars = %v", vars)
	}
	if !sent {
		t.Fatal("the restore link must be marked secret so the stored e-mail drops it")
	}
	return u.ID, strings.TrimPrefix(link, testRestorePrefix)
}

func TestDeactivateRevokesSessionsAndPushAndSchedulesPurge(t *testing.T) {
	e := newFlowEnv(t)
	e.uc.SetAccountRestoreURL(testRestorePrefix)
	now := time.Now().UTC().Truncate(time.Second)
	e.uc.now = func() time.Time { return now }

	id, token := deactivateWithCode(t, e, "ada@example.com")
	got := e.repo.users[id]
	if got.Status != "disabled" || got.DeactivatedAt == nil {
		t.Fatalf("not disabled: %+v", got)
	}
	if got.DeletionDueAt == nil || !got.DeletionDueAt.Equal(now.Add(AccountRestoreWindow)) {
		t.Fatalf("deletion due = %v", got.DeletionDueAt)
	}
	if e.repo.revokedAll[id] == 0 {
		t.Fatal("refresh sessions must be revoked")
	}
	if e.repo.pushDeleted[id] == 0 {
		t.Fatal("push devices must be removed")
	}
	if e.repo.restoreHash[id] == token || e.repo.restoreHash[id] != hashRestoreToken(token) {
		t.Fatal("only the token hash may be stored")
	}
	// Signing in is refused while the deletion is pending.
	if _, err := e.uc.Login(context.Background(), "ada@example.com", "Secret123!", "", model.SessionMeta{}); !errors.Is(err, ErrAccountDeactivated) {
		t.Fatalf("login after deletion: %v", err)
	}
}

func TestDeactivateRestores(t *testing.T) {
	e := newFlowEnv(t)
	e.uc.SetAccountRestoreURL(testRestorePrefix)
	now := time.Now().UTC().Truncate(time.Second)
	e.uc.now = func() time.Time { return now }
	ctx := context.Background()

	id, token := deactivateWithCode(t, e, "ada@example.com")
	if _, err := e.uc.RestoreAccount(ctx, "wrong"); !errors.Is(err, ErrInvalidRestoreLink) {
		t.Fatalf("wrong token: %v", err)
	}
	if _, err := e.uc.RestoreAccount(ctx, "  "); !errors.Is(err, ErrInvalidRestoreLink) {
		t.Fatalf("empty token: %v", err)
	}
	if _, err := e.uc.RestoreAccount(ctx, token); err != nil {
		t.Fatalf("restore: %v", err)
	}
	got := e.repo.users[id]
	if got.Status != "active" || got.DeactivatedAt != nil || got.DeletionDueAt != nil {
		t.Fatalf("not restored: %+v", got)
	}
	if e.notif.count("auth.account_restored") != 1 {
		t.Fatal("restored e-mail missing")
	}
	if _, err := e.uc.RestoreAccount(ctx, token); !errors.Is(err, ErrInvalidRestoreLink) {
		t.Fatalf("token reused: %v", err)
	}
	if _, err := e.uc.Login(ctx, "ada@example.com", "Secret123!", "", model.SessionMeta{}); err != nil {
		t.Fatalf("login after restore: %v", err)
	}
}

func TestRestoreLinkExpiresAndPurgeErases(t *testing.T) {
	e := newFlowEnv(t)
	e.uc.SetAccountRestoreURL(testRestorePrefix)
	now := time.Now().UTC().Truncate(time.Second)
	e.uc.now = func() time.Time { return now }
	ctx := context.Background()

	id, token := deactivateWithCode(t, e, "ada@example.com")
	keep := e.user(t, "grace@example.com")

	// Before the date nothing is erased.
	now = now.Add(AccountRestoreWindow - time.Minute)
	if n, err := e.uc.PurgeDueAccounts(ctx); err != nil || n != 0 {
		t.Fatalf("early purge = %d, %v", n, err)
	}

	now = now.Add(2 * time.Minute)
	if _, err := e.uc.RestoreAccount(ctx, token); !errors.Is(err, ErrInvalidRestoreLink) {
		t.Fatalf("restore after the window: %v", err)
	}
	if n, err := e.uc.PurgeDueAccounts(ctx); err != nil || n != 1 {
		t.Fatalf("purge = %d, %v", n, err)
	}
	got := e.repo.users[id]
	if got.Name != AnonymousUserName || got.Surname != "" || strings.Contains(got.Email, "ada") {
		t.Fatalf("not anonymised: %+v", got)
	}
	if e.repo.purged[keep.ID] {
		t.Fatal("an active account was purged")
	}
	// The last e-mail goes to the old address, unlinked, and forgets it.
	var final bool
	for _, n := range e.notif.sent {
		if n.TemplateCode != "auth.account_deleted" {
			continue
		}
		final = true
		if n.UserID != nil || n.Recipient == nil || *n.Recipient != "ada@example.com" || !n.ForgetRecipient || !slices.Contains(n.SecretVars, "name") {
			t.Fatalf("deleted e-mail = %+v", n)
		}
	}
	if !final {
		t.Fatal("deleted e-mail missing")
	}
	if n, err := e.uc.PurgeDueAccounts(ctx); err != nil || n != 0 {
		t.Fatalf("second purge = %d, %v", n, err)
	}
}

func TestDeactivateRefusedForLastOrganizationOwner(t *testing.T) {
	e := newFlowEnv(t)
	ctx := context.Background()
	u := e.user(t, "owner@example.com")
	e.repo.soleOwned = map[int64][]model.SoleOwnedOrganization{
		u.ID: {{UUID: uuid.New(), Slug: "acme", Name: "Acme Rent"}},
	}
	// No code is sent to a sole owner.
	err := e.uc.RequestAccountDeactivationCode(ctx, u.UUID)
	var owner *LastOrganizationOwnerError
	if !errors.As(err, &owner) || !errors.Is(err, ErrLastOrganizationOwner) || owner.Organizations[0].Slug != "acme" {
		t.Fatalf("request code: %v", err)
	}
	if e.notif.count("auth.account_deactivation_code") != 0 {
		t.Fatal("code sent to a sole owner")
	}
	// A step-up grant does not get around it either.
	if err := e.uc.DeactivateAccount(ctx, u.UUID, "", true); !errors.Is(err, ErrLastOrganizationOwner) {
		t.Fatalf("deactivate: %v", err)
	}
	if got := e.repo.users[u.ID]; got.Status != "active" || got.DeletionDueAt != nil || e.repo.revokedAll[u.ID] != 0 {
		t.Fatalf("account changed: %+v", got)
	}
	// After the hand-over the deletion goes through.
	e.repo.soleOwned = nil
	if err := e.uc.DeactivateAccount(ctx, u.UUID, "", true); err != nil {
		t.Fatalf("deactivate after hand-over: %v", err)
	}
}

func TestFormatPurgeDate(t *testing.T) {
	d := time.Date(2026, 11, 25, 22, 30, 0, 0, time.UTC) // 26 Nov in Istanbul
	if got := formatPurgeDate(d, "tr"); got != "26.11.2026" {
		t.Fatalf("tr = %q", got)
	}
	if got := formatPurgeDate(d, "en"); got != "26 November 2026" {
		t.Fatalf("en = %q", got)
	}
}

// Accounts deactivated before migration 000139 (deactivated_at set, no
// deletion_due_at) were promised their rows are kept: never purged.
func TestPurgeSkipsLegacyDeactivatedAccounts(t *testing.T) {
	e := newFlowEnv(t)
	ctx := context.Background()
	u := e.user(t, "legacy@example.com")
	at := time.Now().UTC().Add(-365 * 24 * time.Hour)
	u.Status, u.DeactivatedAt, u.DeletionDueAt = "disabled", &at, nil
	e.repo.putUser(u)
	e.uc.now = func() time.Time { return time.Now().UTC().Add(10 * 365 * 24 * time.Hour) }
	if n, err := e.uc.PurgeDueAccounts(ctx); err != nil || n != 0 {
		t.Fatalf("purge = %d, %v", n, err)
	}
	if e.repo.purged[u.ID] || e.repo.users[u.ID].Email != "legacy@example.com" {
		t.Fatal("a legacy deactivated account was purged")
	}
}

// Every security e-mail carrying a one-time code marks it secret, so the
// stored notification drops it once delivered.
func TestSecurityCodeEmailsMarkCodeSecret(t *testing.T) {
	e := newFlowEnv(t)
	ctx := context.Background()
	u := e.user(t, "codes@example.com")
	if err := e.uc.RequestLoginCode(ctx, "codes@example.com"); err != nil {
		t.Fatal(err)
	}
	if err := e.uc.ForgotPassword(ctx, "codes@example.com"); err != nil {
		t.Fatal(err)
	}
	if err := e.uc.RequestEmailVerification(ctx, u.UUID, ""); err != nil {
		t.Fatal(err)
	}
	if err := e.uc.RequestAccountDeactivationCode(ctx, u.UUID); err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, n := range e.notif.sent {
		if n.TemplateVars["code"] == "" {
			continue
		}
		seen[n.TemplateCode] = true
		if !slices.Contains(n.SecretVars, "code") {
			t.Errorf("%s: code not marked secret", n.TemplateCode)
		}
	}
	for _, code := range []string{"auth.login_code", "auth.password_reset", "auth.email_verification", "auth.account_deactivation_code"} {
		if !seen[code] {
			t.Errorf("%s not sent", code)
		}
	}
}
