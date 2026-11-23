package site_test

import (
	"context"
	"crypto/x509"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/database/db"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/site/usecase"
	"github.com/google/uuid"
)

// TEC-1279: TLS counts as active only after the host presented a valid certificate.

func verifiedDomain(now time.Time, provisioner, tls string) db.SiteDomain {
	row := pendingDomain(now)
	row.Status, row.VerifiedAt, row.Provisioner, row.TlsStatus, row.OriginsDirty = "verified", stamp(now), provisioner, tls, false
	return row
}

func TestMarkTLSActiveRequiresCertificate(t *testing.T) {
	ctx := context.Background()
	now := time.Now().UTC()
	row := verifiedDomain(now, "manual", "manual")
	m := &domainMemory{rows: map[uuid.UUID]db.SiteDomain{row.Uuid: row}}
	probe := &fakeTLS{err: errors.Join(usecase.ErrDomainTLSUnverified, errors.New("certificate is not issued by a trusted authority"))}
	d := domainService(m, usecase.DomainOptions{TLSProber: probe, Now: func() time.Time { return now }})

	if _, err := d.MarkTLSActive(ctx, row.Uuid); !errors.Is(err, usecase.ErrDomainTLSUnverified) {
		t.Fatalf("broken certificate accepted: %v", err)
	}
	got := m.rows[row.Uuid]
	if got.TlsStatus != "manual" || !strings.Contains(got.LastError, "trusted authority") || !got.TlsCheckedAt.Valid {
		t.Fatalf("failed check not recorded: %+v", got)
	}

	expires := now.Add(80 * 24 * time.Hour).Truncate(time.Second)
	probe.err, probe.notAfter = nil, expires
	out, err := d.MarkTLSActive(ctx, row.Uuid)
	if err != nil || out.TLSStatus != "active" || out.LastError != "" || out.TLSExpiresAt == nil || !out.TLSExpiresAt.Equal(expires) {
		t.Fatalf("valid certificate: %+v %v", out, err)
	}

	pending := pendingDomain(now)
	m.rows[pending.Uuid] = pending
	calls := probe.calls
	if _, err := d.MarkTLSActive(ctx, pending.Uuid); !errors.Is(err, usecase.ErrDomainMode) || probe.calls != calls {
		t.Fatalf("unverified domain dialed or accepted: %v calls=%d", err, probe.calls-calls)
	}
}

func TestDomainSweepFailsBrokenCertificate(t *testing.T) {
	ctx := context.Background()
	now := time.Now().UTC()
	// A manually activated domain whose route lost its certificate (the live tec-deneme case).
	row := verifiedDomain(now.Add(-48*time.Hour), "manual", "active")
	m := &domainMemory{rows: map[uuid.UUID]db.SiteDomain{row.Uuid: row}}
	probe := &fakeTLS{err: errors.New("TLS certificate check failed: certificate is not issued by a trusted authority")}
	d := domainService(m, usecase.DomainOptions{Resolver: dnsFor(row.Host, row.VerificationToken), TLSProber: probe,
		Now: func() time.Time { return now }, Providers: map[string]usecase.DomainProvisioner{"manual": usecase.ManualProvisioner{}}})
	if _, err := d.Sweep(ctx); err != nil {
		t.Fatal(err)
	}
	got := m.rows[row.Uuid]
	if got.Status != "verified" || got.TlsStatus != "failed" || !strings.Contains(got.LastError, "trusted authority") {
		t.Fatalf("broken certificate still active: %+v", got)
	}
	report, err := d.Collect(ctx, now)
	if err != nil || len(report.Issues) != 1 || report.Issues[0].Severity != "critical" {
		t.Fatalf("health %+v %v", report, err)
	}
}

func TestDomainSweepWaitsForFirstCertificate(t *testing.T) {
	ctx := context.Background()
	now := time.Now().UTC()
	row := pendingDomain(now)
	m := &domainMemory{rows: map[uuid.UUID]db.SiteDomain{row.Uuid: row}}
	probe := &fakeTLS{err: errors.New("TLS certificate check failed: certificate does not cover rent.customer.com")}
	row.Provisioner = "auto"
	m.rows[row.Uuid] = row
	d := domainService(m, usecase.DomainOptions{Resolver: dnsFor(row.Host, row.VerificationToken), TLSProber: probe,
		Now: func() time.Time { return now }, Providers: map[string]usecase.DomainProvisioner{"auto": &stagingProvisioner{}}})

	// First sweep verifies DNS and deploys the route; the certificate is not issued yet.
	if _, err := d.Sweep(ctx); err != nil {
		t.Fatal(err)
	}
	got := m.rows[row.Uuid]
	if got.Status != "verified" || got.TlsStatus != "provisioning" || got.NextCheckAt.Time.Sub(now) != 5*time.Minute {
		t.Fatalf("fresh route should wait for its certificate: %+v", got)
	}

	// Issued five minutes later: active, with the expiry kept.
	now = now.Add(5 * time.Minute)
	probe.err, probe.notAfter = nil, now.Add(89*24*time.Hour)
	if _, err := d.Sweep(ctx); err != nil {
		t.Fatal(err)
	}
	if got = m.rows[row.Uuid]; got.TlsStatus != "active" || !got.TlsExpiresAt.Valid || got.LastError != "" {
		t.Fatalf("issued certificate not recorded: %+v", got)
	}

	// Close to expiry: a warning before it lapses.
	got.TlsExpiresAt = stamp(now.Add(5 * 24 * time.Hour))
	m.rows[row.Uuid] = got
	report, err := d.Collect(ctx, now)
	if err != nil || len(report.Issues) != 1 || report.Issues[0].Severity != "warning" || !strings.Contains(report.Issues[0].Message, "expires") {
		t.Fatalf("expiry warning %+v %v", report, err)
	}

	// A route that never got a certificate within the window fails.
	stale := pendingDomain(now)
	stale.ID, stale.Uuid, stale.Host, stale.Provisioner = 2, uuid.New(), "late.customer.com", "auto"
	stale.CreatedAt = stamp(now.Add(-3 * time.Hour))
	stale.Status, stale.VerifiedAt, stale.TlsStatus = "verified", stamp(now.Add(-2*time.Hour)), "provisioning"
	m.rows[stale.Uuid] = stale
	d = domainService(m, usecase.DomainOptions{Resolver: dnsFor(stale.Host, stale.VerificationToken),
		TLSProber: &fakeTLS{err: errors.New("TLS certificate check failed: timed out")},
		Now:       func() time.Time { return now }, Providers: map[string]usecase.DomainProvisioner{"auto": &stagingProvisioner{}}})
	if _, err := d.Sweep(ctx); err != nil {
		t.Fatal(err)
	}
	if got := m.rows[stale.Uuid]; got.TlsStatus != "failed" {
		t.Fatalf("stale provisioning should fail: %+v", got)
	}
}

func TestNetTLSProber(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	defer srv.Close()
	addr := strings.TrimPrefix(srv.URL, "https://")
	roots := x509.NewCertPool()
	roots.AddCert(srv.Certificate())
	ctx := context.Background()

	// httptest's certificate covers example.com; the system roots do not trust it.
	cases := []struct {
		name, host, want string
		p                usecase.NetTLSProber
	}{
		{"untrusted", "example.com", "trusted authority", usecase.NetTLSProber{Address: addr, AllowPrivate: true, Timeout: 5 * time.Second}},
		{"wrong host", "rent.customer.com", "does not cover rent.customer.com", usecase.NetTLSProber{Address: addr, Roots: roots, AllowPrivate: true, Timeout: 5 * time.Second}},
		{"internal address", "example.com", "non-public", usecase.NetTLSProber{Address: addr, Roots: roots, Timeout: 5 * time.Second}},
	}
	for _, c := range cases {
		_, err := c.p.Probe(ctx, c.host)
		if !errors.Is(err, usecase.ErrDomainTLSUnverified) || !strings.Contains(err.Error(), c.want) {
			t.Fatalf("%s: %v", c.name, err)
		}
	}
	ok, err := usecase.NetTLSProber{Address: addr, Roots: roots, AllowPrivate: true, Timeout: 5 * time.Second}.Probe(ctx, "example.com")
	if err != nil || !ok.NotAfter.Equal(srv.Certificate().NotAfter.UTC()) {
		t.Fatalf("valid certificate: %+v %v", ok, err)
	}
}
