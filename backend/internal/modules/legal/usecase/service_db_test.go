package usecase

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/database/db"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TestPatchDBPersistsAndJoinsEditor runs the real SQL inside a rolled-back
// transaction: seeded rows, COALESCE partial update, editor join. Runs with
// TEST_DATABASE_URL.
func TestPatchDBPersistsAndJoinsEditor(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tx.Rollback(ctx) })

	var userID int64
	if err := tx.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, name, surname, status)
		VALUES ('legal-editor@example.test', 'x', 'Legal', 'Editor', 'active')
		RETURNING id`).Scan(&userID); err != nil {
		t.Fatal(err)
	}

	svc := New(db.New(tx))
	seeded, err := svc.Get(ctx, "privacy")
	if err != nil {
		t.Fatalf("seeded privacy page: %v", err)
	}
	if !strings.Contains(seeded.MarkdownTR, "KVKK") || seeded.MarkdownEN == "" {
		t.Fatal("seed content missing")
	}

	body := "## Yeni metin"
	page, err := svc.Patch(ctx, "privacy", &userID, PatchInput{MarkdownTR: &body})
	if err != nil {
		t.Fatalf("Patch: %v", err)
	}
	if page.MarkdownTR != body || page.TitleTR != seeded.TitleTR || page.MarkdownEN != seeded.MarkdownEN {
		t.Fatalf("partial update wrong: %+v", page)
	}
	if page.UpdatedBy == nil || page.UpdatedBy.Name != "Legal Editor" || page.UpdatedBy.Email != "legal-editor@example.test" {
		t.Fatalf("updated_by = %+v", page.UpdatedBy)
	}
	var stored int64
	if err := tx.QueryRow(ctx, `SELECT updated_by FROM legal_pages WHERE slug = 'privacy'`).Scan(&stored); err != nil || stored != userID {
		t.Fatalf("updated_by column = %d (%v), want %d", stored, err, userID)
	}

	if _, err := svc.Patch(ctx, "missing-page", &userID, PatchInput{MarkdownTR: &body}); err != ErrNotFound {
		t.Fatalf("unknown slug: %v", err)
	}

	for _, slug := range []string{"terms", "account-deletion"} {
		page, err := svc.Get(ctx, slug)
		if err != nil {
			t.Fatalf("Get %s: %v", slug, err)
		}
		if page.TitleTR == "" || page.TitleEN == "" || page.MarkdownTR == "" || page.MarkdownEN == "" {
			t.Fatalf("%s seed missing: %+v", slug, page)
		}
		if !strings.Contains(page.MarkdownTR, "contact@rentopya.app") {
			t.Fatalf("%s seed has no contact address", slug)
		}
	}
}
