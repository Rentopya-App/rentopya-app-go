package search

import (
	searchhandler "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/search/handler"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/module"
)

// Module mounts the command-palette search endpoints: the platform palette
// (any signed-in session) and organization-scoped search. Tenant specs and
// hits are filtered by the caller's permissions in the X-Organization
// organization and by organization_id in the index; with tenancy off the
// tenant routes are not mounted.
type Module struct{ H *searchhandler.Handler }

func (Module) Name() string { return "search" }

func (m Module) Routes(r *module.Router) {
	r.Session("GET /v1/search/specs", m.H.Specs)
	r.Session("GET /v1/search", m.H.Search)
	r.Organization("GET /v1/tenant/search/specs", m.H.TenantSpecs)
	r.Organization("GET /v1/tenant/search", m.H.TenantSearch)
}
