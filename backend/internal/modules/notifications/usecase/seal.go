package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/database/db"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/notifications/providers"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// RedactedBody stands in for the content of a security e-mail on its row.
// Same literal as migration 000140.
const RedactedBody = "[redacted]"

// SealPurpose is the FieldCipher purpose of sealed notification content
// (keys of its own, derived from APP_ENCRYPTION_KEY).
const SealPurpose = "notification_content"

// errSealerMissing: a security e-mail is refused rather than stored in
// plaintext when the service has no sealer.
var errSealerMissing = errors.New("notifications: content sealer not configured")

// ContentSealer encrypts security e-mail content (crypto.Sealer).
type ContentSealer interface {
	Seal(plaintext, aad string) (string, error)
	Open(encoded, aad string) (string, error)
}

// WithSealer enables security e-mails: their content is stored encrypted
// until delivery (see Enqueue and deliverVia).
func (s *Service) WithSealer(sealer ContentSealer) *Service {
	s.sealer = sealer
	return s
}

// sealedContent is what a security e-mail must still deliver. Subjects count:
// the login, link and deactivation templates put the code in the subject.
type sealedContent struct {
	Title     string `json:"title"`
	Body      string `json:"body"`
	ActionURL string `json:"action_url,omitempty"`
}

// sealAAD binds a ciphertext to the notification column, channel and
// template, so it does not open anywhere else.
func sealAAD(channel string, templateCode pgtype.Text) string {
	return "notifications.sealed_content|" + channel + "|" + templateCode.String
}

// sealContent encrypts a security e-mail for the row's sealed_content
// column. Without a sealer it fails rather than store the secret in
// plaintext.
func (s *Service) sealContent(channel string, templateCode pgtype.Text, c sealedContent) (pgtype.Text, error) {
	if s.sealer == nil {
		return pgtype.Text{}, errSealerMissing
	}
	raw, err := json.Marshal(c)
	if err != nil {
		return pgtype.Text{}, fmt.Errorf("seal notification: %w", err)
	}
	enc, err := s.sealer.Seal(string(raw), sealAAD(channel, templateCode))
	if err != nil {
		return pgtype.Text{}, fmt.Errorf("seal notification: %w", err)
	}
	return pgtype.Text{String: enc, Valid: true}, nil
}

// openContent decrypts the content of a sealed row into a copy of it.
func (s *Service) openContent(row db.Notification) (db.Notification, error) {
	if !row.SealedContent.Valid {
		return row, nil
	}
	if s.sealer == nil {
		return row, errSealerMissing
	}
	raw, err := s.sealer.Open(row.SealedContent.String, sealAAD(row.Channel, row.TemplateCode))
	if err != nil {
		return row, fmt.Errorf("open sealed notification: %w", err)
	}
	var c sealedContent
	if err := json.Unmarshal([]byte(raw), &c); err != nil {
		return row, fmt.Errorf("open sealed notification: %w", err)
	}
	row.Title, row.Body = c.Title, c.Body
	row.ActionUrl = pgtype.Text{String: c.ActionURL, Valid: c.ActionURL != ""}
	row.SealedContent = pgtype.Text{}
	return row, nil
}

// deliverVia hands the provider the real content of a sealed row. row is a
// copy: the plaintext never reaches the caller, the history or a status
// write.
func (s *Service) deliverVia(ctx context.Context, p providers.Provider, row db.Notification, userUUID *uuid.UUID) (providers.DeliveryResult, error) {
	opened, err := s.openContent(row)
	if err != nil {
		return providers.DeliveryResult{}, err
	}
	return p.Deliver(ctx, opened, userUUID)
}

// redactedTitle identifies a sealed row in operator views without its subject.
func redactedTitle(templateCode string) string {
	if templateCode != "" {
		return templateCode
	}
	return RedactedBody
}
