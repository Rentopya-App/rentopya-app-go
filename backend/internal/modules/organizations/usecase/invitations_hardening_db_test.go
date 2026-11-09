package usecase

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/database/db"
	branchusecase "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/branches/usecase"
	orgmodel "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/organizations/model"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/organizations/repository"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/orgctx"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TestInvitationHardening covers TEC-1167 against the real schema: a caller
// cannot revoke an invitation above its grant (owner, custom role, other
// branches) by re-inviting the address; removing a member revokes the
// address's open invitations (tenant and platform paths); accepting needs
// the invited account. Runs with TEST_DATABASE_URL.
func TestInvitationHardening(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	q := db.New(pool)
	suffix := uuid.NewString()[:8]
	userIDs := []int64{}
	orgIDs := []int64{}
	t.Cleanup(func() {
		bg := context.Background()
		_, _ = pool.Exec(bg, "DELETE FROM organizations WHERE id = ANY($1)", orgIDs)
		_, _ = pool.Exec(bg, "DELETE FROM users WHERE id = ANY($1)", userIDs)
	})
	newUser := func(name string) db.User {
		u, err := q.CreateUser(ctx, db.CreateUserParams{
			Email: name + "-hard-" + suffix + "@example.test", PasswordHash: "x", Name: name, Surname: "Test", Status: "active",
		})
		if err != nil {
			t.Fatal(err)
		}
		userIDs = append(userIDs, u.ID)
		return u
	}
	owner, admin, clerk, desk, intruder := newUser("owner"), newUser("admin"), newUser("clerk"), newUser("desk"), newUser("intruder")
	repo := repository.NewPostgres(pool, q)
	svc := New(repo, branchusecase.NewOrganizationHooks(nil))
	svc.SetInvalidator(&fakeInvalidator{})
	notifier := &captureNotifier{}
	mgmt := NewManagement(svc, repo, ManagementConfig{FrontendURL: "https://app.example.test"})
	mgmt.SetNotifier(notifier)

	org, err := svc.CreateOrganization(ctx, orgmodel.CreateOrganizationInput{Name: "Sertlestirme " + suffix, OwnerUserID: owner.ID})
	if err != nil {
		t.Fatal(err)
	}
	orgIDs = append(orgIDs, org.ID)
	ownerScope, err := svc.Resolve(ctx, org.Slug, owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	roles, err := svc.ListTenantRoles(ctx, ownerScope)
	if err != nil {
		t.Fatal(err)
	}
	roleUUID := map[string]uuid.UUID{}
	for _, r := range roles {
		roleUUID[r.Key] = r.UUID
	}
	bs, err := mgmt.PlatformBranchOptions(ctx, org.ID)
	if err != nil || len(bs) != 1 {
		t.Fatalf("default branch = %+v err %v", bs, err)
	}
	merkez := bs[0].UUID
	// A custom organization role on top of the templates.
	// tenant.roles.write is held by owners only (not by the admin template).
	custom, err := svc.CreateTenantRole(ctx, ownerScope, orgmodel.TenantRoleInput{
		Name: ptr("Rol yonetimi " + suffix), Permissions: &[]string{"tenant.reservations.read", "tenant.roles.write"},
	})
	if err != nil {
		t.Fatalf("custom role: %v", err)
	}
	for _, m := range []struct {
		user  db.User
		roles []uuid.UUID
		scope string
	}{
		{admin, []uuid.UUID{roleUUID["admin"]}, orgctx.BranchScopeAll},
		{clerk, []uuid.UUID{roleUUID["teslim_iade"], roleUUID["member"]}, orgctx.BranchScopeSelected},
	} {
		in := orgmodel.PlatformMemberInput{UserUUID: m.user.Uuid, RoleUUIDs: &m.roles, BranchScope: ptr(m.scope)}
		if m.scope == orgctx.BranchScopeSelected {
			in.BranchUUIDs = &[]uuid.UUID{merkez}
		}
		if _, err := svc.PlatformAddMember(ctx, org.UUID, in); err != nil {
			t.Fatalf("add member %s: %v", m.user.Email, err)
		}
	}
	adminScope, err := svc.Resolve(ctx, org.Slug, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	ownerActor, adminActor := Actor{UserID: owner.ID, Name: "Owner"}, Actor{UserID: admin.ID, Name: "Admin"}
	invite := func(scope orgctx.Scope, actor Actor, email string, roles []uuid.UUID) (orgmodel.Invitation, error) {
		return mgmt.CreateInvitation(ctx, scope, actor, orgmodel.CreateInvitationInput{
			Email: email, RoleUUIDs: roles, BranchScope: orgctx.BranchScopeAll,
		})
	}
	status := func(id uuid.UUID) string {
		got, err := mgmt.GetInvitation(ctx, org.ID, id)
		if err != nil {
			t.Fatal(err)
		}
		return got.Status
	}

	// 1. An admin cannot replace an owner invitation by re-inviting the address.
	bossEmail := "boss-" + suffix + "@example.test"
	bossInv, err := invite(ownerScope, ownerActor, bossEmail, []uuid.UUID{roleUUID["owner"], roleUUID["admin"]})
	if err != nil {
		t.Fatalf("owner invitation: %v", err)
	}
	bossToken := notifier.lastToken(t)
	if _, err := invite(adminScope, adminActor, bossEmail, []uuid.UUID{roleUUID["member"]}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("admin replaces owner invitation err = %v, want ErrForbidden", err)
	}
	if s := status(bossInv.UUID); s != orgmodel.InvitationPending {
		t.Fatalf("owner invitation status = %q, want pending", s)
	}
	// The owner still can.
	if _, err := invite(ownerScope, ownerActor, bossEmail, []uuid.UUID{roleUUID["member"]}); err != nil {
		t.Fatalf("owner replaces own invitation: %v", err)
	}
	if s := status(bossInv.UUID); s != orgmodel.InvitationRevoked {
		t.Fatalf("replaced owner invitation status = %q", s)
	}
	if _, err := mgmt.AcceptInvitation(ctx, bossToken, intruder.ID); !errors.Is(err, ErrInvitationRevoked) {
		t.Fatalf("replaced token err = %v", err)
	}

	// 2. Multi-role: one role above the admin's grant (a custom role with a
	// permission the admin lacks) is enough to block the replacement.
	kasaEmail := "kasa-" + suffix + "@example.test"
	kasaInv, err := invite(ownerScope, ownerActor, kasaEmail, []uuid.UUID{roleUUID["teslim_iade"], custom.UUID})
	if err != nil {
		t.Fatalf("custom role invitation: %v", err)
	}
	if adminScope.Has("tenant.roles.write") {
		t.Fatal("fixture: the admin template must not hold tenant.roles.write")
	}
	if _, err := invite(adminScope, adminActor, kasaEmail, []uuid.UUID{roleUUID["teslim_iade"]}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("admin replaces custom-role invitation err = %v, want ErrForbidden", err)
	}
	if s := status(kasaInv.UUID); s != orgmodel.InvitationPending {
		t.Fatalf("custom-role invitation status = %q, want pending", s)
	}
	// An admin can replace what it could have granted.
	plainEmail := "plain-" + suffix + "@example.test"
	plainInv, err := invite(ownerScope, ownerActor, plainEmail, []uuid.UUID{roleUUID["teslim_iade"]})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := invite(adminScope, adminActor, plainEmail, []uuid.UUID{roleUUID["member"]}); err != nil {
		t.Fatalf("admin replaces grantable invitation: %v", err)
	}
	if s := status(plainInv.UUID); s != orgmodel.InvitationRevoked {
		t.Fatalf("grantable invitation status = %q", s)
	}

	// 3. Removing a member revokes the address's open invitations (tenant path).
	deskInv, err := invite(ownerScope, ownerActor, desk.Email, []uuid.UUID{roleUUID["admin"]})
	if err != nil {
		t.Fatal(err)
	}
	deskToken := notifier.lastToken(t)
	if _, err := svc.PlatformAddMember(ctx, org.UUID, orgmodel.PlatformMemberInput{
		UserUUID: desk.Uuid, RoleUUIDs: &[]uuid.UUID{roleUUID["member"]}, BranchScope: ptr(orgctx.BranchScopeAll),
	}); err != nil {
		t.Fatal(err)
	}
	if err := svc.RemoveTenantMember(ctx, ownerScope, desk.Uuid); err != nil {
		t.Fatalf("remove tenant member: %v", err)
	}
	if s := status(deskInv.UUID); s != orgmodel.InvitationRevoked {
		t.Fatalf("invitation after member removal = %q, want revoked", s)
	}
	if _, err := mgmt.AcceptInvitation(ctx, deskToken, desk.ID); !errors.Is(err, ErrInvitationRevoked) {
		t.Fatalf("removed member re-joins with old link err = %v", err)
	}
	if _, err := svc.Resolve(ctx, org.Slug, desk.ID); err == nil {
		t.Fatal("removed member still resolves a scope")
	}

	// Platform path (RemoveMember) does the same.
	staff := newUser("staff")
	staffInv, err := invite(ownerScope, ownerActor, staff.Email, []uuid.UUID{roleUUID["admin"]})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.PlatformAddMember(ctx, org.UUID, orgmodel.PlatformMemberInput{
		UserUUID: staff.Uuid, RoleUUIDs: &[]uuid.UUID{roleUUID["member"]}, BranchScope: ptr(orgctx.BranchScopeAll),
	}); err != nil {
		t.Fatal(err)
	}
	if err := svc.RemoveMember(ctx, org.UUID, staff.Uuid); err != nil {
		t.Fatalf("platform remove member: %v", err)
	}
	if s := status(staffInv.UUID); s != orgmodel.InvitationRevoked {
		t.Fatalf("invitation after platform removal = %q, want revoked", s)
	}
	// Removing a member leaves other addresses' invitations alone.
	if s := status(kasaInv.UUID); s != orgmodel.InvitationPending {
		t.Fatalf("unrelated invitation = %q, want pending", s)
	}

	// 4. Invitation hijack: a token only works for the invited account.
	hijackEmail := "victim-" + suffix + "@example.test"
	if _, err := invite(ownerScope, ownerActor, hijackEmail, []uuid.UUID{roleUUID["member"]}); err != nil {
		t.Fatal(err)
	}
	if _, err := mgmt.AcceptInvitation(ctx, notifier.lastToken(t), intruder.ID); !errors.Is(err, ErrInvitationEmailMismatch) {
		t.Fatalf("hijack err = %v, want ErrInvitationEmailMismatch", err)
	}
	if _, err := svc.Resolve(ctx, org.Slug, intruder.ID); err == nil {
		t.Fatal("intruder became a member")
	}
}
