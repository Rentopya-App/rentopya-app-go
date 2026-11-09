package main

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/buildinfo"
)

func TestRecordWithoutDSNFailsSoft(t *testing.T) {
	if _, err := record(context.Background(), "", buildinfo.Release{Version: "v0.1"}); err == nil {
		t.Fatal("want an error without DATABASE_URL")
	}
}

func TestRecordUnreachableDoesNotLeakDSN(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	const dsn = "postgres://u:s3cret-pass@127.0.0.1:1/x?sslmode=disable&connect_timeout=1"
	_, err := record(ctx, dsn, buildinfo.Release{Version: "v0.1"})
	if err == nil {
		t.Fatal("want a connect error")
	}
	if got := err.Error(); containsAny(got, "s3cret-pass", "postgres://") {
		t.Fatalf("error leaks the DSN: %q", got)
	}
}

// Needs a migrated TEST_DATABASE_URL (CI backend job). Each deploy is a new
// row: recording the same version twice gives two rows.
func TestRecordInsertsOneRowPerDeploy(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	rel := buildinfo.Release{
		Version: "v0.9999-test",
		GitSHA:  "0123456789abcdef0123456789abcdef01234567",
		BuiltAt: "2026-11-09T10:00:00Z",
		Notes:   "- first (abc1234)\n- second (def5678)",
	}
	id1, err := record(ctx, dsn, rel)
	if err != nil {
		t.Fatalf("record: %v", err)
	}
	id2, err := record(ctx, dsn, rel)
	if err != nil {
		t.Fatalf("record again: %v", err)
	}
	if id1 == id2 {
		t.Fatalf("redeploy must add a row, got id %d twice", id1)
	}

	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close(ctx) }()
	t.Cleanup(func() {
		c, err := pgx.Connect(context.Background(), dsn)
		if err != nil {
			return
		}
		defer func() { _ = c.Close(context.Background()) }()
		_, _ = c.Exec(context.Background(), "DELETE FROM app_releases WHERE id = ANY($1)", []int64{id1, id2})
	})

	var version, sha, notes string
	var builtAt time.Time
	if err := conn.QueryRow(ctx,
		"SELECT version, git_sha, built_at, notes FROM app_releases WHERE id = $1", id2,
	).Scan(&version, &sha, &builtAt, &notes); err != nil {
		t.Fatal(err)
	}
	if version != rel.Version || sha != rel.GitSHA || notes != rel.Notes || !builtAt.Equal(time.Date(2026, 11, 9, 10, 0, 0, 0, time.UTC)) {
		t.Fatalf("row = %q %q %v %q", version, sha, builtAt, notes)
	}

	// A dev build has no build time: built_at stays NULL.
	devID, err := record(ctx, dsn, buildinfo.Release{Version: buildinfo.DevVersion})
	if err != nil {
		t.Fatalf("record dev: %v", err)
	}
	t.Cleanup(func() {
		c, err := pgx.Connect(context.Background(), dsn)
		if err != nil {
			return
		}
		defer func() { _ = c.Close(context.Background()) }()
		_, _ = c.Exec(context.Background(), "DELETE FROM app_releases WHERE id = $1", devID)
	})
	var nullBuilt bool
	if err := conn.QueryRow(ctx, "SELECT built_at IS NULL FROM app_releases WHERE id = $1", devID).Scan(&nullBuilt); err != nil {
		t.Fatal(err)
	}
	if !nullBuilt {
		t.Fatal("dev build must record built_at NULL")
	}
}

func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}
