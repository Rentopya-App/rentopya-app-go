package site_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/database/db"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/site/usecase"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

// TEC-1199: a pending claim must not reserve a host; the first organization to verify wins.
func TestDomainClaimFirstVerifierWinsMemory(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 11, 9, 0, 0, 0, 0, time.UTC)
	a := pendingDomain(now)
	b := pendingDomain(now)
	b.ID, b.OrganizationID, b.VerificationToken = 2, 8, "proof-b"
	m := &domainMemory{rows: map[uuid.UUID]db.SiteDomain{a.Uuid: a, b.Uuid: b}}
	resolver := dnsFor(b.Host, b.VerificationToken)
	removals := &stagingProvisioner{}
	d := domainService(m, usecase.DomainOptions{Resolver: resolver, Now: func() time.Time { return now },
		Providers: map[string]usecase.DomainProvisioner{"manual": removals}})
	if _, err := d.Sweep(ctx); err != nil {
		t.Fatal(err)
	}
	if got := m.rows[b.Uuid]; got.Status != "verified" {
		t.Fatalf("B not verified: %+v", got)
	}
	// A's claim may have been leased in the same batch; its next check fails it.
	now = now.Add(time.Hour)
	if _, err := d.Sweep(ctx); err != nil {
		t.Fatal(err)
	}
	if got := m.rows[a.Uuid]; got.Status != "failed" || got.LastError != usecase.DomainClaimLost {
		t.Fatalf("A claim after B verified: %+v", got)
	}
	if id, err := d.Lookup(ctx, a.Host); err != nil || id != b.OrganizationID {
		t.Fatalf("lookup: %d %v", id, err)
	}
	// A proves the TXT too (both tokens published) on an explicit recheck: the verified index refuses it.
	resolver.txt = []string{a.VerificationToken, b.VerificationToken}
	now = now.Add(time.Hour)
	removals.removes = 0
	if _, err := d.Recheck(ctx, a.OrganizationID, a.Uuid); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Sweep(ctx); err != nil {
		t.Fatal(err)
	}
	lost := m.rows[a.Uuid]
	if lost.Status != "failed" || lost.LastError != usecase.DomainClaimLost {
		t.Fatalf("A claim: %+v", lost)
	}
	if removals.removes != 0 {
		t.Fatalf("losing claim removed the winner's host route %d times", removals.removes)
	}
	if id, err := d.Lookup(ctx, a.Host); err != nil || id != b.OrganizationID {
		t.Fatalf("lookup after rival: %d %v", id, err)
	}
}

func TestDomainClaimsIntegration(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	now := time.Now().UTC()
	host := "claim-" + uuid.NewString() + ".customer.com"
	resolver := dnsFor(host, "")
	base, err := usecase.ParseBaseURL("https://sites.test")
	e.must(err)
	d := usecase.NewDomains(e.q, base, usecase.DomainOptions{TargetHost: "edge.rentopia.com", Resolver: resolver,
		Providers: map[string]usecase.DomainProvisioner{"manual": usecase.ManualProvisioner{}}, Now: func() time.Time { return now }})

	// Two organizations claim the same host: both pending, neither resolves.
	claimA, err := d.Create(ctx, e.a.id, 0, host)
	e.must(err)
	claimB, err := d.Create(ctx, e.b.id, 0, host)
	e.must(err)
	if claimA.Status != "pending" || claimB.Status != "pending" {
		t.Fatalf("claims: %s %s", claimA.Status, claimB.Status)
	}
	if _, err = d.Create(ctx, e.a.id, 0, host); !errors.Is(err, usecase.ErrDomainTaken) {
		t.Fatalf("same organization duplicate: %v", err)
	}
	if _, err = d.Lookup(ctx, host); !errors.Is(err, usecase.ErrNotFound) {
		t.Fatalf("pending claims resolved: %v", err)
	}

	// B proves ownership first; the next sweep fails A's pending claim.
	resolver.txt = []string{claimB.VerificationToken}
	_, err = d.Sweep(ctx)
	e.must(err)
	now = now.Add(2 * time.Minute)
	_, err = d.Sweep(ctx)
	e.must(err)
	gotB, err := d.Get(ctx, e.b.id, claimB.UUID)
	e.must(err)
	gotA, err := d.Get(ctx, e.a.id, claimA.UUID)
	e.must(err)
	if gotB.Status != "verified" || gotA.Status != "failed" || gotA.LastError != usecase.DomainClaimLost {
		t.Fatalf("after B verified: A=%s %q B=%s", gotA.Status, gotA.LastError, gotB.Status)
	}
	if id, err := d.Lookup(ctx, host); err != nil || id != e.b.id {
		t.Fatalf("lookup: %d %v", id, err)
	}
	resolved, err := e.svc.Resolve(ctx, host, "")
	if err == nil && resolved.Organization.Slug == e.a.slug {
		t.Fatal("host resolved to the losing organization")
	}

	// A third organization cannot claim a host verified elsewhere.
	c := e.newOrg("site-c-" + strings.ReplaceAll(uuid.NewString()[:8], "-", ""))
	if _, err = d.Create(ctx, c.id, 0, host); !errors.Is(err, usecase.ErrDomainTaken) {
		t.Fatalf("claim of a verified host: %v", err)
	}

	// Even if A's TXT appears later, the partial unique index keeps one verified row per host.
	resolver.txt = []string{claimA.VerificationToken, claimB.VerificationToken}
	_, err = d.Recheck(ctx, e.a.id, claimA.UUID)
	e.must(err)
	_, err = d.Sweep(ctx)
	e.must(err)
	gotA, err = d.Get(ctx, e.a.id, claimA.UUID)
	e.must(err)
	if gotA.Status != "failed" {
		t.Fatalf("second verification of a host: %+v", gotA)
	}
	var pe *pgconn.PgError
	_, err = e.pool.Exec(ctx, "UPDATE site_domains SET status = 'verified' WHERE uuid = $1 AND organization_id = $2", claimA.UUID, e.a.id)
	if !errors.As(err, &pe) || pe.Code != "23505" {
		t.Fatalf("verified host uniqueness not enforced: %v", err)
	}
}

func TestDomainClaimExpiryIntegration(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	now := time.Now().UTC().Add(-2 * usecase.DomainClaimTTL)
	host := "expire-" + uuid.NewString() + ".customer.com"
	resolver := dnsFor(host, "")
	base, err := usecase.ParseBaseURL("https://sites.test")
	e.must(err)
	d := usecase.NewDomains(e.q, base, usecase.DomainOptions{TargetHost: "edge.rentopia.com", Resolver: resolver,
		Providers: map[string]usecase.DomainProvisioner{"manual": usecase.ManualProvisioner{}}, Now: func() time.Time { return now }})
	squat, err := d.Create(ctx, e.a.id, 0, host)
	e.must(err)
	// The squatter publishes DNS only after the claim expired: it never verifies.
	now = now.Add(usecase.DomainClaimTTL)
	resolver.txt = []string{squat.VerificationToken}
	_, err = d.Sweep(ctx)
	e.must(err)
	expired, err := d.Get(ctx, e.a.id, squat.UUID)
	e.must(err)
	if expired.Status != "failed" || !strings.Contains(expired.LastError, "72 hours") {
		t.Fatalf("expired claim: %+v", expired)
	}
	if _, err = d.Lookup(ctx, host); !errors.Is(err, usecase.ErrNotFound) {
		t.Fatalf("expired claim resolved: %v", err)
	}
	// The expired claim neither blocks nor competes with the real owner.
	owner, err := d.Create(ctx, e.b.id, 0, host)
	e.must(err)
	resolver.txt = []string{owner.VerificationToken}
	_, err = d.Sweep(ctx)
	e.must(err)
	if id, err := d.Lookup(ctx, host); err != nil || id != e.b.id {
		t.Fatalf("owner lookup: %d %v", id, err)
	}
}
