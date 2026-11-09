package usecase

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/database/db"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/notifications/model"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/notifications/providers"
)

// Security e-mails with SecretVars keep a secret-free copy for after the
// delivery, and the delivery applies it (docs/design/account-deletion.md).
func TestEnqueueStoresSecretFreeCopyAndDeliveryRedacts(t *testing.T) {
	t.Parallel()

	q := &deliverTestQuerier{}
	q.template = db.NotificationTemplate{Code: "auth.account_deactivated", Subject: "Hi {{name}}", Body: "Restore: {{restore_url}}"}
	svc := New(q, nil, []providers.Provider{providers.InappProvider{}}, slog.Default())
	recipient := "ada@example.com"
	in := model.EnqueueInput{
		Channels: []string{model.ChannelEmail}, TemplateCode: "auth.account_deactivated",
		Recipient: &recipient, SecurityEmail: true,
		TemplateVars:    map[string]string{"name": "Ada", "restore_url": "https://x/restore#SECRET"},
		SecretVars:      []string{"restore_url"},
		ForgetRecipient: true,
	}
	if _, err := svc.Enqueue(context.Background(), in); err != nil {
		t.Fatalf("Enqueue: %v", err)
	}
	if len(q.created) != 1 {
		t.Fatalf("created = %d", len(q.created))
	}
	row := q.created[0]
	if !strings.Contains(row.Body, "SECRET") {
		t.Fatalf("delivered body must carry the link, got %q", row.Body)
	}
	var payload map[string]any
	if err := json.Unmarshal(row.Payload, &payload); err != nil {
		t.Fatal(err)
	}
	red, _ := payload["redact"].(map[string]any)
	if red == nil || strings.Contains(red["body"].(string), "SECRET") || red["title"] != "Hi Ada" || red["forget_recipient"] != true {
		t.Fatalf("redact copy = %v", payload["redact"])
	}

	// Delivered → the row is redacted.
	q.row = db.Notification{ID: 9, Channel: model.ChannelInapp, Status: model.StatusQueued}
	if err := svc.Deliver(context.Background(), 9); err != nil {
		t.Fatalf("Deliver: %v", err)
	}
	if len(q.redacted) == 0 || q.redacted[len(q.redacted)-1] != 9 {
		t.Fatalf("redacted = %v", q.redacted)
	}
}

func TestEnqueueWithoutSecretsHasNoRedactCopy(t *testing.T) {
	t.Parallel()

	q := &deliverTestQuerier{}
	svc := New(q, nil, []providers.Provider{providers.InappProvider{}}, slog.Default())
	if _, err := svc.Enqueue(context.Background(), model.EnqueueInput{Channels: []string{model.ChannelEmail}, Title: "t", Body: "b"}); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(q.created[0].Payload), "redact") {
		t.Fatalf("payload = %s", q.created[0].Payload)
	}
}
