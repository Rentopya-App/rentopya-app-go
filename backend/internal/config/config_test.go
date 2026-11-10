package config

import (
	"strings"
	"testing"
	"time"
)

func validProdConfig() Config {
	var c Config
	c.App.Name = "app"
	c.App.Env = "production"
	c.HTTP.Addr = ":8080"
	c.DB.Host, c.DB.User, c.DB.Name = "db", "u", "n"
	c.DB.Password = "real-db-password"
	c.Redis.Addr = "redis:6379"
	c.Redis.Password = "real-redis-password"
	c.Queue.Concurrency = 1
	c.JWT.AccessTTL, c.JWT.RefreshTTL = time.Minute, time.Hour
	c.JWT.AccessSecret = strings.Repeat("a", 40)
	c.JWT.RefreshSecret = strings.Repeat("b", 40)
	c.Encryption.Key = strings.Repeat("k", 32)
	c.Auth.AdapterSecret = strings.Repeat("s", 40)
	c.Centrifugo.Enabled = true
	c.Centrifugo.APIKey = "real-api-key"
	c.Centrifugo.TokenHMAC = "real-hmac"
	return c
}

func TestValidateRejectsDefaultSecretsInProduction(t *testing.T) {
	if err := validProdConfig().validate(); err != nil {
		t.Fatalf("valid config rejected: %v", err)
	}
	mutations := map[string]func(*Config){
		"default encryption key": func(c *Config) { c.Encryption.Key = defaultEncryptionKey },
		"empty encryption key":   func(c *Config) { c.Encryption.Key = "" },
		"default adapter secret": func(c *Config) { c.Auth.AdapterSecret = defaultAdapterSecret },
		"default centrifugo":     func(c *Config) { c.Centrifugo.TokenHMAC = defaultCentrifugoTokenHMAC },
		"short jwt secret":       func(c *Config) { c.JWT.AccessSecret = "short" },
	}
	for name, mut := range mutations {
		c := validProdConfig()
		mut(&c)
		if err := c.validate(); err == nil {
			t.Fatalf("%s: expected validation error", name)
		}
	}
	dev := validProdConfig()
	dev.App.Env = "development"
	dev.Encryption.Key = defaultEncryptionKey
	if err := dev.validate(); err != nil {
		t.Fatalf("development must accept defaults: %v", err)
	}
}

func TestValidateAppEnv(t *testing.T) {
	staging := validProdConfig()
	staging.App.Env = "staging"
	if err := staging.validate(); err != nil {
		t.Fatalf("staging with real secrets must pass: %v", err)
	}
	staging.Encryption.Key = defaultEncryptionKey
	if err := staging.validate(); err == nil {
		t.Fatal("staging must refuse the example secrets like production")
	}
	bad := validProdConfig()
	bad.App.Env = "prod"
	if err := bad.validate(); err == nil || !strings.Contains(err.Error(), "APP_ENV") {
		t.Fatalf("unknown APP_ENV must be rejected, got %v", err)
	}
}

func TestParseReviewAccounts(t *testing.T) {
	got := parseReviewAccounts(" Review@Example.com:246810 , bad, short@x.io:123, nocolon@x.io ,x:123456")
	if len(got) != 1 || got["review@example.com"] != "246810" {
		t.Fatalf("got %v", got)
	}
	if len(parseReviewAccounts("")) != 0 {
		t.Fatal("empty must disable")
	}
}

func TestValidateSMTP(t *testing.T) {
	for _, mode := range []string{"", SMTPTLSAuto, SMTPTLSStartTLS, SMTPTLSImplicit} {
		c := validProdConfig()
		c.SMTP.TLSMode = mode
		if err := c.validate(); err != nil {
			t.Errorf("TLSMode %q rejected in production: %v", mode, err)
		}
	}
	bad := validProdConfig()
	bad.SMTP.TLSMode = "bogus"
	if err := bad.validate(); err == nil {
		t.Error("invalid TLSMode accepted")
	}
	plain := validProdConfig()
	plain.SMTP.TLSMode = SMTPTLSNone
	if err := plain.validate(); err == nil {
		t.Error("SMTP_TLS=none accepted in production")
	}
	plain.App.Env = "staging"
	if err := plain.validate(); err != nil {
		t.Errorf("SMTP_TLS=none must stay possible in staging (mail catcher): %v", err)
	}

	insecure := validProdConfig()
	insecure.SMTP.TLSInsecureSkipVerify = true
	if err := insecure.validate(); err == nil {
		t.Error("SMTP_TLS_INSECURE_SKIP_VERIFY accepted in production")
	}
	insecure.App.Env = "staging"
	if err := insecure.validate(); err == nil {
		t.Error("SMTP_TLS_INSECURE_SKIP_VERIFY accepted in staging")
	}
	insecure.App.Env = "development"
	if err := insecure.validate(); err != nil {
		t.Errorf("SMTP_TLS_INSECURE_SKIP_VERIFY must be allowed in development: %v", err)
	}
}

func TestLoadSMTPTLSDefaults(t *testing.T) {
	t.Setenv("SMTP_TLS", "")
	t.Setenv("SMTP_TIMEOUT", "")
	t.Setenv("APP_ENV", "development")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.SMTP.TLSMode != SMTPTLSNone {
		t.Errorf("development default SMTP_TLS = %q, want none (local mail catcher)", cfg.SMTP.TLSMode)
	}
	if cfg.SMTP.Timeout != 10*time.Second {
		t.Errorf("default SMTP_TIMEOUT = %v, want 10s", cfg.SMTP.Timeout)
	}
	t.Setenv("SMTP_TLS", "STARTTLS")
	if cfg, err = Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.SMTP.TLSMode != SMTPTLSStartTLS {
		t.Errorf("SMTP_TLS normalized to %q, want starttls", cfg.SMTP.TLSMode)
	}
}
