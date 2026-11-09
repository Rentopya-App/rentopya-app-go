package handler

import (
	"testing"
	"time"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/publicapi/model"
)

// TEC-1170: a booking-session write is also limited per client IP, so a
// visitor cannot dodge the reservation window by minting new sessions.
func TestRouteLimitsAddClientIPForSessions(t *testing.T) {
	opt := route{write: true, limit: 20, window: 10 * time.Minute, action: "reservations"}

	got := routeLimits(opt, model.Credential{SessionID: "s1"}, "key:s1", "198.51.100.7")
	want := []limitCheck{{"pubapi:reservations", "key:s1"}, {"pubapi:reservations:ip", "198.51.100.7"}}
	if len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("session limits = %v, want %v", got, want)
	}

	// Partner servers (secret keys) share one IP: per key only.
	got = routeLimits(opt, model.Credential{}, "key", "198.51.100.7")
	if len(got) != 1 || got[0] != (limitCheck{"pubapi:reservations", "key"}) {
		t.Fatalf("secret key limits = %v", got)
	}

	if got := routeLimits(route{}, model.Credential{SessionID: "s1"}, "key:s1", "198.51.100.7"); len(got) != 0 {
		t.Fatalf("route without a limit = %v", got)
	}
}
