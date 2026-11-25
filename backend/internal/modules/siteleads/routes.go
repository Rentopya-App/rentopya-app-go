// Package siteleads exposes organization-scoped website enquiries.
package siteleads

import (
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/middleware"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/siteleads/handler"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/features"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/httpkit"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/jwt"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/orgctx"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/rbac"
	"net/http"
)

func RegisterRoutes(mux httpkit.Mux, h *handler.Handler, tokens *jwt.Manager, loader middleware.IdentityLoader, resolver orgctx.Resolver) {
	if resolver == nil {
		return
	}
	authn := middleware.Authenticate(tokens, loader)
	org := middleware.RequireOrganization(resolver)
	read := middleware.RequireTenantPermission(rbac.PermTenantSiteLeadsRead)
	manage := middleware.RequireTenantPermission(rbac.PermTenantSiteLeadsManage)
	// Site enquiries come from the branded site, a plan feature (TEC-674):
	// reading them stays open on every plan, changing them needs it.
	feature := middleware.RequireFeature(features.Site)
	route := func(pattern string, fn http.HandlerFunc, guards ...func(http.Handler) http.Handler) {
		mux.Handle(pattern, middleware.Chain(fn, append([]func(http.Handler) http.Handler{authn, org, read}, guards...)...))
	}
	route("GET /v1/tenant/site/leads/meta", h.Meta)
	// TEC-1287: retention period of the organization's leads.
	route("GET /v1/tenant/site/leads/settings", h.GetSettings)
	route("PUT /v1/tenant/site/leads/settings", h.PutSettings, manage, feature)
	route("GET /v1/tenant/site/leads", h.List)
	route("GET /v1/tenant/site/leads/{uuid}", h.Get)
	route("PATCH /v1/tenant/site/leads/{uuid}", h.Patch, manage, feature)
}

// RegisterPublicRoutes mounts the e-mail links of the marketing double
// opt-in (TEC-1287): the token is the credential.
func RegisterPublicRoutes(mux httpkit.Mux, h *handler.Handler) {
	mux.HandleFunc("POST /v1/public/site/leads/confirm", h.Confirm)
	mux.HandleFunc("POST /v1/public/site/leads/unsubscribe", h.Unsubscribe)
}
