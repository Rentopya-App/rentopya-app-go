package httpkit

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/clientip"
)

// ClientIP (payments, contracts, public API, customer portal, site) follows
// clientip: a spoofed X-Forwarded-For from an untrusted peer is ignored and a
// trusted proxy chain resolves to the right-most untrusted hop.
func TestClientIPTrustsOnlyProxies(t *testing.T) {
	res, err := clientip.NewResolver(nil)
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct{ peer, xff, want string }{
		{"203.0.113.9:4000", "1.2.3.4", "203.0.113.9"},
		{"172.18.0.3:4000", "6.6.6.6, 198.51.100.7", "198.51.100.7"},
		{"10.0.0.2:4000", "", "10.0.0.2"},
	}
	for _, tc := range cases {
		var got string
		h := clientip.Middleware(res)(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
			got = ClientIP(r)
		}))
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = tc.peer
		if tc.xff != "" {
			req.Header.Set("X-Forwarded-For", tc.xff)
		}
		h.ServeHTTP(httptest.NewRecorder(), req)
		if got != tc.want {
			t.Errorf("peer %s xff %q: ClientIP = %q, want %q", tc.peer, tc.xff, got, tc.want)
		}
	}
	// Without the middleware the header is never believed.
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.2:4000"
	req.Header.Set("X-Forwarded-For", "198.51.100.7")
	if got := ClientIP(req); got != "10.0.0.2" {
		t.Errorf("without middleware = %q", got)
	}
}
