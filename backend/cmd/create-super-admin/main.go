// Command create-super-admin bootstraps a platform super_admin user.
//
// There are no built-in credentials: the email is required and the password
// either comes from the caller or is generated. The image ships this binary,
// so a bare run must never create an admin with a known password.
//
// Usage (repo root, loads .env):
//
//	make create-super-admin SA_EMAIL=you@example.com                  # generates a password
//	make create-super-admin SA_EMAIL=you@example.com SA_PASSWORD=...  # uses yours
//
// In the production image (no source tree, no make), with the password in the
// environment so it stays out of the process list:
//
//	SA_EMAIL=you@example.com SA_PASSWORD=... /app/create-super-admin
//	/app/create-super-admin -email you@example.com -generate-password
//
// Flags (environment fallback in brackets):
//
//	-email              [SA_EMAIL]     required
//	-password           [SA_PASSWORD]  checked against the sign-up password policy
//	-generate-password                 generate a strong password, printed once to stdout
//	-reset-password     [SA_RESET_PASSWORD=true]  overwrite the password of an existing user
//	-name, -surname     [SA_NAME, SA_SURNAME]     default Platform / Admin
package main

import (
	"context"
	"os"
	"time"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/config"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/database"
	authrepo "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/auth/repository"
)

func main() {
	opts, err := parseOptions(os.Args[1:], os.Getenv, os.Stderr)
	if err != nil {
		fatal(err)
	}

	cfg, err := config.Load()
	if err != nil {
		fatalf("config: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := database.NewPostgresPool(ctx, cfg.DB)
	if err != nil {
		fatalf("database: %v", err)
	}
	defer pool.Close()

	repo := authrepo.NewPostgres(pool, database.NewQueries(pool))
	if err := run(ctx, opts, repo, os.Stdout); err != nil {
		pool.Close()
		fatal(err)
	}
}
