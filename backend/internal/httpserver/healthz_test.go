package httpserver

import (
	"testing"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/buildinfo"
)

func TestHealthzBodyReportsRelease(t *testing.T) {
	got := healthzBody(buildinfo.Release{
		Version: "v0.3",
		GitSHA:  "abc1234",
		BuiltAt: "2026-11-09T10:00:00Z",
		Notes:   "- secret-ish internal note",
	})
	want := map[string]string{"status": "ok", "version": "v0.3", "git_sha": "abc1234", "built_at": "2026-11-09T10:00:00Z"}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for k, v := range want {
		if got[k] != v {
			t.Fatalf("%s = %q, want %q", k, got[k], v)
		}
	}
	if _, ok := got["notes"]; ok {
		t.Fatal("release notes must not be in the public probe")
	}
}

func TestHealthzBodyDevBuild(t *testing.T) {
	got := healthzBody(buildinfo.Release{Version: buildinfo.DevVersion})
	if got["status"] != "ok" || got["version"] != "dev" {
		t.Fatalf("got %v", got)
	}
	if _, ok := got["git_sha"]; ok {
		t.Fatal("empty git_sha must be omitted")
	}
}
