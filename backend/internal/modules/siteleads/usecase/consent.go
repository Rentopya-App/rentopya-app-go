package usecase

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/database/db"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/siteleads/model"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/mail"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/orgctx"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/pkg/response"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// Double opt-in and retention of site leads (TEC-1287, KVKK / İYS).
//
// A lead that asks for marketing (the newsletter, or any form with
// consent_marketing) is pending until the person clicks the single-use
// link e-mailed to the address (7 days); only then does it count as
// marketing permission. Every such e-mail also carries an unsubscribe link
// that keeps working. Leads older than the organization's retention period
// (default 24 months) are deleted by a daily job, recorded in the
// organization's activity.

// ConfirmTTL is how long a confirmation link works.
const ConfirmTTL = 7 * 24 * time.Hour

// DefaultRetentionMonths applies when an organization has not set one.
const DefaultRetentionMonths = 24

// ErrTokenInvalid: an unknown, used or expired link.
var ErrTokenInvalid = errors.New("the link is invalid or has expired")

// MarketingStatus derives a lead's marketing state.
func MarketingStatus(r db.SiteLead) string {
	switch {
	case r.UnsubscribedAt.Valid:
		return model.MarketingUnsubscribed
	case r.MarketingConfirmedAt.Valid:
		return model.MarketingConfirmed
	case r.Kind == "newsletter" || r.ConsentMarketing:
		return model.MarketingPending
	default:
		return model.MarketingNone
	}
}

func newToken() (string, string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", "", err
	}
	token := base64.RawURLEncoding.EncodeToString(b[:])
	return token, tokenHash(token), nil
}

func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func validToken(token string) bool {
	if len(token) != 43 {
		return false
	}
	for _, r := range token {
		if (r < 'A' || r > 'Z') && (r < 'a' || r > 'z') && (r < '0' || r > '9') && r != '-' && r != '_' {
			return false
		}
	}
	return true
}

// SubscriptionPath is the site page of the e-mail links in the lead's
// language (the site's localized route, TEC-1285).
func SubscriptionPath(locale string) string {
	if locale == "en" {
		return "/subscription"
	}
	return "/abonelik"
}

// askConsent stores the tokens and e-mails the confirmation. Failures are
// logged: the lead itself is kept (pending) either way.
func (s *Service) askConsent(ctx context.Context, org int64, row db.SiteLead, origin string) {
	confirm, confirmHash, err := newToken()
	if err != nil {
		s.log.Warn("site_lead_token_failed", "error", err)
		return
	}
	unsubscribe, unsubscribeHash, err := newToken()
	if err != nil {
		s.log.Warn("site_lead_token_failed", "error", err)
		return
	}
	if err := s.q.SetSiteLeadConsentTokens(ctx, db.SetSiteLeadConsentTokensParams{
		OrganizationID: org, ID: row.ID, ConfirmTokenHash: pgtype.Text{String: confirmHash, Valid: true},
		ConfirmExpiresAt:     pgtype.Timestamptz{Time: s.now().Add(ConfirmTTL), Valid: true},
		UnsubscribeTokenHash: pgtype.Text{String: unsubscribeHash, Valid: true},
	}); err != nil {
		s.log.Warn("site_lead_token_store_failed", "error", err)
		return
	}
	if s.mailer == nil {
		return
	}
	page := strings.TrimRight(origin, "/") + SubscriptionPath(row.Locale)
	msg := ConsentEmail(row.Locale, row.SourceHost, page+"?confirm="+confirm, page+"?unsubscribe="+unsubscribe)
	msg.To = []string{row.Email}
	sendCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
	defer cancel()
	if err := s.mailer.Send(sendCtx, msg); err != nil {
		s.log.Warn("site_lead_consent_mail_failed", "organization_id", org, "error", err)
	}
}

// ConsentEmail is the confirmation message (plain text, the lead's language).
func ConsentEmail(locale, site, confirmURL, unsubscribeURL string) mail.Message {
	if locale == "en" {
		return mail.Message{
			Subject: "Confirm your subscription – " + site,
			Body: fmt.Sprintf("Hello,\n\nYou (or someone using this address) asked %s to send you news and offers by e-mail.\n\n"+
				"Confirm within 7 days to start receiving them:\n%s\n\n"+
				"If you did not ask for this, ignore this message: nothing will be sent.\n\n"+
				"Unsubscribe at any time:\n%s\n", site, confirmURL, unsubscribeURL),
		}
	}
	return mail.Message{
		Subject: "Aboneliğinizi onaylayın – " + site,
		Body: fmt.Sprintf("Merhaba,\n\nSiz (ya da bu adresi kullanan biri) %s sitesinden e-postayla kampanya ve duyuru almak istediniz.\n\n"+
			"Almaya başlamak için 7 gün içinde onaylayın:\n%s\n\n"+
			"Bu isteği siz yapmadıysanız bu mesajı dikkate almayın; size ileti gönderilmez.\n\n"+
			"İstediğiniz zaman abonelikten çıkabilirsiniz:\n%s\n", site, confirmURL, unsubscribeURL),
	}
}

// Confirm records the confirmation of a pending marketing request.
func (s *Service) Confirm(ctx context.Context, token string) error {
	if !validToken(token) {
		return ErrTokenInvalid
	}
	row, err := s.q.ConfirmSiteLeadMarketing(ctx, pgtype.Text{String: tokenHash(token), Valid: true})
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrTokenInvalid
	}
	if err != nil {
		return err
	}
	s.record(ctx, row.OrganizationID, "site_lead.marketing_confirmed", row.Uuid.String(), nil)
	return nil
}

// Unsubscribe withdraws marketing permission (idempotent).
func (s *Service) Unsubscribe(ctx context.Context, token string) error {
	if !validToken(token) {
		return ErrTokenInvalid
	}
	row, err := s.q.UnsubscribeSiteLead(ctx, pgtype.Text{String: tokenHash(token), Valid: true})
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrTokenInvalid
	}
	if err != nil {
		return err
	}
	s.record(ctx, row.OrganizationID, "site_lead.unsubscribed", row.Uuid.String(), nil)
	return nil
}

// Settings returns the organization's lead settings.
func (s *Service) Settings(ctx context.Context, org int64) (model.Settings, error) {
	months, err := s.q.GetSiteLeadRetention(ctx, org)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.Settings{RetentionMonths: DefaultRetentionMonths}, nil
	}
	if err != nil {
		return model.Settings{}, err
	}
	return model.Settings{RetentionMonths: int(months)}, nil
}

// SaveSettings changes the retention period (1 – 120 months). It needs the
// site to exist (leads come from it).
func (s *Service) SaveSettings(ctx context.Context, org int64, in model.Settings) (model.Settings, error) {
	if in.RetentionMonths < 1 || in.RetentionMonths > 120 {
		return model.Settings{}, &ValidationError{Details: []response.Detail{{Field: "retention_months", Code: "out_of_range", Message: "between 1 and 120 months"}}}
	}
	months, err := s.q.SetSiteLeadRetention(ctx, db.SetSiteLeadRetentionParams{OrganizationID: org, LeadRetentionMonths: int32(in.RetentionMonths)})
	if errors.Is(err, pgx.ErrNoRows) {
		return model.Settings{}, &ValidationError{Details: []response.Detail{{Field: "retention_months", Code: "site_required", Message: "set up the site first"}}}
	}
	if err != nil {
		return model.Settings{}, err
	}
	return model.Settings{RetentionMonths: int(months)}, nil
}

// PurgeExpired deletes leads older than their organization's retention
// period and records the count in each organization's activity.
func (s *Service) PurgeExpired(ctx context.Context) (int, error) {
	orgs, err := s.q.SiteLeadRetention(ctx)
	if err != nil {
		return 0, err
	}
	total := 0
	for _, o := range orgs {
		n, err := s.q.DeleteExpiredSiteLeads(ctx, db.DeleteExpiredSiteLeadsParams(o))
		if err != nil {
			return total, err
		}
		if n > 0 {
			total += int(n)
			s.record(ctx, o.OrganizationID, "site_lead.retention_deleted", "", map[string]any{"deleted": n, "retention_months": o.RetentionMonths})
		}
	}
	return total, nil
}

func (s *Service) record(ctx context.Context, org int64, action, ref string, payload map[string]any) {
	if s.activity == nil {
		return
	}
	if payload == nil {
		payload = map[string]any{}
	}
	if ref != "" {
		payload["lead_uuid"] = ref
	}
	s.activity.Record(orgctx.WithOrganizationID(ctx, org), nil, action, model.Resource, nil, payload, nil)
}
