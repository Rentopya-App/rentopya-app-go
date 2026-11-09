package catalog

import (
	"slices"
	"testing"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/notifyengine/channel"
)

// The mobile app's staff pushes (TEC-1140): these events reach members on
// the push channel by default.
func TestStaffEventsPushByDefault(t *testing.T) {
	for _, code := range []string{FieldTaskAssigned, FieldTaskHandoverUpcoming, ReservationApprovalWaiting} {
		ev, ok := Get(code)
		if !ok {
			t.Fatalf("%s: not in the catalog", code)
		}
		if ev.Audience != channel.AudienceStaff || !slices.Contains(ev.Channels, channel.Push) {
			t.Fatalf("%s: audience %q channels %v", code, ev.Audience, ev.Channels)
		}
		if ev.Reminder && len(ev.Offsets) == 0 {
			t.Fatalf("%s: a reminder without offsets", code)
		}
		for _, lang := range Languages {
			if tpl := ev.Templates[lang]; tpl.Subject == "" || tpl.Body == "" {
				t.Fatalf("%s: no %s template", code, lang)
			}
		}
	}
}

func TestCodesAreUnique(t *testing.T) {
	seen := map[string]bool{}
	for _, ev := range All() {
		if seen[ev.Code] {
			t.Fatalf("duplicate event %s", ev.Code)
		}
		seen[ev.Code] = true
	}
}
