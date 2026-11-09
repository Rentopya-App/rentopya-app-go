package repository_test

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/database/db"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/auth/repository"
	orgmodel "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/organizations/model"
	orgrepository "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/organizations/repository"
	orgusecase "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/organizations/usecase"
)

func testPool(t *testing.T) (*pgxpool.Pool, *db.Queries) {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool, db.New(pool)
}

// TestAccountDeletionLifecycle (docs/design/account-deletion.md): the sole
// owner guard, push revocation, restore before the date, and the purge that
// removes sign-in data, devices, inbox and memberships while rental /
// finance / audit rows keep pointing to the anonymised users row.
// Runs when TEST_DATABASE_URL points at a migrated database.
func TestAccountDeletionLifecycle(t *testing.T) {
	pool, q := testPool(t)
	ctx := context.Background()
	repo := repository.NewPostgres(pool, q)
	suffix := uuid.NewString()[:8]
	newUser := func(name string) db.User {
		u, err := q.CreateUser(ctx, db.CreateUserParams{
			Email: name + "-" + suffix + "@example.test", PasswordHash: "x", Name: name, Surname: "Test", Status: "active",
		})
		if err != nil {
			t.Fatal(err)
		}
		return u
	}
	owner, bob, ada, legacy := newUser("owner"), newUser("bob"), newUser("ada"), newUser("legacy")
	orgSvc := orgusecase.New(orgrepository.NewPostgres(pool, q), nil)
	org, err := orgSvc.CreateOrganization(ctx, orgmodel.CreateOrganizationInput{Name: "Purge " + suffix, OwnerUserID: owner.ID})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		bg := context.Background()
		_, _ = pool.Exec(bg, "DELETE FROM activity_events WHERE organization_id = $1", org.ID)
		_, _ = pool.Exec(bg, "DELETE FROM organizations WHERE id = $1", org.ID)
		_, _ = pool.Exec(bg, "DELETE FROM users WHERE id = ANY($1)", []int64{owner.ID, bob.ID, ada.ID, legacy.ID})
	})
	if _, err := orgSvc.AddMember(ctx, org.UUID, ada.Uuid, "member"); err != nil {
		t.Fatal(err)
	}
	mustExec := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	count := func(sql string, args ...any) int {
		t.Helper()
		var n int
		if err := pool.QueryRow(ctx, sql, args...).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	now := time.Now().UTC()
	due := now.Add(time.Hour)

	// Sole owner: listed; a second open owner lifts it; a second owner
	// whose own deletion is pending does not count.
	sole := func(userID int64) int {
		t.Helper()
		orgs, err := repo.ListOrganizationsSolelyOwnedByUser(ctx, userID)
		if err != nil {
			t.Fatal(err)
		}
		return len(orgs)
	}
	if sole(owner.ID) != 1 {
		t.Fatal("the only owner must be listed")
	}
	if sole(ada.ID) != 0 {
		t.Fatal("a member is not an owner")
	}
	if _, err := orgSvc.AddMember(ctx, org.UUID, bob.Uuid, "owner"); err != nil {
		t.Fatal(err)
	}
	if sole(owner.ID) != 0 {
		t.Fatal("a second owner lifts the guard")
	}
	if _, err := repo.DeactivateUser(ctx, bob.ID, due, "bob-"+suffix); err != nil {
		t.Fatal(err)
	}
	if sole(owner.ID) != 1 {
		t.Fatal("an owner pending deletion does not count")
	}

	// Ada's account data and a business record she created.
	mustExec("INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 day')", ada.ID, "h-"+suffix)
	mustExec("INSERT INTO push_devices (user_id, token, platform) VALUES ($1, $2, 'ios')", ada.ID, "ExponentPushToken["+suffix+"]")
	mustExec("INSERT INTO oauth_accounts (user_id, provider, provider_account_id) VALUES ($1, 'apple', $2)", ada.ID, "apple-"+suffix)
	mustExec("INSERT INTO webauthn_credentials (user_id, public_key, credential_id) VALUES ($1, 'pk', $2)", ada.ID, "cred-"+suffix)
	mustExec("INSERT INTO user_totp (user_id, secret_enc) VALUES ($1, 'enc')", ada.ID)
	mustExec("INSERT INTO notifications (user_id, channel, recipient) VALUES ($1, 'email', $2)", ada.ID, ada.Email)
	mustExec(`INSERT INTO customers (organization_id, customer_type, first_name, last_name, created_by)
	          VALUES ($1, 'individual', 'Kiracı', 'Test', $2)`, org.ID, ada.ID)
	mustExec("INSERT INTO activity_events (organization_id, actor_user_id, action) VALUES ($1, $2, 'rental.created')", org.ID, ada.ID)

	if err := repo.DeleteUserPushTargets(ctx, ada.ID); err != nil {
		t.Fatal(err)
	}
	if n := count("SELECT COUNT(*) FROM push_devices WHERE user_id = $1", ada.ID); n != 0 {
		t.Fatalf("push devices left: %d", n)
	}

	if _, err := repo.DeactivateUser(ctx, ada.ID, due, "restore-"+suffix); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.RestoreDeactivatedUser(ctx, "wrong-"+suffix, now); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("wrong hash: %v", err)
	}
	if _, err := repo.RestoreDeactivatedUser(ctx, "restore-"+suffix, due.Add(time.Minute)); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("restore after the date: %v", err)
	}
	restored, err := repo.RestoreDeactivatedUser(ctx, "restore-"+suffix, now)
	if err != nil || restored.Status != "active" || restored.DeletionDueAt != nil || restored.DeactivatedAt != nil {
		t.Fatalf("restore = %+v, %v", restored, err)
	}

	if _, err := repo.DeactivateUser(ctx, ada.ID, due, "restore2-"+suffix); err != nil {
		t.Fatal(err)
	}
	listed, err := repo.ListUsersDueForPurge(ctx, now, 1000)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range listed {
		if c.ID == ada.ID {
			t.Fatal("listed before the date")
		}
	}
	// Deactivated before migration 000139 (no deletion_due_at): never listed.
	mustExec("UPDATE users SET status = 'disabled', deactivated_at = NOW() - INTERVAL '1 year' WHERE id = $1", legacy.ID)
	listed, err = repo.ListUsersDueForPurge(ctx, due.Add(100*365*24*time.Hour), 100000)
	if err != nil {
		t.Fatal(err)
	}
	var found bool
	for _, c := range listed {
		found = found || c.ID == ada.ID
		if c.ID == legacy.ID {
			t.Fatal("a legacy deactivated account (no deletion date) must never be purged")
		}
	}
	if !found {
		t.Fatal("due account not listed")
	}

	ok, err := repo.PurgeUser(ctx, ada.ID, "Silinmiş kullanıcı", due)
	if err != nil || !ok {
		t.Fatalf("purge = %v, %v", ok, err)
	}
	var email, name, surname, status, hash string
	var deleted, verified, restoreLeft bool
	if err := pool.QueryRow(ctx, `SELECT email, name, surname, status, password_hash, deleted_at IS NOT NULL,
	        email_verified_at IS NOT NULL, restore_token_hash IS NOT NULL FROM users WHERE id = $1`, ada.ID).
		Scan(&email, &name, &surname, &status, &hash, &deleted, &verified, &restoreLeft); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(email, "ada") || name != "Silinmiş kullanıcı" || surname != "" || status != "disabled" ||
		hash != "" || !deleted || verified || restoreLeft {
		t.Fatalf("not anonymised: %s %s %s %s %v", email, name, surname, status, deleted)
	}
	if _, err := repo.FindUserByEmail(ctx, ada.Email); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("the old address must not find the row: %v", err)
	}
	for table, n := range map[string]int{
		"refresh_tokens":       count("SELECT COUNT(*) FROM refresh_tokens WHERE user_id = $1", ada.ID),
		"oauth_accounts":       count("SELECT COUNT(*) FROM oauth_accounts WHERE user_id = $1", ada.ID),
		"webauthn_credentials": count("SELECT COUNT(*) FROM webauthn_credentials WHERE user_id = $1", ada.ID),
		"user_totp":            count("SELECT COUNT(*) FROM user_totp WHERE user_id = $1", ada.ID),
		"notifications":        count("SELECT COUNT(*) FROM notifications WHERE user_id = $1", ada.ID),
		"organization_members": count("SELECT COUNT(*) FROM organization_members WHERE organization_id = $1 AND user_id = $2", org.ID, ada.ID),
	} {
		if n != 0 {
			t.Errorf("%s: %d rows left", table, n)
		}
	}
	// Business and audit rows stay, pointing at the anonymised row.
	if n := count("SELECT COUNT(*) FROM customers WHERE organization_id = $1 AND created_by = $2", org.ID, ada.ID); n != 1 {
		t.Errorf("customer created_by must still reference the anonymised user, got %d", n)
	}
	if n := count("SELECT COUNT(*) FROM activity_events WHERE organization_id = $1 AND actor_user_id = $2", org.ID, ada.ID); n != 1 {
		t.Errorf("activity actor must still reference the anonymised user, got %d", n)
	}
	if n := count("SELECT COUNT(*) FROM organization_members WHERE organization_id = $1 AND user_id = $2", org.ID, owner.ID); n != 1 {
		t.Error("the owner's membership must stay")
	}
	if ok, err := repo.PurgeUser(ctx, ada.ID, "Silinmiş kullanıcı", due); err != nil || ok {
		t.Fatalf("second purge = %v, %v", ok, err)
	}
	// A new account may use the freed address.
	if _, err := q.CreateUser(ctx, db.CreateUserParams{
		Email: ada.Email, PasswordHash: "x", Name: "ada", Surname: "New", Status: "active",
	}); err != nil {
		t.Fatalf("address not freed: %v", err)
	} else {
		t.Cleanup(func() { _, _ = pool.Exec(context.Background(), "DELETE FROM users WHERE email = $1", ada.Email) })
	}
}

// TestRedactNotification: the stored copy of a security e-mail drops its
// secrets and, when asked, its recipient once final.
func TestRedactNotification(t *testing.T) {
	pool, q := testPool(t)
	ctx := context.Background()
	var id int64
	if err := pool.QueryRow(ctx, `INSERT INTO notifications (channel, recipient, title, body, payload)
	        VALUES ('email', 'gone@example.test', 'Hi Ada', 'Restore: https://x/#SECRET',
	                '{"keep":1,"redact":{"title":"Hi […]","body":"Restore: […]","forget_recipient":true}}')
	        RETURNING id`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), "DELETE FROM notifications WHERE id = $1", id) })
	if err := q.RedactNotification(ctx, id); err != nil {
		t.Fatal(err)
	}
	row, err := q.GetNotificationByID(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(row.Body, "SECRET") || row.Title != "Hi […]" || row.Recipient.Valid ||
		strings.Contains(string(row.Payload), "redact") || !strings.Contains(string(row.Payload), "keep") {
		t.Fatalf("not redacted: %+v payload=%s", row, row.Payload)
	}
	// Ordinary rows are untouched.
	if err := q.RedactNotification(ctx, id); err != nil {
		t.Fatal(err)
	}
}
