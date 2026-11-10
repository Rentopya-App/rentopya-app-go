package usecase

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"testing"
	"time"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/database/db"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/orgctx"
)

func TestInvitationTokenAndHash(t *testing.T) {
	a, err := NewInvitationToken()
	if err != nil {
		t.Fatal(err)
	}
	b, _ := NewInvitationToken()
	if len(a) != 43 || a == b {
		t.Fatalf("tokens %q %q: want 32 random bytes in base64url", a, b)
	}
	sum := sha256.Sum256([]byte(a))
	if got := HashInvitationToken(a); got != hex.EncodeToString(sum[:]) || len(got) != 64 {
		t.Fatalf("hash = %q", got)
	}
	if HashInvitationToken(" "+a+"\n") != HashInvitationToken(a) {
		t.Fatal("hash must ignore surrounding whitespace from copied links")
	}
}

func TestMaskEmail(t *testing.T) {
	cases := map[string]string{
		"ayse.kaya@example.com": "a********@e******.com",
		"a@b.co":                "*@*.co",
		"ömer@şirket.com.tr":    "ö***@ş*********.tr",
		"broken":                "***",
	}
	for in, want := range cases {
		if got := MaskEmail(in); got != want {
			t.Errorf("MaskEmail(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestNormalizeEmail(t *testing.T) {
	if v, ok := normalizeEmail("  Ayse@Example.COM "); !ok || v != "ayse@example.com" {
		t.Fatalf("normalize = %q %v", v, ok)
	}
	for _, bad := range []string{"", "no-at", "Ayşe <a@b.co>", "a@b.co, c@d.co"} {
		if _, ok := normalizeEmail(bad); ok {
			t.Errorf("%q must be rejected", bad)
		}
	}
}

// fakeOpenInvitations serves the open invitations of one address for the
// re-invite guard; every other ManagementRepository method is unused.
type fakeOpenInvitations struct {
	ManagementRepository
	open     []db.LockOpenInvitationsForEmailRow
	roles    map[int64][]db.ListInvitationRolesRow
	branches map[int64][]db.ListInvitationBranchesRow
}

func (f *fakeOpenInvitations) LockOpenInvitationsForEmail(context.Context, *db.Queries, int64, string) ([]db.LockOpenInvitationsForEmailRow, error) {
	return f.open, nil
}

func (f *fakeOpenInvitations) ListInvitationRoles(_ context.Context, _ *db.Queries, _ int64, ids []int64) ([]db.ListInvitationRolesRow, error) {
	var out []db.ListInvitationRolesRow
	for _, id := range ids {
		out = append(out, f.roles[id]...)
	}
	return out, nil
}

func (f *fakeOpenInvitations) ListInvitationBranches(_ context.Context, _ *db.Queries, _ int64, ids []int64) ([]db.ListInvitationBranchesRow, error) {
	var out []db.ListInvitationBranchesRow
	for _, id := range ids {
		out = append(out, f.branches[id]...)
	}
	return out, nil
}

// TestReinviteGuardIsMultiRoleAware: re-inviting an address revokes its open
// invitation, so the caller must be able to grant every role and branch of
// that invitation (TEC-1167).
func TestReinviteGuardIsMultiRoleAware(t *testing.T) {
	t.Parallel()
	const (
		ownerRole  = 1
		customRole = 50
		deskRole   = 51
	)
	f := newFakeRepo(time.Now())
	f.rolePerms = map[int64][]string{
		customRole: {"tenant.payment.refund", "tenant.reservation.view"},
		deskRole:   {"tenant.reservation.view"},
	}
	inv := &fakeOpenInvitations{
		roles: map[int64][]db.ListInvitationRolesRow{
			// owner template role plus a desk role
			1: {{InvitationID: 1, ID: ownerRole, Slug: orgctx.RoleOwner, IsTemplate: true}, {InvitationID: 1, ID: deskRole, Slug: "desk"}},
			// custom organization role with a permission admins lack
			2: {{InvitationID: 2, ID: deskRole, Slug: "desk"}, {InvitationID: 2, ID: customRole, Slug: "kasa"}},
			// desk role only, selected branch 7
			3: {{InvitationID: 3, ID: deskRole, Slug: "desk"}},
		},
		branches: map[int64][]db.ListInvitationBranchesRow{3: {{InvitationID: 3, ID: 7}}},
	}
	m := NewManagement(New(f, nil), inv, ManagementConfig{})
	ctx := context.Background()
	admin := orgctx.Scope{ID: 1, MemberRole: "admin", MemberRoles: []string{"admin"}, Permissions: []string{"tenant.reservation.view"}}
	owner := orgctx.Scope{ID: 1, MemberRole: orgctx.RoleOwner, MemberRoles: []string{"admin", orgctx.RoleOwner}}
	branch8 := admin
	branch8.BranchIDs = []int64{8}
	branch7 := admin
	branch7.BranchIDs = []int64{7}

	cases := []struct {
		name  string
		scope orgctx.Scope
		open  []db.LockOpenInvitationsForEmailRow
		deny  bool
	}{
		{"admin cannot replace owner invitation", admin, []db.LockOpenInvitationsForEmailRow{{ID: 1, BranchScope: orgctx.BranchScopeAll}}, true},
		{"admin cannot replace custom role above it", admin, []db.LockOpenInvitationsForEmailRow{{ID: 2, BranchScope: orgctx.BranchScopeAll}}, true},
		{"one forbidden invitation among several", admin, []db.LockOpenInvitationsForEmailRow{{ID: 3, BranchScope: orgctx.BranchScopeAll}, {ID: 1, BranchScope: orgctx.BranchScopeAll}}, true},
		{"admin replaces grantable invitation", admin, []db.LockOpenInvitationsForEmailRow{{ID: 3, BranchScope: orgctx.BranchScopeSelected}}, false},
		{"owner (among several roles) replaces owner invitation", owner, []db.LockOpenInvitationsForEmailRow{{ID: 1, BranchScope: orgctx.BranchScopeAll}, {ID: 2, BranchScope: orgctx.BranchScopeAll}}, false},
		{"branch-scoped caller cannot replace all-branch invitation", branch7, []db.LockOpenInvitationsForEmailRow{{ID: 3, BranchScope: orgctx.BranchScopeAll}}, true},
		{"branch-scoped caller cannot replace other branch", branch8, []db.LockOpenInvitationsForEmailRow{{ID: 3, BranchScope: orgctx.BranchScopeSelected}}, true},
		{"branch-scoped caller replaces own branch", branch7, []db.LockOpenInvitationsForEmailRow{{ID: 3, BranchScope: orgctx.BranchScopeSelected}}, false},
		{"no open invitation", admin, nil, false},
	}
	for _, tc := range cases {
		inv.open = tc.open
		err := m.guardReplacedInvitations(ctx, nil, tc.scope, "x@example.test")
		if tc.deny != errors.Is(err, ErrForbidden) || (!tc.deny && err != nil) {
			t.Errorf("%s: err = %v, deny = %v", tc.name, err, tc.deny)
		}
	}
}
