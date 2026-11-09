package usecase

import (
	"context"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/notifications/model"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/notifications/templates"
)

// redactedValue replaces a secret template var in the stored copy.
const redactedValue = "[…]"

// payloadRedact is the payload key holding the copy stored after delivery.
const payloadRedact = "redact"

// withRedaction adds the secret-free title / body (rendered with every
// SecretVars value replaced) the row keeps once it is final. Rows without a
// template keep their literal text.
func withRedaction(payload map[string]any, in model.EnqueueInput, title, body, tplSubject, tplBody string) map[string]any {
	out := make(map[string]any, len(payload)+1)
	for k, v := range payload {
		out[k] = v
	}
	safeTitle, safeBody := title, body
	if tplSubject != "" || tplBody != "" {
		vars := make(map[string]string, len(in.TemplateVars))
		for k, v := range in.TemplateVars {
			vars[k] = v
		}
		for _, k := range in.SecretVars {
			vars[k] = redactedValue
		}
		safeTitle = templates.Render(tplSubject, vars)
		safeBody = templates.Render(tplBody, vars)
	}
	out[payloadRedact] = map[string]any{
		"title": safeTitle, "body": safeBody, "forget_recipient": in.ForgetRecipient,
	}
	return out
}

// redact applies the stored secret-free copy (no-op for ordinary rows).
func (s *Service) redact(ctx context.Context, id int64) {
	if err := s.q.RedactNotification(ctx, id); err != nil && s.log != nil {
		s.log.Warn("notification_redact_failed", "notification_id", id, "error", err)
	}
}
