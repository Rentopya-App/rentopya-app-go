package ratelimit

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	defaultWindow = 15 * time.Minute
	loginLimit    = 10
	registerLimit = 5
	forgotLimit   = 5
	resetLimit    = 10
	// loginIPLimit bounds every login attempt of one client IP, whatever
	// the email (credential stuffing across many accounts).
	loginIPLimit = 100
	// loginFailureLimit bounds failed logins (wrong password or 2FA code)
	// of one account from any IP: the ip|email bucket alone lets a botnet
	// guess one account's password or authenticator code without limit.
	loginFailureLimit = 30
	// forgotEmailLimit bounds reset codes sent to one address from any IP
	// (mail bombing, fresh code attempt budgets).
	forgotEmailLimit = 10
)

// Limiter is a Redis INCR + TTL rate limiter. Redis errors fail open.
type Limiter struct {
	rdb *redis.Client
	env string
}

// New creates a limiter. rdb may be nil (all requests allowed).
func New(rdb *redis.Client, appEnv string) *Limiter {
	env := strings.TrimSpace(appEnv)
	if env == "" {
		env = "dev"
	}
	return &Limiter{rdb: rdb, env: env}
}

// AllowLogin limits password login attempts per IP + email.
// AllowLogin counts a login attempt in the ip|email bucket and the
// per-IP bucket, and refuses it while the account has too many recent
// failures (RecordLoginFailure).
func (l *Limiter) AllowLogin(ctx context.Context, ip, email string) (bool, time.Duration) {
	email = strings.ToLower(strings.TrimSpace(email))
	if ok, retry := l.allow(ctx, "login", ip+"|"+email, loginLimit); !ok {
		return false, retry
	}
	if ok, retry := l.allow(ctx, "login_ip", ip, loginIPLimit); !ok {
		return false, retry
	}
	return l.under(ctx, "login_fail", email, loginFailureLimit)
}

// RecordLoginFailure counts a failed login (wrong password or 2FA code) of
// email; AllowLogin refuses the account once the window holds
// loginFailureLimit failures. Successful logins are not counted, so a
// victim is only locked out by actual wrong guesses.
func (l *Limiter) RecordLoginFailure(ctx context.Context, email string) {
	l.allowWindow(ctx, "login_fail", strings.ToLower(strings.TrimSpace(email)), loginFailureLimit, defaultWindow)
}

// AllowRegister limits self-registration per IP.
func (l *Limiter) AllowRegister(ctx context.Context, ip string) (bool, time.Duration) {
	return l.allow(ctx, "register", ip, registerLimit)
}

// AllowForgotPassword limits reset emails per IP + email.
func (l *Limiter) AllowForgotPassword(ctx context.Context, ip, email string) (bool, time.Duration) {
	email = strings.ToLower(strings.TrimSpace(email))
	if ok, retry := l.allow(ctx, "forgot", ip+"|"+email, forgotLimit); !ok {
		return false, retry
	}
	return l.allow(ctx, "forgot_email", email, forgotEmailLimit)
}

// AllowResetPassword limits reset submissions per IP.
func (l *Limiter) AllowResetPassword(ctx context.Context, ip string) (bool, time.Duration) {
	return l.allow(ctx, "reset", ip, resetLimit)
}

// Allow is a generic fixed-window limit: at most limit hits per window for
// (action, subject). Callers pick a stable action name and a subject such as
// a user id. Like the auth limits it fails open when Redis is unavailable.
func (l *Limiter) Allow(ctx context.Context, action, subject string, limit int, window time.Duration) (bool, time.Duration) {
	if limit <= 0 || window <= 0 {
		return true, 0
	}
	return l.allowWindow(ctx, action, subject, limit, window)
}

func (l *Limiter) allow(ctx context.Context, action, subject string, limit int) (bool, time.Duration) {
	return l.allowWindow(ctx, action, subject, limit, defaultWindow)
}

// under reports whether the counter of action/subject is still below limit,
// without counting this call.
func (l *Limiter) under(ctx context.Context, action, subject string, limit int) (bool, time.Duration) {
	if l == nil || l.rdb == nil || strings.TrimSpace(subject) == "" {
		return true, 0
	}
	key := fmt.Sprintf("app:%s:rl:%s:%s", l.env, action, subject)
	n, err := l.rdb.Get(ctx, key).Int64()
	if err != nil || n < int64(limit) {
		return true, 0
	}
	ttl, ttlErr := l.rdb.TTL(ctx, key).Result()
	if ttlErr != nil || ttl < 0 {
		ttl = defaultWindow
	}
	return false, ttl
}

func (l *Limiter) allowWindow(ctx context.Context, action, subject string, limit int, window time.Duration) (bool, time.Duration) {
	if l == nil || l.rdb == nil || strings.TrimSpace(subject) == "" || strings.TrimSpace(subject) == "|" {
		return true, 0
	}
	key := fmt.Sprintf("app:%s:rl:%s:%s", l.env, action, subject)
	n, err := l.rdb.Incr(ctx, key).Result()
	if err != nil {
		return true, 0
	}
	if n == 1 {
		_ = l.rdb.Expire(ctx, key, window).Err()
	}
	if n > int64(limit) {
		ttl, ttlErr := l.rdb.TTL(ctx, key).Result()
		if ttlErr != nil || ttl < 0 {
			ttl = window
		}
		return false, ttl
	}
	return true, 0
}
