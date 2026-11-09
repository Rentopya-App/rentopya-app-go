package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/database/db"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/notifications/model"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/notifications/providers"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/crypto"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgtype"
)

// noopEnqueuer accepts delivery tasks without running them.
type noopEnqueuer struct{}

func (noopEnqueuer) Enqueue(*asynq.Task, ...asynq.Option) (*asynq.TaskInfo, error) {
	return &asynq.TaskInfo{}, nil
}

func testSealer(t *testing.T) *crypto.Sealer {
	t.Helper()
	fc, err := crypto.NewFieldCipher("0123456789abcdef0123456789abcdef")
	if err != nil {
		t.Fatal(err)
	}
	s, err := fc.Sealer(SealPurpose)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

// captureProvider records what a provider was handed.
type captureProvider struct {
	channel string
	got     []db.Notification
}

func (c *captureProvider) Channel() string { return c.channel }

func (c *captureProvider) Deliver(_ context.Context, n db.Notification, _ *uuid.UUID) (providers.DeliveryResult, error) {
	c.got = append(c.got, n)
	return providers.DeliveryResult{Status: model.StatusSent, Provider: "capture"}, nil
}

// ownedQuerier answers GetNotificationByUUID with row.
type ownedQuerier struct {
	deliverTestQuerier
}

func (o *ownedQuerier) GetNotificationByUUID(context.Context, uuid.UUID) (db.Notification, error) {
	return o.row, nil
}

const secretCode = "482913"

func codeEmail(uid int64) model.EnqueueInput {
	to := "ada@example.com"
	link := "https://app.example/verify?token=SECRETLINK"
	return model.EnqueueInput{
		UserID: &uid, Channels: []string{model.ChannelEmail},
		TemplateCode: "auth.email_verification", SecurityEmail: true,
		Recipient: &to, ActionURL: &link,
		TemplateVars: map[string]string{"name": "Ada", "code": secretCode},
		SecretVars:   []string{"code"},
	}
}

// A security e-mail never stores its code, subject or link in plaintext:
// title / body / action_url are redacted from the first write and the
// content lives only in sealed_content.
func TestSecurityEmailIsSealedOnTheRow(t *testing.T) {
	t.Parallel()

	q := &deliverTestQuerier{}
	q.template = db.NotificationTemplate{Code: "auth.email_verification", Subject: "Kod {{code}}", Body: "Merhaba {{name}}, kodun {{code}}"}
	svc := New(q, &noopEnqueuer{}, nil, slog.Default()).WithSealer(testSealer(t))
	if _, err := svc.Enqueue(context.Background(), codeEmail(7)); err != nil {
		t.Fatalf("Enqueue: %v", err)
	}
	if len(q.created) != 1 {
		t.Fatalf("created = %d", len(q.created))
	}
	row := q.created[0]
	if row.Title != "auth.email_verification" || row.Body != RedactedBody || row.ActionUrl.Valid {
		t.Fatalf("plain columns = %q / %q / %v", row.Title, row.Body, row.ActionUrl)
	}
	if !row.SealedContent.Valid || row.SealedContent.String == "" {
		t.Fatal("sealed_content missing")
	}
	plain := row
	plain.SealedContent = pgtype.Text{}
	raw, _ := json.Marshal(plain)
	for _, secret := range []string{secretCode, "SECRETLINK"} {
		if strings.Contains(string(raw), secret) || strings.Contains(row.SealedContent.String, secret) {
			t.Fatalf("secret %q stored in plaintext: %s", secret, raw)
		}
	}
	if strings.Contains(string(row.Payload), "redact") {
		t.Fatalf("sealed row needs no SecretVars copy: %s", row.Payload)
	}
}

// Delivery (first try, retry or reclaim) opens the sealed content in memory
// and hands the provider the real subject, body and link.
func TestSealedContentRoundTripsForDelivery(t *testing.T) {
	t.Parallel()

	q := &deliverTestQuerier{}
	q.template = db.NotificationTemplate{Code: "auth.email_verification", Subject: "Kod {{code}}", Body: "Merhaba {{name}}, kodun {{code}}"}
	capture := &captureProvider{channel: model.ChannelEmail}
	svc := New(q, &noopEnqueuer{}, []providers.Provider{capture}, slog.Default()).WithSealer(testSealer(t))
	if _, err := svc.Enqueue(context.Background(), codeEmail(7)); err != nil {
		t.Fatal(err)
	}
	p := q.created[0]
	q.row = db.Notification{
		ID: 3, Channel: p.Channel, Status: model.StatusQueued, Title: p.Title, Body: p.Body,
		TemplateCode: p.TemplateCode, Recipient: p.Recipient, SealedContent: p.SealedContent,
		AttemptCount: 1, MaxAttempts: 5,
	}
	for i := 0; i < 2; i++ { // a retry opens the same ciphertext again
		if err := svc.Deliver(context.Background(), 3); err != nil {
			t.Fatalf("Deliver: %v", err)
		}
	}
	if len(capture.got) != 2 {
		t.Fatalf("deliveries = %d", len(capture.got))
	}
	got := capture.got[0]
	if got.Title != "Kod "+secretCode || got.Body != "Merhaba Ada, kodun "+secretCode ||
		got.ActionUrl.String != "https://app.example/verify?token=SECRETLINK" || got.SealedContent.Valid {
		t.Fatalf("provider got %q / %q / %q", got.Title, got.Body, got.ActionUrl.String)
	}
	if q.row.Title != "auth.email_verification" || q.row.Body != RedactedBody {
		t.Fatalf("delivery leaked the plaintext into the row: %q / %q", q.row.Title, q.row.Body)
	}
}

// A ciphertext does not open for another template (AAD) and a row whose
// content cannot be opened fails instead of sending the redacted stand-in.
func TestSealedContentBoundToTemplate(t *testing.T) {
	t.Parallel()

	q := &deliverTestQuerier{}
	capture := &captureProvider{channel: model.ChannelEmail}
	svc := New(q, &noopEnqueuer{}, []providers.Provider{capture}, slog.Default()).WithSealer(testSealer(t))
	if _, err := svc.Enqueue(context.Background(), codeEmail(7)); err != nil {
		t.Fatal(err)
	}
	p := q.created[0]
	q.row = db.Notification{
		ID: 4, Channel: p.Channel, Status: model.StatusQueued, Recipient: p.Recipient,
		TemplateCode:  pgtype.Text{String: "auth.welcome", Valid: true},
		SealedContent: p.SealedContent, AttemptCount: 1, MaxAttempts: 5,
	}
	if err := svc.Deliver(context.Background(), 4); err == nil {
		t.Fatal("Deliver opened a ciphertext under another template")
	}
	if len(capture.got) != 0 {
		t.Fatalf("provider called %d times", len(capture.got))
	}
}

// Without a sealer a security e-mail is refused, never stored in plaintext.
func TestSecurityEmailRefusedWithoutSealer(t *testing.T) {
	t.Parallel()

	q := &deliverTestQuerier{}
	svc := New(q, &noopEnqueuer{}, nil, slog.Default())
	if _, err := svc.Enqueue(context.Background(), codeEmail(7)); !errors.Is(err, errSealerMissing) {
		t.Fatalf("err = %v", err)
	}
	if len(q.created) != 0 {
		t.Fatalf("created = %d", len(q.created))
	}
}

// Security templates are sealed even when the caller forgot SecurityEmail;
// other channels and ordinary e-mails are not.
func TestSecurityTemplatesAlwaysSealed(t *testing.T) {
	t.Parallel()

	q := &deliverTestQuerier{}
	svc := New(q, &noopEnqueuer{}, nil, slog.Default()).WithSealer(testSealer(t))
	to := "x@example.com"
	link := "https://app.example/invite/TOKEN"
	if _, err := svc.Enqueue(context.Background(), model.EnqueueInput{
		Channels: []string{model.ChannelEmail, model.ChannelInapp}, TemplateCode: "organizations.invitation",
		Recipient: &to, ActionURL: &link, Title: "Davet", Body: link,
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Enqueue(context.Background(), model.EnqueueInput{
		Channels: []string{model.ChannelEmail}, TemplateCode: "exports.ready", Recipient: &to, Title: "t", Body: "b",
	}); err != nil {
		t.Fatal(err)
	}
	if len(q.created) != 3 {
		t.Fatalf("created = %d", len(q.created))
	}
	if e := q.created[0]; !e.SealedContent.Valid || e.Body != RedactedBody || e.ActionUrl.Valid {
		t.Fatalf("invitation e-mail not sealed: %+v", e)
	}
	if in := q.created[1]; in.SealedContent.Valid {
		t.Fatal("in-app row sealed")
	}
	if o := q.created[2]; o.SealedContent.Valid || o.Body == RedactedBody {
		t.Fatalf("ordinary e-mail sealed: %+v", o)
	}
}

// ForgetRecipient (TEC-1137) still applies to a sealed row; its copy for
// after the delivery is the redacted stand-in, not a re-rendered body.
func TestSealedEmailKeepsForgetRecipient(t *testing.T) {
	t.Parallel()

	q := &deliverTestQuerier{}
	q.template = db.NotificationTemplate{Code: "auth.account_deleted", Subject: "Hoşça kal {{name}}", Body: "{{name}} silindi"}
	svc := New(q, &noopEnqueuer{}, nil, slog.Default()).WithSealer(testSealer(t))
	to := "gone@example.com"
	if _, err := svc.Enqueue(context.Background(), model.EnqueueInput{
		Channels: []string{model.ChannelEmail}, TemplateCode: "auth.account_deleted", SecurityEmail: true,
		Recipient: &to, TemplateVars: map[string]string{"name": "Ada"},
		SecretVars: []string{"name"}, ForgetRecipient: true,
	}); err != nil {
		t.Fatal(err)
	}
	row := q.created[0]
	var payload map[string]any
	if err := json.Unmarshal(row.Payload, &payload); err != nil {
		t.Fatal(err)
	}
	red, _ := payload["redact"].(map[string]any)
	if red == nil || red["forget_recipient"] != true || red["body"] != RedactedBody || red["title"] != "auth.account_deleted" {
		t.Fatalf("redact = %v", payload["redact"])
	}
	if strings.Contains(string(row.Payload), "Ada") || row.Title != "auth.account_deleted" {
		t.Fatalf("name stored in plaintext: %s / %q", row.Payload, row.Title)
	}
}

// An e-mail row is not readable through the inbox detail or the action
// redeem route, even by its owner (an unverified account must not read its
// verification code there).
func TestOwnerCannotReadEmailRow(t *testing.T) {
	t.Parallel()

	q := &ownedQuerier{}
	q.row = db.Notification{
		ID: 5, Uuid: uuid.New(), UserID: pgtype.Int8{Int64: 7, Valid: true}, Channel: model.ChannelEmail,
		Title: "Kod " + secretCode, Body: secretCode, ActionUrl: pgtype.Text{String: "https://x/verify", Valid: true},
	}
	svc := New(q, &noopEnqueuer{}, nil, slog.Default()).WithActionSigner("secret", 0)
	if _, err := svc.GetOwned(context.Background(), 7, q.row.Uuid); !errors.Is(err, ErrNotFound) {
		t.Fatalf("GetOwned err = %v", err)
	}
	if _, _, err := svc.RedeemAction(context.Background(), 7, q.row.Uuid, 0, "sig"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("RedeemAction err = %v", err)
	}
	q.row.Channel = model.ChannelInapp
	if _, err := svc.GetOwned(context.Background(), 7, q.row.Uuid); err != nil {
		t.Fatalf("in-app GetOwned: %v", err)
	}
}

// Migration 000140 redacted older rows with the same template list the code
// seals.
func TestMigrationRedactsEverySecurityTemplate(t *testing.T) {
	t.Parallel()

	raw, err := os.ReadFile("../../../../migrations/000140_notifications_sealed_content.up.sql")
	if err != nil {
		t.Fatal(err)
	}
	var inMigration []string
	for _, m := range regexp.MustCompile(`'((?:auth|organizations)\.[a-z_]+)'`).FindAllStringSubmatch(string(raw), -1) {
		inMigration = append(inMigration, m[1])
	}
	var inCode []string
	for code := range model.SecurityEmailTemplates {
		inCode = append(inCode, code)
	}
	sort.Strings(inMigration)
	sort.Strings(inCode)
	if strings.Join(inMigration, ",") != strings.Join(inCode, ",") {
		t.Fatalf("migration %v != code %v", inMigration, inCode)
	}
}
