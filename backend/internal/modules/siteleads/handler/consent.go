package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/siteleads/model"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/siteleads/usecase"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/authctx"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/httpkit"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/orgctx"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/pkg/response"
)

// Limiter is the fixed-window limiter (ratelimit.Limiter).
type Limiter interface {
	Allow(ctx context.Context, action, subject string, limit int, window time.Duration) (bool, time.Duration)
}

// SetLimiter limits the public confirmation links per client IP.
func (h *Handler) SetLimiter(l Limiter) { h.limiter = l }

func decodeBody(w http.ResponseWriter, r *http.Request, dst any) bool {
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10))
	d.DisallowUnknownFields()
	if err := d.Decode(dst); err != nil {
		response.BadRequest(w, r, response.CodeValidationError, "Invalid request body")
		return false
	}
	return true
}

// token runs a confirmation link action (no auth: the 32-byte token is the
// credential), 30 per minute per client IP.
func (h *Handler) token(fn func(context.Context, string) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if h.limiter != nil {
			if ok, retry := h.limiter.Allow(r.Context(), "site_leads:token:ip", httpkit.ClientIP(r), 30, time.Minute); !ok {
				w.Header().Set("Retry-After", strconv.Itoa(max(1, int(retry.Seconds()))))
				response.Error(w, r, http.StatusTooManyRequests, "RATE_LIMITED", "Too many requests; try again later")
				return
			}
		}
		var in model.TokenInput
		if !decodeBody(w, r, &in) {
			return
		}
		err := fn(r.Context(), in.Token)
		if errors.Is(err, usecase.ErrTokenInvalid) {
			response.NotFound(w, r, "The link is invalid or has expired")
			return
		}
		if err != nil {
			response.Internal(w, r, "Site lead operation failed")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// Confirm serves POST /v1/public/site/leads/confirm (TEC-1287).
func (h *Handler) Confirm(w http.ResponseWriter, r *http.Request) { h.token(h.svc.Confirm)(w, r) }

// Unsubscribe serves POST /v1/public/site/leads/unsubscribe (TEC-1287).
func (h *Handler) Unsubscribe(w http.ResponseWriter, r *http.Request) {
	h.token(h.svc.Unsubscribe)(w, r)
}

// GetSettings serves GET /v1/tenant/site/leads/settings.
func (h *Handler) GetSettings(w http.ResponseWriter, r *http.Request) {
	out, err := h.svc.Settings(r.Context(), orgctx.Must(r.Context()).ID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	response.JSON(w, r, http.StatusOK, out)
}

// PutSettings serves PUT /v1/tenant/site/leads/settings.
func (h *Handler) PutSettings(w http.ResponseWriter, r *http.Request) {
	var in model.Settings
	if !decodeBody(w, r, &in) {
		return
	}
	out, err := h.svc.SaveSettings(r.Context(), orgctx.Must(r.Context()).ID, in)
	if err != nil {
		writeError(w, r, err)
		return
	}
	if h.activity != nil {
		identity, _ := authctx.PrincipalFrom(r.Context())
		h.activity.Record(r.Context(), &identity.UserInternal, "site_leads.settings_updated", model.Resource, nil,
			map[string]any{"retention_months": out.RetentionMonths}, r)
	}
	response.JSON(w, r, http.StatusOK, out)
}
