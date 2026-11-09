package handler

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/clientip"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/ratelimit"
	"github.com/redis/go-redis/v9"
)

// loginVia sends a login attempt through clientip.Middleware (as httpserver
// does) from the given direct peer with the given X-Forwarded-For chain.
func loginVia(t *testing.T, h *Handler, peer, xff string) *httptest.ResponseRecorder {
	t.Helper()
	res, err := clientip.NewResolver(nil)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/auth/login",
		strings.NewReader(`{"email":"a@example.com","password":"wrong-password"}`))
	req.RemoteAddr = peer
	if xff != "" {
		req.Header.Set("X-Forwarded-For", xff)
	}
	rec := httptest.NewRecorder()
	clientip.Middleware(res)(http.HandlerFunc(h.Login)).ServeHTTP(rec, req)
	return rec
}

// A client talking to the API directly cannot rotate a spoofed
// X-Forwarded-For to dodge the per-IP login limit: the header is ignored and
// every attempt lands in the peer's bucket.
func TestLoginRateLimitIgnoresSpoofedForwardedFor(t *testing.T) {
	mr := miniredis.RunT(t)
	h := newTestHandler(t, stubRepo{})
	h.SetRateLimiter(ratelimit.New(redis.NewClient(&redis.Options{Addr: mr.Addr()}), "test"))

	for i := 0; i < 10; i++ {
		rec := loginVia(t, h, "203.0.113.9:4000", "198.51.100."+strconv.Itoa(i+1))
		if rec.Code == http.StatusTooManyRequests {
			t.Fatalf("attempt %d limited too early", i)
		}
	}
	if rec := loginVia(t, h, "203.0.113.9:4000", "198.51.100.200"); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("11th attempt with a fresh spoofed hop = %d, want 429", rec.Code)
	}
	if !mr.Exists("app:test:rl:login:203.0.113.9|a@example.com") {
		t.Fatalf("login bucket not keyed on the peer: %v", mr.Keys())
	}
}

// Behind a trusted proxy the limiter keys on the right-most untrusted hop,
// not on a client-prepended entry.
func TestLoginRateLimitUsesTrustedProxyHop(t *testing.T) {
	mr := miniredis.RunT(t)
	h := newTestHandler(t, stubRepo{})
	h.SetRateLimiter(ratelimit.New(redis.NewClient(&redis.Options{Addr: mr.Addr()}), "test"))

	_ = loginVia(t, h, "10.0.0.2:41000", "6.6.6.6, 198.51.100.7, 172.18.0.4")
	if !mr.Exists("app:test:rl:login:198.51.100.7|a@example.com") {
		t.Fatalf("login bucket not keyed on the client hop: %v", mr.Keys())
	}
	for _, k := range mr.Keys() {
		if strings.Contains(k, "6.6.6.6") || strings.Contains(k, "10.0.0.2") {
			t.Fatalf("unexpected bucket %q", k)
		}
	}
}

func TestSessionMetaUsesResolvedIP(t *testing.T) {
	res, err := clientip.NewResolver(nil)
	if err != nil {
		t.Fatal(err)
	}
	var got string
	h := clientip.Middleware(res)(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		got = sessionMeta(r).IP
	}))
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	req.RemoteAddr = "203.0.113.9:4000"
	req.Header.Set("X-Forwarded-For", "1.2.3.4")
	h.ServeHTTP(httptest.NewRecorder(), req)
	if got != "203.0.113.9" {
		t.Fatalf("session IP = %q, want the untrusted peer", got)
	}
}
