package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/publicapi/model"
)

type memCounter struct{ hits map[string]int }

func (m *memCounter) Under(_ context.Context, action, subject string, limit int) (bool, time.Duration) {
	return m.hits[action+"|"+subject] < limit, time.Minute
}

func (m *memCounter) Record(_ context.Context, action, subject string, _ time.Duration) {
	m.hits[action+"|"+subject]++
}

type capAlerts struct{ got []string }

func (a *capAlerts) PublicCapReached(_ context.Context, _ int64, slug, cap string, limit int) {
	a.got = append(a.got, cap+":"+slug)
}

// TEC-1282: only successful writes count towards an organization's hourly
// cap; once it is reached the request is refused with 429 and the platform
// is alerted. Other organizations are not affected.
func TestOrgCaps(t *testing.T) {
	counter := &memCounter{hits: map[string]int{}}
	alerts := &capAlerts{}
	h := &Public{}
	h.SetOrgCaps(counter, func(context.Context) (int, int, error) { return 2, 5, nil }, alerts)

	status := http.StatusCreated
	handler := func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(status) }
	orgA := model.Credential{OrganizationID: 1, OrganizationSlug: "a"}
	orgB := model.Credential{OrganizationID: 2, OrganizationSlug: "b"}
	call := func(c model.Credential) int {
		w := httptest.NewRecorder()
		h.capped(CapReservations, c, handler)(w, httptest.NewRequest(http.MethodPost, "/v1/public/reservations", nil))
		return w.Code
	}

	status = http.StatusUnprocessableEntity
	for range 5 {
		if got := call(orgA); got != http.StatusUnprocessableEntity {
			t.Fatalf("invalid request answered %d", got)
		}
	}
	status = http.StatusCreated
	for i := range 2 {
		if got := call(orgA); got != http.StatusCreated {
			t.Fatalf("write %d refused after only invalid requests: %d", i, got)
		}
	}
	w := httptest.NewRecorder()
	h.capped(CapReservations, orgA, handler)(w, httptest.NewRequest(http.MethodPost, "/v1/public/reservations", nil))
	if w.Code != http.StatusTooManyRequests || !strings.Contains(w.Body.String(), "organization_cap") || w.Header().Get("Retry-After") == "" {
		t.Fatalf("cap not enforced: %d %s", w.Code, w.Body.String())
	}
	if len(alerts.got) != 1 || alerts.got[0] != "reservations:a" {
		t.Fatalf("alerts = %v", alerts.got)
	}
	if got := call(orgB); got != http.StatusCreated {
		t.Fatalf("another organization limited: %d", got)
	}
	// Leads have their own cap.
	w = httptest.NewRecorder()
	h.capped(CapLeads, orgA, handler)(w, httptest.NewRequest(http.MethodPost, "/v1/public/site/leads", nil))
	if w.Code != http.StatusCreated {
		t.Fatalf("lead refused by the reservation cap: %d", w.Code)
	}
}

// Unreadable settings fall back to the defaults instead of disabling the cap.
func TestOrgCapsDefaults(t *testing.T) {
	o := &orgCaps{limits: func(context.Context) (int, int, error) { return 0, 0, errors.New("db down") }, now: time.Now}
	if got := o.limit(context.Background(), CapReservations); got != DefaultReservationsPerHour {
		t.Fatalf("reservations default = %d", got)
	}
	if got := o.limit(context.Background(), CapLeads); got != DefaultLeadsPerHour {
		t.Fatalf("leads default = %d", got)
	}
}
