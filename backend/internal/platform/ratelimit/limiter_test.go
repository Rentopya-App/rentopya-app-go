package ratelimit_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/ratelimit"
	"github.com/redis/go-redis/v9"
)

func TestLoginLimit(t *testing.T) {
	t.Parallel()
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	lim := ratelimit.New(rdb, "test")
	ctx := context.Background()

	for i := 0; i < 10; i++ {
		ok, _ := lim.AllowLogin(ctx, "1.1.1.1", "a@example.com")
		if !ok {
			t.Fatalf("attempt %d should be allowed", i+1)
		}
	}
	ok, retry := lim.AllowLogin(ctx, "1.1.1.1", "a@example.com")
	if ok {
		t.Fatal("expected lockout")
	}
	if retry <= 0 {
		t.Fatal("expected retry-after")
	}
	ok, _ = lim.AllowLogin(ctx, "1.1.1.1", "b@example.com")
	if !ok {
		t.Fatal("different email should not share the bucket")
	}
}

func TestNilRedisAllows(t *testing.T) {
	t.Parallel()
	lim := ratelimit.New(nil, "test")
	ok, _ := lim.AllowRegister(context.Background(), "10.0.0.1")
	if !ok {
		t.Fatal("nil redis must fail open")
	}
}

func TestGenericAllow(t *testing.T) {
	t.Parallel()
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	lim := ratelimit.New(rdb, "test")
	ctx := context.Background()
	for i := 0; i < 3; i++ {
		if ok, _ := lim.Allow(ctx, "ai_msg", "u1", 3, time.Minute); !ok {
			t.Fatalf("hit %d should be allowed", i+1)
		}
	}
	ok, retry := lim.Allow(ctx, "ai_msg", "u1", 3, time.Minute)
	if ok || retry <= 0 || retry > time.Minute {
		t.Fatalf("expected limit with retry <= window, got ok=%v retry=%v", ok, retry)
	}
	if ok, _ := lim.Allow(ctx, "ai_msg", "u2", 3, time.Minute); !ok {
		t.Fatal("other subject must have its own bucket")
	}
	if ok, _ := lim.Allow(ctx, "ai_voice", "u1", 3, time.Minute); !ok {
		t.Fatal("other action must have its own bucket")
	}
	mr.FastForward(61 * time.Second)
	if ok, _ := lim.Allow(ctx, "ai_msg", "u1", 3, time.Minute); !ok {
		t.Fatal("window must reset")
	}
}

// TEC-1170: one IP cannot spray logins over many accounts.
func TestLoginLimitPerIPAcrossEmails(t *testing.T) {
	t.Parallel()
	mr := miniredis.RunT(t)
	lim := ratelimit.New(redis.NewClient(&redis.Options{Addr: mr.Addr()}), "test")
	ctx := context.Background()
	for i := 0; i < 100; i++ {
		if ok, _ := lim.AllowLogin(ctx, "1.1.1.1", fmt.Sprintf("u%d@example.com", i)); !ok {
			t.Fatalf("attempt %d should be allowed", i+1)
		}
	}
	if ok, _ := lim.AllowLogin(ctx, "1.1.1.1", "fresh@example.com"); ok {
		t.Fatal("expected the per-IP login limit")
	}
	if ok, _ := lim.AllowLogin(ctx, "2.2.2.2", "fresh@example.com"); !ok {
		t.Fatal("another IP must not share the bucket")
	}
}

// TEC-1170: failures (not attempts) of one account lock it across IPs.
func TestLoginFailureLimitPerAccount(t *testing.T) {
	t.Parallel()
	mr := miniredis.RunT(t)
	lim := ratelimit.New(redis.NewClient(&redis.Options{Addr: mr.Addr()}), "test")
	ctx := context.Background()
	for i := 0; i < 29; i++ {
		lim.RecordLoginFailure(ctx, "Victim@Example.com")
	}
	if ok, _ := lim.AllowLogin(ctx, "9.9.9.9", "victim@example.com"); !ok {
		t.Fatal("29 failures must still allow a login")
	}
	lim.RecordLoginFailure(ctx, "victim@example.com")
	ok, retry := lim.AllowLogin(ctx, "8.8.8.8", " victim@example.com ")
	if ok || retry <= 0 {
		t.Fatalf("30 failures must lock the account: ok=%v retry=%v", ok, retry)
	}
	if ok, _ := lim.AllowLogin(ctx, "8.8.8.8", "other@example.com"); !ok {
		t.Fatal("another account must not be locked")
	}
}

// TEC-1170: reset codes to one address are bounded across IPs.
func TestForgotPasswordLimitPerEmail(t *testing.T) {
	t.Parallel()
	mr := miniredis.RunT(t)
	lim := ratelimit.New(redis.NewClient(&redis.Options{Addr: mr.Addr()}), "test")
	ctx := context.Background()
	for i := 0; i < 10; i++ {
		if ok, _ := lim.AllowForgotPassword(ctx, fmt.Sprintf("10.0.0.%d", i), "a@example.com"); !ok {
			t.Fatalf("request %d should be allowed", i+1)
		}
	}
	if ok, _ := lim.AllowForgotPassword(ctx, "10.0.1.1", "a@example.com"); ok {
		t.Fatal("expected the per-email forgot limit")
	}
}
