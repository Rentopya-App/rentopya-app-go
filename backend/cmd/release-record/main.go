// Command release-record writes one app_releases row for the running image.
//
// The `migrate` service (APP_ROLE=migrate in deploy/docker/entrypoint.sh) runs
// it right after `migrate up` on every deploy. It reads the provenance baked
// into this binary (internal/buildinfo: ldflags + embedded release.json) and
// INSERTs a row: an event log, so redeploying the same version adds a row.
//
// Fail-soft by design: provenance must never block a deploy. Any problem
// (no DATABASE_URL, DB unreachable, insert error) is logged as a warning and
// the command exits 0. Dev builds with nothing baked in record version "dev".
package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/buildinfo"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/database/db"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	rel := buildinfo.Current()
	id, err := record(ctx, os.Getenv("DATABASE_URL"), rel)
	if err != nil {
		// Never print DATABASE_URL: it carries the password.
		fmt.Fprintf(os.Stderr, "release-record: WARN not recorded: %v\n", err)
		os.Exit(0)
	}
	sha := rel.GitSHA
	if sha == "" {
		sha = "-"
	}
	fmt.Printf("release-record: recorded %s (sha %s) as app_releases.id=%d\n", rel.Version, sha, id)
}

// record inserts rel into app_releases and returns the new row id.
func record(ctx context.Context, dsn string, rel buildinfo.Release) (int64, error) {
	if dsn == "" {
		return 0, errors.New("DATABASE_URL is not set")
	}
	builtAt := pgtype.Timestamptz{}
	if t, ok := rel.BuiltAtTime(); ok {
		builtAt = pgtype.Timestamptz{Time: t, Valid: true}
	}

	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		// pgx errors can echo the connection string; keep only a generic cause.
		return 0, errors.New("connect: database unreachable or credentials rejected")
	}
	defer func() { _ = conn.Close(context.Background()) }()

	row, err := db.New(conn).InsertAppRelease(ctx, db.InsertAppReleaseParams{
		Version: rel.Version,
		GitSha:  rel.GitSHA,
		BuiltAt: builtAt,
		Notes:   rel.Notes,
	})
	if err != nil {
		return 0, fmt.Errorf("insert: %w", err)
	}
	return row.ID, nil
}
