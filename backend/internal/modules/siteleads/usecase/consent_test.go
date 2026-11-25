package usecase_test

import (
	"context"
	"errors"
	"os"
	"regexp"
	"strings"
	"testing"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/database/db"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/siteleads/model"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/siteleads/usecase"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/mail"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type captureMail struct{ sent []mail.Message }

func (c *captureMail) Send(_ context.Context, m mail.Message) error {
	c.sent = append(c.sent, m)
	return nil
}

var linkToken = regexp.MustCompile(`\?(confirm|unsubscribe)=([A-Za-z0-9_-]{43})`)

func tokens(t *testing.T, body string) (confirm, unsubscribe string) {
	t.Helper()
	for _, m := range linkToken.FindAllStringSubmatch(body, -1) {
		if m[1] == "confirm" {
			confirm = m[2]
		} else {
			unsubscribe = m[2]
		}
	}
	if confirm == "" || unsubscribe == "" {
		t.Fatalf("links missing in %q", body)
	}
	return confirm, unsubscribe
}

// TEC-1287: a marketing request is pending until the e-mailed link is
// used; the link is single use; unsubscribing withdraws permission; leads
// past the retention period are deleted.
func TestMarketingDoubleOptInAndRetention(t *testing.T) {
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
	q := db.New(pool)
	slug := "leads-" + strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	o, err := q.CreateOrganization(ctx, db.CreateOrganizationParams{Slug: slug, Name: "Org " + slug})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), "DELETE FROM organizations WHERE id = $1", o.ID) })

	mailer := &captureMail{}
	svc := usecase.New(q, strings.Repeat("s", 32))
	svc.SetMailer(mailer)
	email := slug + "@example.com"
	in := model.Input{Kind: "newsletter", Email: email, ConsentKVKK: true, Locale: "tr"}
	if err := svc.Submit(ctx, o.ID, in, "https://site.example", "198.51.100.7", "test"); err != nil {
		t.Fatal(err)
	}
	if len(mailer.sent) != 1 || mailer.sent[0].To[0] != email || !strings.Contains(mailer.sent[0].Body, "https://site.example/abonelik?confirm=") {
		t.Fatalf("confirmation mail: %+v", mailer.sent)
	}
	confirm, unsubscribe := tokens(t, mailer.sent[0].Body)

	lead := func() model.Lead {
		t.Helper()
		leads, _, err := svc.List(ctx, db.ListSiteLeadsParams{OrganizationID: o.ID, PageLimit: 10})
		if err != nil || len(leads) != 1 {
			t.Fatalf("leads: %v %v", leads, err)
		}
		return leads[0]
	}
	if l := lead(); l.MarketingStatus != model.MarketingPending || l.ConsentMarketing {
		t.Fatalf("before confirmation: %s %v", l.MarketingStatus, l.ConsentMarketing)
	}
	if err := svc.Confirm(ctx, confirm); err != nil {
		t.Fatal(err)
	}
	if l := lead(); l.MarketingStatus != model.MarketingConfirmed || !l.ConsentMarketing {
		t.Fatalf("after confirmation: %s %v", l.MarketingStatus, l.ConsentMarketing)
	}
	if err := svc.Confirm(ctx, confirm); !errors.Is(err, usecase.ErrTokenInvalid) {
		t.Fatalf("link reused: %v", err)
	}
	if err := svc.Unsubscribe(ctx, unsubscribe); err != nil {
		t.Fatal(err)
	}
	if err := svc.Unsubscribe(ctx, unsubscribe); err != nil {
		t.Fatalf("repeated unsubscribe: %v", err)
	}
	if l := lead(); l.MarketingStatus != model.MarketingUnsubscribed || l.ConsentMarketing {
		t.Fatalf("after unsubscribe: %s %v", l.MarketingStatus, l.ConsentMarketing)
	}
	if err := svc.Confirm(ctx, strings.Repeat("a", 43)); !errors.Is(err, usecase.ErrTokenInvalid) {
		t.Fatalf("unknown link: %v", err)
	}

	// Without a site the retention cannot be changed; the default applies.
	if s, err := svc.Settings(ctx, o.ID); err != nil || s.RetentionMonths != usecase.DefaultRetentionMonths {
		t.Fatalf("default retention: %+v %v", s, err)
	}
	var ve *usecase.ValidationError
	if _, err := svc.SaveSettings(ctx, o.ID, model.Settings{RetentionMonths: 0}); !errors.As(err, &ve) {
		t.Fatalf("out of range accepted: %v", err)
	}

	// A lead older than the retention period is deleted.
	if _, err := pool.Exec(ctx, "UPDATE site_leads SET created_at = now() - interval '25 months' WHERE organization_id = $1", o.ID); err != nil {
		t.Fatal(err)
	}
	if n, err := svc.PurgeExpired(ctx); err != nil || n < 1 {
		t.Fatalf("purge: %d %v", n, err)
	}
	leads, _, err := svc.List(ctx, db.ListSiteLeadsParams{OrganizationID: o.ID, PageLimit: 10})
	if err != nil || len(leads) != 0 {
		t.Fatalf("expired lead kept: %v %v", leads, err)
	}
}

func TestConsentEmailLanguages(t *testing.T) {
	tr := usecase.ConsentEmail("tr", "ides.rentopya.app", "https://c", "https://u")
	en := usecase.ConsentEmail("en", "ides.rentopya.app", "https://c", "https://u")
	if !strings.Contains(tr.Subject, "onaylayın") || !strings.Contains(en.Subject, "Confirm") {
		t.Fatal(tr.Subject, en.Subject)
	}
	for _, m := range []mail.Message{tr, en} {
		if !strings.Contains(m.Body, "https://c") || !strings.Contains(m.Body, "https://u") {
			t.Fatal(m.Body)
		}
	}
	if usecase.SubscriptionPath("en") != "/subscription" || usecase.SubscriptionPath("tr") != "/abonelik" {
		t.Fatal("subscription paths")
	}
}
