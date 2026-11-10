package httpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/config"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/database/db"
	branchusecase "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/branches/usecase"
	orgmodel "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/organizations/model"
	orgrepository "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/organizations/repository"
	orgusecase "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/organizations/usecase"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/jwt"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/orgctx"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/storage"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"gopkg.in/yaml.v3"
)

// RT-A01 branch scope extension (TEC-1200): tenant writes that name a
// branch in their body or query.
//
// A member whose branch_scope is "selected [X]" sends every such write with
// another branch Y of the same organization: the answer is the module's
// documented refusal (400 not_found on the branch field, 404 for a record
// outside the scope, 403 for head office actions) and no row of the
// organization changes. The same write with X succeeds.
//
// TestBranchScopeWriteRoutesCovered (no database) keeps the list complete:
// every /v1/tenant write operation of openapi.yaml whose request body or
// query has a branch / service point field must have a case below
// (branchScopeWriteCovered) or an entry in branchScopeWriteAllowlist.

// branchScopeWriteCovered lists the routes TestTenantBranchScopeWrites
// exercises (the test fails when its cases and this list differ).
var branchScopeWriteCovered = []string{
	"PATCH /v1/tenant/members/{userUuid}",
	"POST /v1/tenant/invitations",
	"POST /v1/tenant/vehicles",
	"PATCH /v1/tenant/vehicles/{uuid}",
	"POST /v1/tenant/transfers",
	"PATCH /v1/tenant/transfers/{uuid}",
	"POST /v1/tenant/one-way-rules",
	"PATCH /v1/tenant/one-way-rules/{uuid}",
	"POST /v1/tenant/capacity-rules",
	"PUT /v1/tenant/capacity-rules/{uuid}",
	"PUT /v1/tenant/rate-plans/matrix",
	"POST /v1/tenant/rate-plans/matrix/activate",
	"POST /v1/tenant/rate-plans",
	"POST /v1/tenant/date-rules",
	"PATCH /v1/tenant/date-rules/{uuid}",
	"POST /v1/tenant/pricing/preview",
	"POST /v1/tenant/availability/search",
	"POST /v1/tenant/availability/holds",
	"POST /v1/tenant/quotes",
	"POST /v1/tenant/quotes/search",
	"POST /v1/tenant/reservations/{uuid}/quotes",
	"POST /v1/tenant/extras/availability",
	"PUT /v1/tenant/extras/{uuid}/stock",
	"POST /v1/tenant/equipment-allocations",
	"POST /v1/tenant/field-tasks",
	"PATCH /v1/tenant/field-tasks/{uuid}",
	"PATCH /v1/tenant/inspections/{uuid}",
	"POST /v1/tenant/rentals/{uuid}/handover",
	"POST /v1/tenant/rentals/{uuid}/swap",
	"POST /v1/tenant/rentals/{uuid}/return",
	"POST /v1/tenant/channel-mappings",
	"PATCH /v1/tenant/channel-mappings/{uuid}",
	"POST /v1/tenant/invoices",
	"POST /v1/tenant/finance/accounts/{uuid}/collections",
	"POST /v1/tenant/finance/accounts/{uuid}/refunds",
	"POST /v1/tenant/finance/accounts/{uuid}/adjustments",
	"POST /v1/tenant/finance/collections",
	"POST /v1/tenant/finance/cash-accounts",
	"PATCH /v1/tenant/finance/cash-accounts/{uuid}",
	"POST /v1/tenant/finance/expenses",
	"PATCH /v1/tenant/finance/expenses/{uuid}",
	"POST /v1/tenant/finance/supplier-invoices",
	"PATCH /v1/tenant/finance/supplier-invoices/{uuid}",
	"POST /v1/tenant/agreements",
	"PATCH /v1/tenant/agreements/{uuid}",
}

// branchScopeWriteAllowlist lists tenant writes with a branch field that
// have no case, with the reason.
var branchScopeWriteAllowlist = map[string]string{
	"PUT /v1/tenant/site": "organization-wide site document; config.widget.initial_filters.pickup_branch_uuid is only the public " +
		"widget's default filter (the public API resolves it inside the organization), it writes nothing at a branch",
}

// branchFieldRE matches request fields that name a branch or a service
// point (a point belongs to a branch).
var branchFieldRE = regexp.MustCompile(`branch|point`)

// branchWriteRoutes returns the /v1/tenant write operations of openapi.yaml
// whose request body or query parameters have a branch field, with the
// field paths.
func branchWriteRoutes(t *testing.T) map[string][]string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "docs", "openapi.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	var spec map[string]any
	if err := yaml.Unmarshal(raw, &spec); err != nil {
		t.Fatal(err)
	}
	resolve := func(node any) map[string]any {
		m, _ := node.(map[string]any)
		for i := 0; i < 8 && m != nil; i++ {
			ref, ok := m["$ref"].(string)
			if !ok {
				break
			}
			var cur any = spec
			for _, part := range strings.Split(strings.TrimPrefix(ref, "#/"), "/") {
				cm, _ := cur.(map[string]any)
				cur = cm[part]
			}
			m, _ = cur.(map[string]any)
		}
		return m
	}
	var walk func(node any, prefix string, out map[string]bool, depth int)
	walk = func(node any, prefix string, out map[string]bool, depth int) {
		m := resolve(node)
		if m == nil || depth > 12 {
			return
		}
		for _, key := range []string{"allOf", "oneOf", "anyOf"} {
			list, _ := m[key].([]any)
			for _, item := range list {
				walk(item, prefix, out, depth+1)
			}
		}
		props, _ := m["properties"].(map[string]any)
		for name, p := range props {
			if branchFieldRE.MatchString(name) {
				out[prefix+name] = true
			}
			walk(p, prefix+name+".", out, depth+1)
		}
		if items, ok := m["items"]; ok {
			walk(items, prefix+"[]", out, depth+1)
		}
	}
	paths, _ := spec["paths"].(map[string]any)
	routes := map[string][]string{}
	for path, item := range paths {
		if !strings.HasPrefix(path, "/v1/tenant") {
			continue
		}
		ops, _ := item.(map[string]any)
		shared, _ := ops["parameters"].([]any)
		for _, method := range []string{"post", "put", "patch", "delete"} {
			op, ok := ops[method].(map[string]any)
			if !ok {
				continue
			}
			fields := map[string]bool{}
			params, _ := op["parameters"].([]any)
			for _, p := range append(append([]any{}, shared...), params...) {
				pm := resolve(p)
				name, _ := pm["name"].(string)
				if pm["in"] == "query" && branchFieldRE.MatchString(name) {
					fields["?"+name] = true
				}
			}
			if body := resolve(op["requestBody"]); body != nil {
				content, _ := body["content"].(map[string]any)
				for _, c := range content {
					cm, _ := c.(map[string]any)
					walk(cm["schema"], "", fields, 0)
				}
			}
			if len(fields) == 0 {
				continue
			}
			list := make([]string, 0, len(fields))
			for f := range fields {
				list = append(list, f)
			}
			sort.Strings(list)
			routes[strings.ToUpper(method)+" "+path] = list
		}
	}
	return routes
}

func TestBranchScopeWriteRoutesCovered(t *testing.T) {
	t.Parallel()
	routes := branchWriteRoutes(t)
	if len(routes) < 30 {
		t.Fatalf("found only %d tenant writes with a branch field in openapi.yaml", len(routes))
	}
	covered := map[string]bool{}
	for _, r := range branchScopeWriteCovered {
		if covered[r] {
			t.Errorf("duplicate case route %q", r)
		}
		covered[r] = true
		if _, ok := routes[r]; !ok {
			t.Errorf("case route %q is not a tenant write with a branch field in openapi.yaml", r)
		}
		if _, ok := branchScopeWriteAllowlist[r]; ok {
			t.Errorf("route %q has a case and an allowlist entry", r)
		}
	}
	for r := range branchScopeWriteAllowlist {
		if _, ok := routes[r]; !ok {
			t.Errorf("stale allowlist entry %q (no branch field in openapi.yaml)", r)
		}
	}
	for r, fields := range routes {
		if !covered[r] && branchScopeWriteAllowlist[r] == "" {
			t.Errorf("uncovered route %s (branch fields %v): add a case to TestTenantBranchScopeWrites "+
				"(branchScopeWriteCovered) or an allowlist entry with the reason", r, fields)
		}
	}
}

// scopeReq is one request of a branch scope case.
type scopeReq struct {
	method, path string
	body         any
}

// scopeCase: denied requests name branch Y (or a record of Y) and must answer
// code without changing any row; allowed (if any) names branch X.
type scopeCase struct {
	route   string
	denied  []scopeReq
	code    int
	allowed *scopeReq
	// noAllowed says why the case has no successful request.
	noAllowed string
}

func TestTenantBranchScopeWrites(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	q := db.New(pool)

	const secret = "branch-scope-test-access-secret-0123456789"
	cfg := config.Config{
		App:        config.AppConfig{Name: "BranchScope", Env: "test"},
		JWT:        config.JWTConfig{AccessSecret: secret, RefreshSecret: secret, AccessTTL: time.Hour, RefreshTTL: time.Hour},
		Encryption: config.EncryptionConfig{Key: strings.Repeat("k", 32)},
		Tenancy:    config.TenancyConfig{Enabled: true},
		Bulk:       config.BulkConfig{SyncMax: 1, RollbackHours: 24},
		SMS:        config.SMSConfig{LogProvider: true},
	}
	logOut := io.Discard
	if testing.Verbose() {
		logOut = os.Stderr
	}
	log := slog.New(slog.NewTextHandler(logOut, &slog.HandlerOptions{Level: slog.LevelError}))
	srv, err := New(cfg, log, Deps{DB: pool, Queries: q, Storage: &memStorage{m: storage.NewMemory()}})
	if err != nil {
		t.Fatal(err)
	}
	handler := srv.http.Handler
	tokens, err := jwt.NewManager(secret, time.Hour, time.Hour)
	if err != nil {
		t.Fatal(err)
	}

	// --- Organization, owner, scoped member --------------------------------
	suffix := strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	var users []int64
	newUser := func(name string) db.User {
		u, err := q.CreateUser(ctx, db.CreateUserParams{
			Email: name + "-bscope-" + suffix + "@example.test", PasswordHash: "x", Name: name, Surname: "Scope", Status: "active",
		})
		if err != nil {
			t.Fatal(err)
		}
		users = append(users, u.ID)
		return u
	}
	orgSvc := orgusecase.New(orgrepository.NewPostgres(pool, q), branchusecase.NewOrganizationHooks(nil))
	owner, dave, carol := newUser("owner"), newUser("dave"), newUser("carol")
	org, err := orgSvc.CreateOrganization(ctx, orgmodel.CreateOrganizationInput{Name: "Branch Scope " + suffix, OwnerUserID: owner.ID})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		bg := context.Background()
		for _, stmt := range []string{
			"DELETE FROM notifications WHERE user_id = ANY($1)",
			"DELETE FROM export_jobs WHERE actor_id = ANY($1)",
			"DELETE FROM import_jobs WHERE actor_id = ANY($1)",
			"DELETE FROM bulk_jobs WHERE actor_id = ANY($1)",
			"DELETE FROM activity_events WHERE actor_user_id = ANY($1)",
		} {
			_, _ = pool.Exec(bg, stmt, users)
		}
		_, _ = pool.Exec(bg, "DELETE FROM organizations WHERE id = $1", org.ID)
		_, _ = pool.Exec(bg, "DELETE FROM users WHERE id = ANY($1)", users)
	})
	for _, u := range []db.User{dave, carol} {
		if _, err := orgSvc.AddMember(ctx, org.UUID, u.Uuid, orgctx.RoleAdmin); err != nil {
			t.Fatal(err)
		}
	}

	type resp struct {
		code int
		raw  []byte
		data any
	}
	do := func(user db.User, method, path string, body any) resp {
		t.Helper()
		access, _, err := tokens.IssueAccess(jwt.AccessInput{UserID: user.Uuid, Roles: []string{"cms_user"}})
		if err != nil {
			t.Fatal(err)
		}
		var buf bytes.Buffer
		if body != nil {
			_ = json.NewEncoder(&buf).Encode(body)
		}
		req := httptest.NewRequest(method, path, &buf)
		req.Header.Set("Authorization", "Bearer "+access)
		req.Header.Set(orgctx.HeaderName, org.Slug)
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		out := resp{code: rr.Code, raw: rr.Body.Bytes()}
		var env map[string]any
		if json.Unmarshal(out.raw, &env) == nil {
			out.data = env["data"]
		}
		return out
	}
	must := func(r resp, want int, step string) resp {
		t.Helper()
		if r.code != want {
			t.Fatalf("%s = %d, want %d: %s", step, r.code, want, r.raw)
		}
		return r
	}
	str := func(r resp, keys ...string) string {
		cur := r.data
		for _, k := range keys {
			m, _ := cur.(map[string]any)
			cur = m[k]
		}
		s, _ := cur.(string)
		return s
	}
	call := func(method, path string, body any) resp { return do(owner, method, path, body) }
	day := func(days int) string { return time.Now().UTC().AddDate(0, 0, days).Format(time.RFC3339) }
	hours := func(h int) string { return time.Now().UTC().Add(time.Duration(h) * time.Hour).Format(time.RFC3339) }
	date := func(days int) string { return time.Now().UTC().AddDate(0, 0, days).Format("2006-01-02") }

	// --- Seed (owner, every branch) ----------------------------------------
	ids := map[string]string{}
	branches := must(call(http.MethodGet, "/v1/tenant/branches?q=MRK", nil), http.StatusOK, "list branches")
	ids["X"] = pageItems(t, branches.data)[0].(map[string]any)["uuid"].(string)
	ids["Y"] = str(must(call(http.MethodPost, "/v1/tenant/branches", map[string]any{"code": "YYY", "name": "Y Şube"}),
		http.StatusCreated, "create Y"), "uuid")
	ids["Z"] = str(must(call(http.MethodPost, "/v1/tenant/branches", map[string]any{"code": "ZZZ", "name": "Z Şube"}),
		http.StatusCreated, "create Z"), "uuid")
	for _, b := range []string{"X", "Y"} {
		ids["point"+b] = str(must(call(http.MethodPost, "/v1/tenant/branches/"+ids[b]+"/service-points", map[string]any{
			"type": "airport", "name": b + " Havalimanı",
		}), http.StatusCreated, "service point "+b), "uuid")
	}
	// dave: admin limited to X; carol: admin limited to X (dave may manage
	// her because her scope is inside his).
	for _, u := range []db.User{dave, carol} {
		must(call(http.MethodPatch, "/v1/tenant/members/"+u.Uuid.String(), map[string]any{
			"branch_scope": "selected", "branch_uuids": []string{ids["X"]},
		}), http.StatusOK, "scope member")
	}
	roles := pageItems(t, must(call(http.MethodGet, "/v1/tenant/roles?limit=100", nil), http.StatusOK, "roles").data)
	for _, r := range roles {
		if rm := r.(map[string]any); rm["key"] == "member" {
			ids["memberRole"] = rm["uuid"].(string)
		}
	}
	if ids["memberRole"] == "" {
		t.Fatal("member role template not listed")
	}
	ids["segment"] = str(must(call(http.MethodPost, "/v1/tenant/segments", map[string]any{"code": "SEG", "name": "Segment"}),
		http.StatusCreated, "segment"), "uuid")
	ids["group"] = str(must(call(http.MethodPost, "/v1/tenant/rental-groups", map[string]any{
		"code": "GRP", "name": "Grup", "segment_uuid": ids["segment"],
	}), http.StatusCreated, "group"), "uuid")
	ids["product"] = str(must(call(http.MethodPost, "/v1/tenant/products", map[string]any{
		"code": "PRD", "title": "Ürün", "segment_uuid": ids["segment"],
		"guarantee": map[string]any{"type": "GROUP", "rental_group_uuid": ids["group"]},
	}), http.StatusCreated, "product"), "uuid")
	must(call(http.MethodPatch, "/v1/tenant/products/"+ids["product"], map[string]any{"status": "published"}), http.StatusOK, "publish product")
	vehicle := func(plate, home, current string) string {
		body := map[string]any{
			"plate": plate, "manual_entry": true, "manual_brand": "Fiat", "manual_model": "Egea", "model_year": 2024,
			"home_branch_uuid": home,
		}
		if current != "" {
			body["current_branch_uuid"] = current
		}
		return str(must(call(http.MethodPost, "/v1/tenant/vehicles", body), http.StatusCreated, "vehicle "+plate), "uuid")
	}
	ids["vX"] = vehicle("34 BSX 1", ids["X"], "")
	ids["vX2"] = vehicle("34 BSX 2", ids["X"], "")
	ids["vXY"] = vehicle("34 BSX 3", ids["X"], ids["Y"])
	ids["vXY2"] = vehicle("34 BSX 4", ids["X"], ids["Y"])
	for _, v := range []string{"vX", "vX2"} {
		must(call(http.MethodPost, "/v1/tenant/vehicles/"+ids[v]+"/rental-groups", map[string]any{"rental_group_uuid": ids["group"]}),
			http.StatusCreated, "vehicle group")
	}
	ratePlan := str(must(call(http.MethodPost, "/v1/tenant/rate-plans", map[string]any{
		"rental_product_uuid": ids["product"], "scope": "common", "name": "Tarife",
		"bands": []map[string]any{{"min_days": 1, "daily_price": "1500"}},
	}), http.StatusCreated, "rate plan"), "uuid")
	must(call(http.MethodPost, "/v1/tenant/rate-plans/"+ratePlan+"/activate", nil), http.StatusOK, "activate rate plan")
	ids["transfer"] = str(must(call(http.MethodPost, "/v1/tenant/transfers", map[string]any{
		"vehicle_uuid": ids["vXY2"], "to_branch_uuid": ids["X"], "planned_departure": day(20), "planned_arrival": day(21),
	}), http.StatusCreated, "transfer"), "uuid")
	ids["oneWay"] = str(must(call(http.MethodPost, "/v1/tenant/one-way-rules", map[string]any{
		"from_branch_uuid": ids["X"], "to_branch_uuid": ids["Y"], "fee": 100,
	}), http.StatusCreated, "one-way rule"), "uuid")
	capRule := func(branch string) string {
		return str(must(call(http.MethodPost, "/v1/tenant/capacity-rules", map[string]any{
			"rule_type": "safety_margin", "quantity": 0, "branch_uuid": branch, "note": "seed",
		}), http.StatusCreated, "capacity rule"), "uuid")
	}
	ids["capX"], ids["capY"] = capRule(ids["X"]), capRule(ids["Y"])
	dateRule := func(name, branch string) string {
		return str(must(call(http.MethodPost, "/v1/tenant/date-rules", map[string]any{
			"name": name, "start_date": date(40), "end_date": date(60), "kind": "percent", "value": "10",
			"product_scope": "all", "all_branches": false, "branch_uuids": []string{branch},
		}), http.StatusCreated, "date rule "+name), "uuid")
	}
	ids["ruleX"], ids["ruleY"] = dateRule("SEED X", ids["X"]), dateRule("SEED Y", ids["Y"])
	ids["extra"] = str(must(call(http.MethodPost, "/v1/tenant/extras", map[string]any{
		"code": "SEAT", "name": "Koltuk", "extra_type": "child_seat", "charge_type": "per_day", "max_quantity": 2,
		"is_physical": true, "status": "published", "default_price": "100",
	}), http.StatusCreated, "extra"), "uuid")
	must(call(http.MethodPut, "/v1/tenant/extras/"+ids["extra"]+"/stock", map[string]any{
		"items": []map[string]any{{"branch_uuid": ids["X"], "quantity": 2}, {"branch_uuid": ids["Y"], "quantity": 2}},
	}), http.StatusOK, "extra stock")
	ids["customer"] = str(must(call(http.MethodPost, "/v1/tenant/customers", map[string]any{
		"customer_type": "corporate", "company_title": "Scope Lojistik", "identity_type": "vkn",
		"identity_number": "4540536920", "phone": "0532 111 22 33", "email": "filo-" + suffix + "@scope.test",
	}), http.StatusCreated, "customer"), "uuid")
	ids["driver"] = str(must(call(http.MethodPost, "/v1/tenant/customers/"+ids["customer"]+"/drivers", map[string]any{
		"first_name": "Sürücü", "last_name": "Scope", "birth_date": "1990-01-01", "licence_number": "B123456",
		"licence_issued_on": "2010-01-01",
	}), http.StatusCreated, "driver"), "uuid")
	// A reservation at X starting soon, and its rental with vX.
	quote := str(must(call(http.MethodPost, "/v1/tenant/quotes", map[string]any{
		"pickup_branch_uuid": ids["X"], "starts_at": hours(2), "ends_at": hours(50), "product_uuid": ids["product"],
		"customer_uuid": ids["customer"],
	}), http.StatusCreated, "quote"), "uuid")
	ids["reservation"] = str(must(call(http.MethodPost, "/v1/tenant/reservations", map[string]any{
		"quote_uuid": quote, "customer_uuid": ids["customer"], "drivers": []map[string]any{{"driver_uuid": ids["driver"]}},
	}), http.StatusCreated, "reservation"), "uuid")
	ids["rental"] = str(must(call(http.MethodPost, "/v1/tenant/rentals", map[string]any{
		"reservation_uuid": ids["reservation"], "vehicle_uuid": ids["vX"],
	}), http.StatusCreated, "rental"), "uuid")
	ids["inspection"] = str(must(call(http.MethodPost, "/v1/tenant/inspections", map[string]any{
		"rental_uuid": ids["rental"], "kind": "handover",
	}), http.StatusCreated, "inspection"), "uuid")
	ids["fieldTask"] = str(must(call(http.MethodPost, "/v1/tenant/field-tasks", map[string]any{
		"task_type": "cleaning", "branch_uuid": ids["X"], "vehicle_uuid": ids["vX2"], "due_at": day(3),
	}), http.StatusCreated, "field task"), "uuid")
	// Finance: the customer's account, a till at X, a category, a supplier.
	must(call(http.MethodPost, "/v1/tenant/reservations/"+ids["reservation"]+"/collections", map[string]any{
		"amount": "10", "method": "cash",
	}), http.StatusCreated, "reservation collection")
	accounts := pageItems(t, must(call(http.MethodGet, "/v1/tenant/finance/accounts", nil), http.StatusOK, "accounts").data)
	ids["account"] = accounts[0].(map[string]any)["uuid"].(string)
	ids["till"] = str(must(call(http.MethodPost, "/v1/tenant/finance/cash-accounts", map[string]any{
		"code": "KASAX", "name": "Kasa X", "kind": "cash", "branch_uuid": ids["X"],
	}), http.StatusCreated, "till"), "uuid")
	ids["category"] = str(must(call(http.MethodPost, "/v1/tenant/finance/expense-categories", map[string]any{
		"code": "scope_cat", "name": "Kategori",
	}), http.StatusCreated, "category"), "uuid")
	ids["expense"] = str(must(call(http.MethodPost, "/v1/tenant/finance/expenses", map[string]any{
		"category_uuid": ids["category"], "total_amount": "120", "vat_rate": "20", "description": "gider", "branch_uuid": ids["X"],
	}), http.StatusCreated, "expense"), "uuid")
	ids["supplier"] = str(must(call(http.MethodPost, "/v1/tenant/suppliers", map[string]any{
		"title": "Tedarikçi", "supplier_type": "service",
	}), http.StatusCreated, "supplier"), "uuid")
	ids["supplierInvoice"] = str(must(call(http.MethodPost, "/v1/tenant/finance/supplier-invoices", map[string]any{
		"supplier_uuid": ids["supplier"], "invoice_no": "F-1", "category_uuid": ids["category"], "total_amount": "240",
		"vat_rate": "20", "branch_uuid": ids["X"],
	}), http.StatusCreated, "supplier invoice"), "uuid")
	ids["agreement"] = str(must(call(http.MethodPost, "/v1/tenant/agreements", map[string]any{
		"customer_uuid": ids["customer"], "name": "Sözleşme X", "branch_uuid": ids["X"], "valid_from": date(0),
	}), http.StatusCreated, "agreement"), "uuid")

	// --- Cases (dave, scope [X]) ------------------------------------------
	X, Y, Z := ids["X"], ids["Y"], ids["Z"]
	post := func(path string, body any) *scopeReq { return &scopeReq{http.MethodPost, path, body} }
	patch := func(path string, body any) *scopeReq { return &scopeReq{http.MethodPatch, path, body} }
	put := func(path string, body any) *scopeReq { return &scopeReq{http.MethodPut, path, body} }
	one := func(r *scopeReq) []scopeReq { return []scopeReq{*r} }
	with := func(base map[string]any, kv ...any) map[string]any {
		out := map[string]any{}
		for k, v := range base {
			out[k] = v
		}
		for i := 0; i+1 < len(kv); i += 2 {
			out[kv[i].(string)] = kv[i+1]
		}
		return out
	}
	vehicleBody := map[string]any{"manual_entry": true, "manual_brand": "Fiat", "manual_model": "Egea", "model_year": 2024}
	search := map[string]any{"starts_at": day(4), "ends_at": day(5)}
	hold := map[string]any{"product_uuid": ids["product"], "starts_at": day(4), "ends_at": day(5), "hold_minutes": 60}
	plan := map[string]any{"rental_product_uuid": ids["product"], "scope": "branch", "name": "Şube tarifesi", "priority": 5,
		"bands": []map[string]any{{"min_days": 1, "daily_price": "1400"}}}
	matrix := map[string]any{"scope": "branch", "priority": 0, "bands": []map[string]any{{"min_days": 1}},
		"rows": []map[string]any{{"rental_product_uuid": ids["product"], "prices": []string{"1300"}}}}
	rule := map[string]any{"start_date": date(70), "end_date": date(80), "kind": "percent", "value": "5", "product_scope": "all",
		"all_branches": false}
	equipment := map[string]any{"extra_uuid": ids["extra"], "starts_at": day(4), "ends_at": day(5), "hold_minutes": 60}
	task := map[string]any{"task_type": "cleaning", "vehicle_uuid": ids["vX2"], "due_at": day(4)}
	money := map[string]any{"amount": "5", "method": "cash"}
	expense := map[string]any{"category_uuid": ids["category"], "total_amount": "60", "vat_rate": "20", "description": "gider"}
	supplierInvoice := map[string]any{"supplier_uuid": ids["supplier"], "category_uuid": ids["category"], "total_amount": "60", "vat_rate": "20"}
	rentalPath := "/v1/tenant/rentals/" + ids["rental"]
	accountPath := "/v1/tenant/finance/accounts/" + ids["account"]

	cases := []scopeCase{
		{route: "PATCH /v1/tenant/members/{userUuid}", code: http.StatusBadRequest,
			denied:  one(patch("/v1/tenant/members/"+carol.Uuid.String(), map[string]any{"branch_scope": "selected", "branch_uuids": []string{Y}})),
			allowed: patch("/v1/tenant/members/"+carol.Uuid.String(), map[string]any{"branch_scope": "selected", "branch_uuids": []string{X}})},
		{route: "POST /v1/tenant/invitations", code: http.StatusBadRequest,
			denied: one(post("/v1/tenant/invitations", map[string]any{"email": "inv-" + suffix + "@scope.test",
				"role_uuids": []string{ids["memberRole"]}, "branch_scope": "selected", "branch_uuids": []string{Y}})),
			allowed: post("/v1/tenant/invitations", map[string]any{"email": "inv-" + suffix + "@scope.test",
				"role_uuids": []string{ids["memberRole"]}, "branch_scope": "selected", "branch_uuids": []string{X}})},
		{route: "POST /v1/tenant/vehicles", code: http.StatusBadRequest,
			denied:  one(post("/v1/tenant/vehicles", with(vehicleBody, "plate", "34 BSD 9", "home_branch_uuid", Y))),
			allowed: post("/v1/tenant/vehicles", with(vehicleBody, "plate", "34 BSD 9", "home_branch_uuid", X))},
		{route: "PATCH /v1/tenant/vehicles/{uuid}", code: http.StatusBadRequest,
			denied:  one(patch("/v1/tenant/vehicles/"+ids["vX2"], map[string]any{"home_branch_uuid": Y})),
			allowed: patch("/v1/tenant/vehicles/"+ids["vX2"], map[string]any{"home_branch_uuid": X})},
		// A transfer needs one end in the scope (sending or receiving
		// branch): vXY stands at Y, Y → Z is outside.
		{route: "POST /v1/tenant/transfers", code: http.StatusBadRequest,
			denied: one(post("/v1/tenant/transfers", map[string]any{"vehicle_uuid": ids["vXY"], "from_branch_uuid": Y,
				"to_branch_uuid": Z, "planned_departure": day(10), "planned_arrival": day(11)})),
			allowed: post("/v1/tenant/transfers", map[string]any{"vehicle_uuid": ids["vXY"], "from_branch_uuid": Y,
				"to_branch_uuid": X, "planned_departure": day(10), "planned_arrival": day(11)})},
		{route: "PATCH /v1/tenant/transfers/{uuid}", code: http.StatusBadRequest,
			denied:  one(patch("/v1/tenant/transfers/"+ids["transfer"], map[string]any{"to_branch_uuid": Z})),
			allowed: patch("/v1/tenant/transfers/"+ids["transfer"], map[string]any{"to_branch_uuid": X})},
		// One-way rules belong to their departure branch.
		{route: "POST /v1/tenant/one-way-rules", code: http.StatusBadRequest,
			denied:  one(post("/v1/tenant/one-way-rules", map[string]any{"from_branch_uuid": Y, "to_branch_uuid": X, "fee": 50})),
			allowed: post("/v1/tenant/one-way-rules", map[string]any{"from_branch_uuid": X, "to_branch_uuid": Z, "fee": 50})},
		{route: "PATCH /v1/tenant/one-way-rules/{uuid}", code: http.StatusBadRequest,
			denied:  one(patch("/v1/tenant/one-way-rules/"+ids["oneWay"], map[string]any{"from_branch_uuid": Y, "to_branch_uuid": Z})),
			allowed: patch("/v1/tenant/one-way-rules/"+ids["oneWay"], map[string]any{"from_branch_uuid": X, "to_branch_uuid": Y})},
		{route: "POST /v1/tenant/capacity-rules", code: http.StatusBadRequest,
			denied:  one(post("/v1/tenant/capacity-rules", map[string]any{"rule_type": "safety_margin", "quantity": 0, "branch_uuid": Y, "product_uuid": ids["product"]})),
			allowed: post("/v1/tenant/capacity-rules", map[string]any{"rule_type": "safety_margin", "quantity": 0, "branch_uuid": X, "product_uuid": ids["product"]})},
		{route: "PUT /v1/tenant/capacity-rules/{uuid}", code: http.StatusBadRequest,
			denied:  one(put("/v1/tenant/capacity-rules/"+ids["capX"], map[string]any{"rule_type": "safety_margin", "quantity": 1, "branch_uuid": Y})),
			allowed: put("/v1/tenant/capacity-rules/"+ids["capX"], map[string]any{"rule_type": "safety_margin", "quantity": 1, "branch_uuid": X})},
		{route: "PUT /v1/tenant/rate-plans/matrix", code: http.StatusBadRequest,
			denied: one(put("/v1/tenant/rate-plans/matrix", with(matrix, "branch_uuid", Y))), allowed: put("/v1/tenant/rate-plans/matrix", with(matrix, "branch_uuid", X))},
		{route: "POST /v1/tenant/rate-plans/matrix/activate", code: http.StatusBadRequest,
			denied:  one(post("/v1/tenant/rate-plans/matrix/activate", map[string]any{"scope": "branch", "branch_uuid": Y})),
			allowed: post("/v1/tenant/rate-plans/matrix/activate", map[string]any{"scope": "branch", "branch_uuid": X})},
		{route: "POST /v1/tenant/rate-plans", code: http.StatusBadRequest,
			denied: one(post("/v1/tenant/rate-plans", with(plan, "branch_uuid", Y))), allowed: post("/v1/tenant/rate-plans", with(plan, "branch_uuid", X))},
		{route: "POST /v1/tenant/date-rules", code: http.StatusBadRequest,
			denied: []scopeReq{
				*post("/v1/tenant/date-rules", with(rule, "name", "NEW", "branch_uuids", []string{Y})),
				*post("/v1/tenant/date-rules", with(rule, "name", "NEW", "branch_uuids", []string{X, Y})),
				*post("/v1/tenant/date-rules", with(rule, "name", "NEW", "all_branches", true)),
			},
			allowed: post("/v1/tenant/date-rules", with(rule, "name", "NEW", "branch_uuids", []string{X}))},
		{route: "PATCH /v1/tenant/date-rules/{uuid}", code: http.StatusBadRequest,
			denied: []scopeReq{
				*patch("/v1/tenant/date-rules/"+ids["ruleX"], map[string]any{"branch_uuids": []string{Y}}),
				*patch("/v1/tenant/date-rules/"+ids["ruleX"], map[string]any{"all_branches": true}),
				*patch("/v1/tenant/date-rules/"+ids["ruleY"], map[string]any{"value": "15"}),
			},
			allowed: patch("/v1/tenant/date-rules/"+ids["ruleX"], map[string]any{"branch_uuids": []string{X}, "value": "15"})},
		{route: "POST /v1/tenant/pricing/preview", code: http.StatusBadRequest,
			denied:  one(post("/v1/tenant/pricing/preview", previewBody(ids["product"], Y, nil))),
			allowed: post("/v1/tenant/pricing/preview", previewBody(ids["product"], X, nil))},
		// Availability and quotes need the pick-up or the return branch in
		// the scope.
		{route: "POST /v1/tenant/availability/search", code: http.StatusBadRequest,
			denied:  one(post("/v1/tenant/availability/search", with(search, "pickup_branch_uuid", Y, "return_branch_uuid", Z))),
			allowed: post("/v1/tenant/availability/search", with(search, "pickup_branch_uuid", Y, "return_branch_uuid", X))},
		{route: "POST /v1/tenant/availability/holds", code: http.StatusBadRequest,
			denied:  one(post("/v1/tenant/availability/holds", with(hold, "pickup_branch_uuid", Y))),
			allowed: post("/v1/tenant/availability/holds", with(hold, "pickup_branch_uuid", X))},
		{route: "POST /v1/tenant/quotes", code: http.StatusBadRequest,
			denied:  one(post("/v1/tenant/quotes", with(search, "product_uuid", ids["product"], "pickup_branch_uuid", Y))),
			allowed: post("/v1/tenant/quotes", with(search, "product_uuid", ids["product"], "pickup_branch_uuid", X))},
		{route: "POST /v1/tenant/quotes/search", code: http.StatusBadRequest,
			denied: one(post("/v1/tenant/quotes/search", with(search, "pickup_branch_uuid", Y))), allowed: post("/v1/tenant/quotes/search", with(search, "pickup_branch_uuid", X))},
		{route: "POST /v1/tenant/reservations/{uuid}/quotes", code: http.StatusBadRequest,
			denied:  one(post("/v1/tenant/reservations/"+ids["reservation"]+"/quotes", map[string]any{"pickup_branch_uuid": Y, "return_branch_uuid": Y})),
			allowed: post("/v1/tenant/reservations/"+ids["reservation"]+"/quotes", map[string]any{"pickup_branch_uuid": X, "return_branch_uuid": Y})},
		{route: "POST /v1/tenant/extras/availability", code: http.StatusBadRequest,
			denied: one(post("/v1/tenant/extras/availability", with(search, "branch_uuid", Y))), allowed: post("/v1/tenant/extras/availability", with(search, "branch_uuid", X))},
		{route: "PUT /v1/tenant/extras/{uuid}/stock", code: http.StatusBadRequest,
			denied:  one(put("/v1/tenant/extras/"+ids["extra"]+"/stock", map[string]any{"items": []map[string]any{{"branch_uuid": Y, "quantity": 5}}})),
			allowed: put("/v1/tenant/extras/"+ids["extra"]+"/stock", map[string]any{"items": []map[string]any{{"branch_uuid": X, "quantity": 3}}})},
		{route: "POST /v1/tenant/equipment-allocations", code: http.StatusBadRequest,
			denied:  one(post("/v1/tenant/equipment-allocations", with(equipment, "branch_uuid", Y))),
			allowed: post("/v1/tenant/equipment-allocations", with(equipment, "branch_uuid", X))},
		{route: "POST /v1/tenant/field-tasks", code: http.StatusBadRequest,
			denied: one(post("/v1/tenant/field-tasks", with(task, "branch_uuid", Y))), allowed: post("/v1/tenant/field-tasks", with(task, "branch_uuid", X))},
		// A point names its branch; the task stays at X.
		{route: "PATCH /v1/tenant/field-tasks/{uuid}", code: http.StatusBadRequest,
			denied:  one(patch("/v1/tenant/field-tasks/"+ids["fieldTask"], map[string]any{"point_uuid": ids["pointY"]})),
			allowed: patch("/v1/tenant/field-tasks/"+ids["fieldTask"], map[string]any{"point_uuid": ids["pointX"]})},
		{route: "PATCH /v1/tenant/inspections/{uuid}", code: http.StatusBadRequest,
			denied: []scopeReq{
				*patch("/v1/tenant/inspections/"+ids["inspection"], map[string]any{"branch_uuid": Y}),
				*patch("/v1/tenant/inspections/"+ids["inspection"], map[string]any{"point_uuid": ids["pointY"]}),
			},
			allowed: patch("/v1/tenant/inspections/"+ids["inspection"], map[string]any{"point_uuid": ids["pointX"]})},
		{route: "POST /v1/tenant/rentals/{uuid}/handover", code: http.StatusBadRequest,
			denied: []scopeReq{
				*post(rentalPath+"/handover", map[string]any{"branch_uuid": Y, "km": 100, "fuel": 80, "waiver_reason": "test"}),
				*post(rentalPath+"/handover", map[string]any{"branch_uuid": Y, "point_uuid": ids["pointY"], "km": 100, "fuel": 80, "waiver_reason": "test"}),
			},
			allowed: post(rentalPath+"/handover", map[string]any{"branch_uuid": X, "km": 100, "fuel": 80, "waiver_reason": "test"})},
		{route: "POST /v1/tenant/rentals/{uuid}/swap", code: http.StatusBadRequest,
			denied: one(post(rentalPath+"/swap", map[string]any{"vehicle_uuid": ids["vX2"], "branch_uuid": Y, "in_km": 150, "in_fuel": 70,
				"out_km": 10, "out_fuel": 90, "reason": "arıza testi"})),
			noAllowed: "a swap with the branch in the scope is covered by the rentals tests (it would move the rental to another vehicle here)"},
		{route: "POST /v1/tenant/rentals/{uuid}/return", code: http.StatusBadRequest,
			denied:  one(post(rentalPath+"/return", map[string]any{"branch_uuid": Y, "km": 200, "fuel": 60})),
			allowed: post(rentalPath+"/return", map[string]any{"branch_uuid": X, "km": 200, "fuel": 60})},
		{route: "POST /v1/tenant/channel-mappings", code: http.StatusForbidden,
			denied: one(post("/v1/tenant/channel-mappings", map[string]any{"account_uuid": uuid.NewString(), "entity_type": "branch",
				"branch_uuid": Y, "external_code": "LOC"})),
			noAllowed: "channel configuration acts for the whole organization (RequireAllBranches): a scoped member gets 403 for X too"},
		{route: "PATCH /v1/tenant/channel-mappings/{uuid}", code: http.StatusForbidden,
			denied:    one(patch("/v1/tenant/channel-mappings/"+uuid.NewString(), map[string]any{"branch_uuid": Y})),
			noAllowed: "channel configuration acts for the whole organization (RequireAllBranches): a scoped member gets 403 for X too"},
		{route: "POST /v1/tenant/invoices", code: http.StatusBadRequest,
			denied:    one(post("/v1/tenant/invoices", map[string]any{"rental_uuid": ids["rental"], "branch_uuid": Y, "idempotency_key": "scope-" + suffix})),
			noAllowed: "issuing needs the organization's invoice settings and open accruals (invoices tests); the branch is checked first"},
		{route: "POST /v1/tenant/finance/accounts/{uuid}/collections", code: http.StatusBadRequest,
			denied: one(post(accountPath+"/collections", with(money, "branch_uuid", Y))), allowed: post(accountPath+"/collections", with(money, "branch_uuid", X))},
		{route: "POST /v1/tenant/finance/accounts/{uuid}/refunds", code: http.StatusBadRequest,
			denied:  one(post(accountPath+"/refunds", map[string]any{"amount": "1", "branch_uuid": Y, "reason": "iade testi"})),
			allowed: post(accountPath+"/refunds", map[string]any{"amount": "1", "branch_uuid": X, "reason": "iade testi"})},
		{route: "POST /v1/tenant/finance/accounts/{uuid}/adjustments", code: http.StatusBadRequest,
			denied: one(post(accountPath+"/adjustments", map[string]any{"direction": "debit", "amount": "3", "purpose": "charge",
				"branch_uuid": Y, "reason": "düzeltme testi"})),
			allowed: post(accountPath+"/adjustments", map[string]any{"direction": "debit", "amount": "3", "purpose": "charge",
				"branch_uuid": X, "reason": "düzeltme testi"})},
		{route: "POST /v1/tenant/finance/collections", code: http.StatusBadRequest,
			denied: one(post("/v1/tenant/finance/collections", with(money, "account_uuid", ids["account"], "branch_uuid", Y, "allocation_mode", "none"))),
			allowed: post("/v1/tenant/finance/collections", with(money, "account_uuid", ids["account"], "branch_uuid", X, "allocation_mode", "none",
				"cash_account_uuid", ids["till"]))},
		{route: "POST /v1/tenant/finance/cash-accounts", code: http.StatusBadRequest,
			denied: []scopeReq{
				*post("/v1/tenant/finance/cash-accounts", map[string]any{"code": "KASAN", "name": "Kasa", "kind": "cash", "branch_uuid": Y}),
				*post("/v1/tenant/finance/cash-accounts", map[string]any{"code": "KASAN", "name": "Kasa", "kind": "cash"}),
			},
			allowed: post("/v1/tenant/finance/cash-accounts", map[string]any{"code": "KASAN", "name": "Kasa", "kind": "cash", "branch_uuid": X})},
		{route: "PATCH /v1/tenant/finance/cash-accounts/{uuid}", code: http.StatusBadRequest,
			denied: []scopeReq{
				*patch("/v1/tenant/finance/cash-accounts/"+ids["till"], map[string]any{"branch_uuid": Y}),
				*patch("/v1/tenant/finance/cash-accounts/"+ids["till"], map[string]any{"clear_branch": true}),
			},
			allowed: patch("/v1/tenant/finance/cash-accounts/"+ids["till"], map[string]any{"branch_uuid": X})},
		{route: "POST /v1/tenant/finance/expenses", code: http.StatusBadRequest,
			denied: one(post("/v1/tenant/finance/expenses", with(expense, "branch_uuid", Y))), allowed: post("/v1/tenant/finance/expenses", with(expense, "branch_uuid", X))},
		{route: "PATCH /v1/tenant/finance/expenses/{uuid}", code: http.StatusBadRequest,
			denied: []scopeReq{
				*patch("/v1/tenant/finance/expenses/"+ids["expense"], map[string]any{"branch_uuid": Y}),
				*patch("/v1/tenant/finance/expenses/"+ids["expense"], map[string]any{"clear_branch": true}),
			},
			allowed: patch("/v1/tenant/finance/expenses/"+ids["expense"], map[string]any{"branch_uuid": X, "description": "gider X"})},
		{route: "POST /v1/tenant/finance/supplier-invoices", code: http.StatusBadRequest,
			denied:  one(post("/v1/tenant/finance/supplier-invoices", with(supplierInvoice, "invoice_no", "F-2", "branch_uuid", Y))),
			allowed: post("/v1/tenant/finance/supplier-invoices", with(supplierInvoice, "invoice_no", "F-2", "branch_uuid", X))},
		{route: "PATCH /v1/tenant/finance/supplier-invoices/{uuid}", code: http.StatusBadRequest,
			denied:  one(patch("/v1/tenant/finance/supplier-invoices/"+ids["supplierInvoice"], map[string]any{"branch_uuid": Y})),
			allowed: patch("/v1/tenant/finance/supplier-invoices/"+ids["supplierInvoice"], map[string]any{"branch_uuid": X, "description": "fatura X"})},
		{route: "POST /v1/tenant/agreements", code: http.StatusBadRequest,
			denied: []scopeReq{
				*post("/v1/tenant/agreements", map[string]any{"customer_uuid": ids["customer"], "name": "Yeni", "branch_uuid": Y, "valid_from": date(0)}),
				*post("/v1/tenant/agreements", map[string]any{"customer_uuid": ids["customer"], "name": "Yeni", "clear_branch": true, "valid_from": date(0)}),
			},
			allowed: post("/v1/tenant/agreements", map[string]any{"customer_uuid": ids["customer"], "name": "Yeni", "branch_uuid": X, "valid_from": date(0)})},
		{route: "PATCH /v1/tenant/agreements/{uuid}", code: http.StatusBadRequest,
			denied:  one(patch("/v1/tenant/agreements/"+ids["agreement"], map[string]any{"branch_uuid": Y})),
			allowed: patch("/v1/tenant/agreements/"+ids["agreement"], map[string]any{"branch_uuid": X, "notes": "X"})},
	}
	// Records of Y addressed by uuid read as not found.
	extraDenied := map[string][]scopeReq{
		"PUT /v1/tenant/capacity-rules/{uuid}": {*put("/v1/tenant/capacity-rules/"+ids["capY"],
			map[string]any{"rule_type": "safety_margin", "quantity": 1, "branch_uuid": X})},
	}

	// --- Snapshot of every organization-owned row ---------------------------
	var tables []string
	rows, err := pool.Query(ctx, `SELECT c.table_name FROM information_schema.columns c
		JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
		WHERE c.table_schema = 'public' AND c.column_name = 'organization_id' AND t.table_type = 'BASE TABLE'
		ORDER BY 1`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatal(err)
		}
		tables = append(tables, name)
	}
	rows.Close()
	if len(tables) < 50 {
		t.Fatalf("found only %d organization tables", len(tables))
	}
	snapshot := func() map[string]string {
		t.Helper()
		out := make(map[string]string, len(tables))
		for _, tbl := range tables {
			var sum string
			if err := pool.QueryRow(ctx, `SELECT coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '') FROM "`+tbl+
				`" x WHERE organization_id = $1`, org.ID).Scan(&sum); err != nil {
				t.Fatalf("snapshot %s: %v", tbl, err)
			}
			out[tbl] = sum
		}
		return out
	}

	seen := map[string]bool{}
	for _, c := range cases {
		if seen[c.route] {
			t.Fatalf("duplicate case %s", c.route)
		}
		seen[c.route] = true
		if c.allowed == nil && c.noAllowed == "" {
			t.Fatalf("%s: a case without an allowed request needs a reason", c.route)
		}
		type deniedReq struct {
			scopeReq
			code int
		}
		var denied []deniedReq
		for _, r := range c.denied {
			denied = append(denied, deniedReq{r, c.code})
		}
		for _, r := range extraDenied[c.route] {
			denied = append(denied, deniedReq{r, http.StatusNotFound})
		}
		for i, r := range denied {
			before := snapshot()
			got := do(dave, r.method, r.path, r.body)
			if got.code != r.code {
				t.Errorf("%s denied #%d (branch Y) = %d, want %d: %s", c.route, i, got.code, r.code, got.raw)
			}
			after := snapshot()
			for _, tbl := range tables {
				if before[tbl] != after[tbl] {
					t.Errorf("%s denied #%d changed rows of %s", c.route, i, tbl)
				}
			}
		}
		if c.allowed != nil {
			got := do(dave, c.allowed.method, c.allowed.path, c.allowed.body)
			if got.code < 200 || got.code > 299 {
				t.Errorf("%s allowed (branch X) = %d, want 2xx: %s", c.route, got.code, got.raw)
			}
		}
	}
	want := map[string]bool{}
	for _, r := range branchScopeWriteCovered {
		want[r] = true
		if !seen[r] {
			t.Errorf("branchScopeWriteCovered lists %s without a case", r)
		}
	}
	for r := range seen {
		if !want[r] {
			t.Errorf("case %s is missing from branchScopeWriteCovered", r)
		}
	}
	for r := range extraDenied {
		if !seen[r] {
			t.Errorf("extra denied requests of %s without a case", r)
		}
	}
}
