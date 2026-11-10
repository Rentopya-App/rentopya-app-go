package httpserver

import (
	"bufio"
	"bytes"
	_ "embed"
	"io"
	"log/slog"
	"regexp"
	"sort"
	"strings"
	"testing"
	"time"

	apidocs "github.com/furkanmeclis/nextjs-go-boilerplate/backend/docs"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/config"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/module"
)

// undocumentedRoutes lists /v1 routes mounted before every route had to be
// in openapi.yaml ("METHOD /path", one per line, # comments). The file only
// shrinks: the test fails on a new undocumented route and on a listed route
// that is documented (or gone) now.
//
//go:embed testdata/undocumented_routes.txt
var undocumentedRoutesFile string

// routeServer builds the real server (tenancy on, no infrastructure) and
// returns every pattern mounted on its mux.
func routeServer(t *testing.T) []string {
	t.Helper()
	const secret = "route-table-test-access-secret-0123456789"
	cfg := config.Config{
		App:        config.AppConfig{Name: "Routes", Env: "test"},
		JWT:        config.JWTConfig{AccessSecret: secret, RefreshSecret: secret, AccessTTL: time.Hour, RefreshTTL: time.Hour},
		Encryption: config.EncryptionConfig{Key: strings.Repeat("r", 32)},
		Tenancy:    config.TenancyConfig{Enabled: true},
		Bulk:       config.BulkConfig{SyncMax: 1, RollbackHours: 24},
		SMS:        config.SMSConfig{LogProvider: true},
	}
	srv, err := New(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)), Deps{})
	if err != nil {
		t.Fatal(err)
	}
	return srv.routes.Patterns()
}

// TestRoutesDocumented: every /v1 route mounted on the server mux has the
// same method and path template in backend/docs/openapi.yaml (hard rule),
// and every /v1 operation of the spec is mounted.
func TestRoutesDocumented(t *testing.T) {
	t.Parallel()
	patterns := routeServer(t)
	spec := openAPIOperations(t)
	allow := undocumentedRoutes(t)

	mounted := map[string]bool{}
	var missing []string
	for _, p := range patterns {
		method, path, ok := strings.Cut(p, " ")
		// OPTIONS routes are CORS preflights of the public booking API, not
		// operations.
		if !ok || !strings.HasPrefix(path, "/v1/") || method == "OPTIONS" {
			continue
		}
		key := method + " " + path
		if mounted[key] {
			continue
		}
		mounted[key] = true
		if !spec[key] && !allow[key] {
			missing = append(missing, key)
		}
	}
	if len(mounted) < 100 {
		t.Fatalf("only %d /v1 routes recorded", len(mounted))
	}
	sort.Strings(missing)
	for _, k := range missing {
		t.Errorf("%s is mounted but not in backend/docs/openapi.yaml", k)
	}
	var stale []string
	for k := range allow {
		if spec[k] || !mounted[k] {
			stale = append(stale, k)
		}
	}
	sort.Strings(stale)
	for _, k := range stale {
		t.Errorf("%s is documented or no longer mounted: remove it from testdata/undocumented_routes.txt", k)
	}
	var ghost []string
	for k := range spec {
		if strings.HasPrefix(strings.SplitN(k, " ", 2)[1], "/v1/") && !mounted[k] {
			ghost = append(ghost, k)
		}
	}
	sort.Strings(ghost)
	for _, k := range ghost {
		t.Errorf("openapi.yaml documents %s, but the server does not mount it", k)
	}
}

// TestSelfRegisteredModulesRecordOnly: the module list mounts in record-only
// mode (no mux) with unique names and only /v1 routes.
func TestSelfRegisteredModulesRecordOnly(t *testing.T) {
	t.Parallel()
	r := module.NewRouter(module.Deps{})
	if err := r.Mount(selfRegisteredModules(moduleHandlers{})...); err != nil {
		t.Fatal(err)
	}
	if len(r.Routes()) == 0 {
		t.Fatal("no module routes recorded")
	}
	for _, rt := range r.Routes() {
		if !strings.HasPrefix(rt.Path, "/v1/") {
			t.Errorf("%s: %s is outside /v1", rt.Module, rt.Pattern)
		}
	}
}

func undocumentedRoutes(t *testing.T) map[string]bool {
	t.Helper()
	out := map[string]bool{}
	for _, line := range strings.Split(undocumentedRoutesFile, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if out[line] {
			t.Errorf("testdata/undocumented_routes.txt lists %s twice", line)
		}
		out[line] = true
	}
	return out
}

// openAPIOperations returns "METHOD /path" for every operation in the spec.
func openAPIOperations(t *testing.T) map[string]bool {
	t.Helper()
	raw, err := apidocs.FS.ReadFile("openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	pathRe := regexp.MustCompile(`^  (/[^:\s]+):\s*$`)
	opRe := regexp.MustCompile(`^    (get|post|put|patch|delete|head|options):\s*$`)
	out := map[string]bool{}
	var current string
	sc := bufio.NewScanner(bytes.NewReader(raw))
	sc.Buffer(make([]byte, 1<<20), 1<<20)
	for sc.Scan() {
		line := sc.Text()
		if m := pathRe.FindStringSubmatch(line); m != nil {
			current = strings.Trim(m[1], `"'`)
			continue
		}
		if current != "" {
			if m := opRe.FindStringSubmatch(line); m != nil {
				out[strings.ToUpper(m[1])+" "+current] = true
			} else if !strings.HasPrefix(line, " ") && strings.TrimSpace(line) != "" {
				current = "" // left the paths block
			}
		}
	}
	if len(out) == 0 {
		t.Fatal("no operations parsed from openapi.yaml")
	}
	return out
}
