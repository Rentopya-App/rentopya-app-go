// Package legal serves the public legal pages (privacy policy, terms of use,
// account deletion) and their platform-admin editor.
// Design: docs/design/legal-pages.md.
package legal

import (
	legalhandler "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/legal/handler"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/module"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/rbac"
)

// Module mounts /v1/public/legal/{slug} and /v1/platform/legal/{slug}.
type Module struct{ H *legalhandler.Handler }

func (Module) Name() string { return "legal" }

func (m Module) Routes(r *module.Router) {
	r.Public("GET /v1/public/legal/{slug}", m.H.PublicGet)
	r.Platform("GET /v1/platform/legal/{slug}", rbac.PermPlatformLegalRead, m.H.Get)
	r.Platform("PATCH /v1/platform/legal/{slug}", rbac.PermPlatformLegalWrite, m.H.Patch)
}
