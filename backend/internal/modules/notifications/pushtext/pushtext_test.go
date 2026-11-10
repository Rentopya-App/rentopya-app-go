package pushtext

import (
	"strings"
	"testing"
)

func TestForRendersSafeVarsOnly(t *testing.T) {
	got := For("exports.ready", "tr", map[string]string{"resource": "Kullanıcılar", "email": "a@b.c"})
	if got.Title != "Dışa aktarım hazır" || !strings.Contains(got.Body, "Kullanıcılar") || strings.Contains(got.Body, "a@b.c") {
		t.Fatalf("got %+v", got)
	}
	en := For("bulk.completed", "en", map[string]string{"succeeded": "12"})
	if en.Title != "Bulk action finished" || en.Body != "The bulk action on 12 records has finished." {
		t.Fatalf("en %+v", en)
	}
}

func TestForFallsBackWhenVarMissing(t *testing.T) {
	got := For("exports.ready", "tr", nil)
	if strings.Contains(got.Title+got.Body, "{{") || got.Body != "Yeni bir bildiriminiz var." {
		t.Fatalf("missing var leaked: %+v", got)
	}
	unknown := For("auth.welcome", "en", nil)
	if unknown.Title != "Notification" || unknown.Body != "You have a new notification." {
		t.Fatalf("unknown kind %+v", unknown)
	}
	if !Known("bulk.failed") || Known("nope") {
		t.Fatal("Known mismatch")
	}
}

// Staff pushes of the company panel get their own lock-screen text, with
// no variables (references and names stay inside the app).
func TestStaffKindsHaveFixedTexts(t *testing.T) {
	for _, kind := range []string{"field_tasks.assigned", "field_task.assigned", "field_task.overdue",
		"field_task.handover_upcoming", "reservation.approval_waiting"} {
		if !Known(kind) {
			t.Fatalf("%s: no push text", kind)
		}
		for _, lang := range []string{"tr", "en"} {
			got := For(kind, lang, map[string]string{"resource": "x"})
			if got.Title == "" || strings.Contains(got.Title+got.Body, "{{") || got.Body == fallback.tr.Body || got.Body == fallback.en.Body {
				t.Fatalf("%s/%s: %+v", kind, lang, got)
			}
		}
	}
}
