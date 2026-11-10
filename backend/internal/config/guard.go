package config

import (
	"errors"
	"fmt"
	"strings"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/envguard"
)

// IsLocal reports whether the process runs with development defaults
// (development or test). Staging and production get the full secret guard.
func (a AppConfig) IsLocal() bool {
	return a.Env == envguard.Development || a.Env == envguard.Test
}

// validateAppEnv refuses an unknown APP_ENV, so a typo ("prod") can never
// quietly run with half the production checks. env is already normalized
// (envguard.Normalize: trimmed, lower-cased, empty = development).
func validateAppEnv(env string) error {
	if envguard.Valid(env) {
		return nil
	}
	hint := map[string]string{
		"dev": envguard.Development, "local": envguard.Development,
		"prod": envguard.Production, "live": envguard.Production,
		"stage": envguard.Staging, "stg": envguard.Staging,
	}[env]
	msg := fmt.Sprintf("config: APP_ENV must be development, staging or production (test for test runs), got %q", env)
	if hint != "" {
		msg += fmt.Sprintf(" (did you mean %q?)", hint)
	}
	return errors.New(msg)
}

// Public development values: Load's fallbacks, .env.example and
// compose.local.yml. secretGuard refuses every one of them outside
// development/test.
const (
	defaultDBPassword          = "change_me"
	defaultS3AccessKey         = "storageadmin"
	defaultS3SecretKey         = "storageadmin"
	exampleS3SecretKey         = "change_me_storage"
	legacyS3Credential         = "minioadmin"
	defaultJWTAccessSecret     = "app-dev-access-secret-change-me-32b"
	defaultJWTRefreshSecret    = "app-dev-refresh-secret-change-me-32b"
	defaultAdapterSecret       = "app-dev-auth-adapter-secret-change-me"
	defaultEncryptionKey       = "app-dev-encryption-key-32bytes!!"
	defaultCentrifugoAPIKey    = "app-centrifugo-api-key-change-me"
	defaultCentrifugoTokenHMAC = "app-centrifugo-token-hmac-change-me"
	defaultMeiliMasterKey      = "app-dev-meili-master-key-change-me"
)

// managedSecret is a `secret:` key of deploy/env/schema that the backend
// reads. TestManagedSecretsMatchSchema keeps this table and the schema equal,
// so a secret added to the schema cannot skip the guard.
type managedSecret struct {
	Key   string
	Value func(Config) string
	// Defaults are refused outside development/test. An empty value is
	// always refused when the secret applies.
	Defaults []string
	// Applies limits the check to configs that use the secret (nil = always).
	Applies func(Config) bool
}

var managedSecrets = []managedSecret{
	{Key: "DB_PASSWORD", Value: func(c Config) string { return c.DB.Password }, Defaults: []string{defaultDBPassword}},
	// Development Redis has no password (empty is its default).
	{Key: "REDIS_PASSWORD", Value: func(c Config) string { return c.Redis.Password }},
	{
		Key: "S3_ACCESS_KEY", Value: func(c Config) string { return c.Storage.active().AccessKey },
		Defaults: []string{defaultS3AccessKey, legacyS3Credential}, Applies: usesObjectStore,
	},
	{
		Key: "S3_SECRET_KEY", Value: func(c Config) string { return c.Storage.active().SecretKey },
		Defaults: []string{defaultS3SecretKey, exampleS3SecretKey, legacyS3Credential}, Applies: usesObjectStore,
	},
	{Key: "JWT_ACCESS_SECRET", Value: func(c Config) string { return c.JWT.AccessSecret }, Defaults: []string{defaultJWTAccessSecret}},
	{Key: "JWT_REFRESH_SECRET", Value: func(c Config) string { return c.JWT.RefreshSecret }, Defaults: []string{defaultJWTRefreshSecret}},
	{Key: "AUTH_ADAPTER_SECRET", Value: func(c Config) string { return c.Auth.AdapterSecret }, Defaults: []string{defaultAdapterSecret}},
	// Seals integration credentials, OAuth secrets and personal data at rest:
	// a public key would expose all of them.
	{Key: "APP_ENCRYPTION_KEY", Value: func(c Config) string { return c.Encryption.Key }, Defaults: []string{defaultEncryptionKey}},
	{
		Key: "CENTRIFUGO_API_KEY", Value: func(c Config) string { return c.Centrifugo.APIKey },
		Defaults: []string{defaultCentrifugoAPIKey}, Applies: func(c Config) bool { return c.Centrifugo.Enabled },
	},
	{
		Key: "CENTRIFUGO_TOKEN_HMAC_SECRET", Value: func(c Config) string { return c.Centrifugo.TokenHMAC },
		Defaults: []string{defaultCentrifugoTokenHMAC}, Applies: func(c Config) bool { return c.Centrifugo.Enabled },
	},
	{
		Key: "MEILI_MASTER_KEY", Value: func(c Config) string { return c.Search.MeiliKey },
		Defaults: []string{defaultMeiliMasterKey}, Applies: func(c Config) bool { return c.Search.Enabled },
	},
	// The wuzapi admin token creates per-organization WhatsApp sessions; only
	// needed when the gateway is configured (the development fake needs none).
	{
		Key: "WUZAPI_ADMIN_TOKEN", Value: func(c Config) string { return c.WhatsApp.WuzapiAdminToken },
		Applies: func(c Config) bool { return c.WhatsApp.WuzapiBaseURL != "" },
	},
}

func usesObjectStore(c Config) bool {
	return c.Storage.Driver == "minio" || c.Storage.Driver == "s3"
}

// active is the object store the configured driver talks to.
func (s StorageConfig) active() ObjectStoreConfig {
	if s.Driver == "s3" {
		return s.S3
	}
	return s.MinIO
}

// secretGuard refuses empty or public development secrets outside
// development/test and reports every offending key at once.
func (c Config) secretGuard() error {
	if c.App.IsLocal() {
		return nil
	}
	var problems []string
	for _, s := range managedSecrets {
		if s.Applies != nil && !s.Applies(c) {
			continue
		}
		v := s.Value(c)
		switch {
		case v == "":
			problems = append(problems, s.Key+" is required")
		case contains(s.Defaults, v):
			problems = append(problems, s.Key+" still has its public development value")
		}
	}
	if len(problems) == 0 {
		return nil
	}
	return fmt.Errorf("config: refusing to start with APP_ENV=%s: %s (generate production secrets with scripts/prod-env.sh)",
		c.App.Env, strings.Join(problems, "; "))
}

func contains(list []string, v string) bool {
	for _, item := range list {
		if item == v {
			return true
		}
	}
	return false
}
