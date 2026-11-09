package buildinfo

import "testing"

func TestMergePlaceholderIsDev(t *testing.T) {
	r := merge([]byte("{}\n"), "", "", "")
	if r.Version != DevVersion || !r.IsDev() {
		t.Fatalf("version = %q, want dev", r.Version)
	}
	if _, ok := r.BuiltAtTime(); ok {
		t.Fatal("empty built_at must not parse")
	}
}

func TestMergeMissingOrBadFileFallsBackToLdflags(t *testing.T) {
	for _, raw := range [][]byte{nil, []byte("not json")} {
		r := merge(raw, "", "abc1234", "")
		if r.Version != DevVersion || r.GitSHA != "abc1234" {
			t.Fatalf("got %+v", r)
		}
	}
}

func TestMergeLdflagsWinNotesFromFile(t *testing.T) {
	raw := []byte(`{"version":"v0.3","git_sha":"old","built_at":"2026-01-01T00:00:00Z","notes":"- fix (abc)"}`)
	r := merge(raw, "v0.4", "def5678", "2026-11-03T10:00:00Z")
	if r.Version != "v0.4" || r.GitSHA != "def5678" || r.Notes != "- fix (abc)" {
		t.Fatalf("got %+v", r)
	}
	ts, ok := r.BuiltAtTime()
	if !ok || ts.Year() != 2026 || ts.Month() != 11 {
		t.Fatalf("built_at = %v ok=%v", ts, ok)
	}
}

func TestMergeFileOnly(t *testing.T) {
	r := merge([]byte(`{"version":"v0.7","git_sha":"aaa","notes":"n"}`), "", "", "")
	if r.Version != "v0.7" || r.GitSHA != "aaa" || r.Notes != "n" || r.IsDev() {
		t.Fatalf("got %+v", r)
	}
}

func TestBuiltAtTimeRejectsGarbage(t *testing.T) {
	if _, ok := (Release{BuiltAt: "yesterday"}).BuiltAtTime(); ok {
		t.Fatal("invalid built_at must not parse")
	}
}

func TestCommittedPlaceholderIsDev(t *testing.T) {
	// The repository ships release.json as `{}`; CI overwrites it only inside
	// the release image build. A committed real release would mislabel dev builds.
	if Version != "" || GitSHA != "" || BuildTime != "" {
		t.Skip("ldflags set for this test binary")
	}
	if r := Current(); !r.IsDev() || r.Notes != "" {
		t.Fatalf("committed release.json must be the `{}` placeholder, got %+v", r)
	}
}
