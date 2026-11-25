package usecase

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/site/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// PreviewTTL is how long a preview link works.
const PreviewTTL = 30 * time.Minute

// previewPrefix versions the token format: sp2 adds the site's preview
// epoch (TEC-1289), so raising it revokes every link issued before.
const previewPrefix = "sp2"

// SetPreviewSecret derives the preview signing key from an existing server
// secret (APP_ENCRYPTION_KEY): no new configuration. Without it preview
// tokens are refused.
func (s *Service) SetPreviewSecret(secret string) {
	if secret == "" {
		s.previewKey = nil
		return
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte("rentopia/site-preview/v1"))
	s.previewKey = mac.Sum(nil)
}

func (s *Service) previewMAC(payload string) []byte {
	mac := hmac.New(sha256.New, s.previewKey)
	mac.Write([]byte(payload))
	return mac.Sum(nil)
}

// signPreview builds sp2.{site uuid}.{expiry unix}.{epoch}.{mac}: bound to
// one site (so to one organization), short-lived and revocable.
func (s *Service) signPreview(site uuid.UUID, exp time.Time, epoch int32) string {
	payload := previewPrefix + "." + site.String() + "." + strconv.FormatInt(exp.Unix(), 10) + "." + strconv.Itoa(int(epoch))
	return payload + "." + base64.RawURLEncoding.EncodeToString(s.previewMAC(payload))
}

// verifyPreview checks a token for a site: signature, site, expiry and the
// site's current preview epoch.
func (s *Service) verifyPreview(token string, site uuid.UUID, epoch int32) bool {
	if len(s.previewKey) == 0 || len(token) > 200 {
		return false
	}
	parts := strings.Split(token, ".")
	if len(parts) != 5 || parts[0] != previewPrefix {
		return false
	}
	payload := strings.Join(parts[:4], ".")
	sig, err := base64.RawURLEncoding.DecodeString(parts[4])
	if err != nil || !hmac.Equal(sig, s.previewMAC(payload)) {
		return false
	}
	id, err := uuid.Parse(parts[1])
	if err != nil || id != site {
		return false
	}
	if parts[3] != strconv.Itoa(int(epoch)) {
		return false
	}
	exp, err := strconv.ParseInt(parts[2], 10, 64)
	return err == nil && s.now().Before(time.Unix(exp, 0))
}

// RevokePreviews invalidates every preview link of the organization's site
// issued so far (TEC-1289). Without a site there is nothing to revoke.
func (s *Service) RevokePreviews(ctx context.Context, orgID int64) error {
	_, err := s.q.RevokeSitePreviews(ctx, orgID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	return err
}

// IssuePreview returns a preview link for the organization's draft. A site
// that was never saved is stored first with its defaults (switched off), so
// it has an address to preview on.
func (s *Service) IssuePreview(ctx context.Context, orgID int64, orgSlug string, userID int64) (model.PreviewToken, error) {
	if len(s.previewKey) == 0 {
		return model.PreviewToken{}, errors.New("site: preview secret is not configured")
	}
	row, err := s.q.GetSiteSettings(ctx, orgID)
	if errors.Is(err, pgx.ErrNoRows) {
		if _, err := s.Save(ctx, orgID, orgSlug, userID, model.SaveInput{Version: ptrInt(0)}); err != nil &&
			!errors.Is(err, ErrVersionConflict) {
			return model.PreviewToken{}, err
		}
		row, err = s.q.GetSiteSettings(ctx, orgID)
	}
	if err != nil {
		return model.PreviewToken{}, err
	}
	exp := s.now().Add(PreviewTTL).Truncate(time.Second)
	token := s.signPreview(row.Uuid, exp, row.PreviewEpoch)
	out := model.PreviewToken{
		Token: token, URL: s.base.Origin(row.Subdomain) + "/?preview=" + token, ExpiresAt: exp.UTC(),
	}
	withToken := func(p *string) *string {
		v := strings.TrimSuffix(*p, "&draft=1") + "&preview=" + token
		return &v
	}
	if row.LogoObjectKey.Valid {
		out.Assets.Logo = withToken(assetPath(row.Uuid, "logo", row.Version, true))
	}
	if row.FaviconObjectKey.Valid {
		out.Assets.Favicon = withToken(assetPath(row.Uuid, "favicon", row.Version, true))
	}
	if row.CoverObjectKey.Valid {
		out.Assets.Cover = withToken(assetPath(row.Uuid, "cover", row.Version, true))
	}
	return out, nil
}

func ptrInt(v int) *int { return &v }
