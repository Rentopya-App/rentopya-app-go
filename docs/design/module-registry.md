# Module self-registration — design note

Status: **step 1 implemented** (`internal/platform/module`; `access`, `search`,
`activity`, `logs` migrated; ported from the boilerplate in TEC-1171). The
remaining modules still use explicit `RegisterRoutes(mux, h, tokens, loader, …)`
calls in `internal/httpserver/server.go` and move over one at a time. They take
an `httpkit.Mux` (the `Handle` / `HandleFunc` part of `*http.ServeMux`), so the
server mounts every route through a recorder.

## Problem

`server.go` wires every module by hand (~500 lines): each module re-builds the
same guard chains (`Authenticate` → `RequirePermission`), takes a different
argument list, and nothing checks that the routes it mounts are in
`backend/docs/openapi.yaml`. When the route test landed in Rentopya (TEC-1171) 86 mounted `/v1`
operations were missing from the spec; 52 were documented then (storage
explorer, platform exports/imports, activity, member web push) and 34 remain
listed (see Guard rail).

## Contract

```go
type Module interface {
    Name() string            // unique, stable
    Routes(r *module.Router) // declares routes
}
```

`module.Router` holds the shared deps (mux, JWT manager, identity loader,
org resolver) and exposes one method per access level:

| Method | Chain |
|---|---|
| `Public(pattern, h)` | none |
| `SignedIn(pattern, h)` | `Authenticate` |
| `Session(pattern, h)` | `Authenticate` → `RequirePermission(auth.session)` |
| `Platform(pattern, perm, h)` | `Authenticate` → `RequirePermission(perm)` |
| `Tenant(pattern, perm, h)` | `Authenticate` → `RequireOrganization` → `RequireTenantPermission(perm)`; skipped when tenancy is off |
| `Organization(pattern, h)` | `Authenticate` → `RequireOrganization` (the handler filters by the member's permissions, e.g. tenant search); skipped when tenancy is off |

Extra middleware (step-up, rate limits) goes in the variadic tail. Every call
is recorded (`Router.Routes()`), so route-table tests do not need a running
server.

Modules keep building their own services; `server.go` constructs the handler
and passes it in the module struct (`activitymodule.Module{H: …}`), then calls
`modRouter.Mount(...)`. Construction stays explicit on purpose: dependency
order (notifications before invitations, the org resolver before tenant
routes) is easier to read in one function than through a DI container.

## Guard rail

`httpserver.New` wraps its `*http.ServeMux` in an `httpkit.RouteRecorder`
and hands that to every module, so the server knows its complete route table.
`internal/httpserver/routes_test.go` builds the real server (tenancy on, no
infrastructure) and fails when:

- a mounted `/v1` route (method + path template) is not in `openapi.yaml`;
- an `openapi.yaml` `/v1` operation is not mounted;
- a line of `internal/httpserver/testdata/undocumented_routes.txt` is
  documented or no longer mounted.

`OPTIONS` routes (CORS preflights of the public booking API) are not
operations and are skipped. `undocumented_routes.txt` holds the routes that
predate the rule (Auth.js internal adapter, platform logs / log rules, platform
roles and permissions); it only shrinks. The self-registered module list lives
in one place, `internal/httpserver/modules.go` (`selfRegisteredModules`), used
by the server and by a record-only test.

## Next steps

1. Move the remaining modules, smallest first (`authsettings`, the
   integrations, `bulk`, `settings`, `organizations`, `tenant`, `qrlogin`,
   `notifications`, `exports`, `imports`, `storage`, `auth`, then the
   Rentopya domain modules).
2. Optional capability interfaces on modules, discovered by the registry:
   `IOAdapters() []ioengine.Adapter`, `BulkAdapters()`, `SearchSpecs()`,
   `EventHandlers(bus)`, `Jobs(worker)`, so registries stop being assembled
   by hand.
3. Once every module is migrated, delete the `RegisterRoutes` functions.
4. Document the routes in `undocumented_routes.txt` and delete the file.
