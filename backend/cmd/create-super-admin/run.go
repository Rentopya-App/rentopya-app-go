package main

import (
	"context"
	"crypto/rand"
	"errors"
	"flag"
	"fmt"
	"io"
	"math/big"
	"net/mail"
	"os"
	"strconv"
	"strings"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/auth/model"
	authrepo "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/auth/repository"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/password"
)

// generatedPasswordLength is long enough that the generated secret is far
// stronger than the sign-up minimum (about 119 bits over the alphabet below).
const generatedPasswordLength = 20

// passwordAlphabet avoids look-alike characters and shell metacharacters so
// the printed password can be copied safely.
const passwordAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_.:"

type options struct {
	Email            string
	Password         string
	Name             string
	Surname          string
	GeneratePassword bool
	ResetPassword    bool
}

// store is the part of the auth repository the command needs.
type store interface {
	FindUserByEmail(ctx context.Context, email string) (model.User, error)
	UpsertSuperAdmin(ctx context.Context, email, name, surname, hash string) (model.User, bool, error)
}

// parseOptions reads flags, falls back to SA_* environment variables, and
// validates the result. It never supplies a default email or password.
func parseOptions(args []string, getenv func(string) string, errOut io.Writer) (options, error) {
	fs := flag.NewFlagSet("create-super-admin", flag.ContinueOnError)
	fs.SetOutput(errOut)
	var o options
	fs.StringVar(&o.Email, "email", "", "super admin email (required; or SA_EMAIL)")
	fs.StringVar(&o.Password, "password", "", "super admin password, sign-up policy: min 8, upper+lower+digit (or SA_PASSWORD; prefer the env var to keep it out of the process list)")
	fs.BoolVar(&o.GeneratePassword, "generate-password", false, "generate a strong password and print it once to stdout")
	fs.BoolVar(&o.ResetPassword, "reset-password", false, "overwrite the password of an existing user (or SA_RESET_PASSWORD=true)")
	fs.StringVar(&o.Name, "name", "", "first name (or SA_NAME; default Platform)")
	fs.StringVar(&o.Surname, "surname", "", "last name (or SA_SURNAME; default Admin)")
	if err := fs.Parse(args); err != nil {
		return options{}, err
	}
	if fs.NArg() > 0 {
		return options{}, fmt.Errorf("unexpected arguments: %s", strings.Join(fs.Args(), " "))
	}

	o.Email = firstNonEmpty(o.Email, getenv("SA_EMAIL"))
	o.Password = firstNonEmpty(o.Password, getenv("SA_PASSWORD"))
	o.Name = firstNonEmpty(o.Name, getenv("SA_NAME"), "Platform")
	o.Surname = firstNonEmpty(o.Surname, getenv("SA_SURNAME"), "Admin")
	if !o.ResetPassword {
		if v := strings.TrimSpace(getenv("SA_RESET_PASSWORD")); v != "" {
			b, err := strconv.ParseBool(v)
			if err != nil {
				return options{}, fmt.Errorf("SA_RESET_PASSWORD: %q is not a boolean", v)
			}
			o.ResetPassword = b
		}
	}

	o.Email = strings.ToLower(strings.TrimSpace(o.Email))
	if o.Email == "" {
		return options{}, errors.New("email is required (-email or SA_EMAIL); there is no default")
	}
	if addr, err := mail.ParseAddress(o.Email); err != nil || addr.Address != o.Email {
		return options{}, fmt.Errorf("email %q is not a valid address", o.Email)
	}

	switch {
	case o.Password != "" && o.GeneratePassword:
		return options{}, errors.New("-generate-password cannot be combined with -password / SA_PASSWORD")
	case o.Password == "" && !o.GeneratePassword:
		return options{}, errors.New("password is required: set SA_PASSWORD (or -password), or pass -generate-password; there is no default")
	case o.Password != "":
		// Same policy the API enforces on sign-up and password changes.
		if err := password.ValidatePassword(o.Password); err != nil {
			return options{}, err
		}
	}
	return o, nil
}

// run creates the super admin, or updates an existing user only when
// ResetPassword is set. A generated password is written to out exactly once.
func run(ctx context.Context, o options, s store, out io.Writer) error {
	existing, err := s.FindUserByEmail(ctx, o.Email)
	switch {
	case err == nil:
		if !o.ResetPassword {
			return fmt.Errorf("user %s already exists; pass -reset-password (or SA_RESET_PASSWORD=true) to overwrite its password and grant super_admin", existing.Email)
		}
	case errors.Is(err, authrepo.ErrNotFound):
	default:
		return fmt.Errorf("lookup user: %w", err)
	}

	plain := o.Password
	if o.GeneratePassword {
		plain, err = generatePassword()
		if err != nil {
			return err
		}
	}
	hash, err := password.Hash(plain)
	if err != nil {
		return fmt.Errorf("password: %w", err)
	}

	user, created, err := s.UpsertSuperAdmin(ctx, o.Email, o.Name, o.Surname, hash)
	if err != nil {
		return err
	}

	action := "updated (password reset)"
	if created {
		action = "created"
	}
	_, _ = fmt.Fprintf(out, "super_admin %s successfully\n", action)
	_, _ = fmt.Fprintf(out, "  uuid:   %s\n", user.UUID)
	_, _ = fmt.Fprintf(out, "  email:  %s\n", user.Email)
	_, _ = fmt.Fprintf(out, "  name:   %s %s\n", user.Name, user.Surname)
	_, _ = fmt.Fprintf(out, "  status: %s\n", user.Status)
	_, _ = fmt.Fprintf(out, "  role:   super_admin\n")
	if o.GeneratePassword {
		_, _ = fmt.Fprintf(out, "  password (generated, shown once; store it now): %s\n", plain)
	}
	return nil
}

// generatePassword returns a random password from crypto/rand that satisfies
// password.ValidatePassword.
func generatePassword() (string, error) {
	limit := big.NewInt(int64(len(passwordAlphabet)))
	for range 100 {
		var b strings.Builder
		for range generatedPasswordLength {
			n, err := rand.Int(rand.Reader, limit)
			if err != nil {
				return "", fmt.Errorf("generate password: %w", err)
			}
			b.WriteByte(passwordAlphabet[n.Int64()])
		}
		if s := b.String(); password.ValidatePassword(s) == nil {
			return s, nil
		}
	}
	return "", errors.New("generate password: could not satisfy the password policy")
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v = strings.TrimSpace(v); v != "" {
			return v
		}
	}
	return ""
}

func fatal(err error) {
	if errors.Is(err, flag.ErrHelp) {
		os.Exit(2)
	}
	fatalf("%v", err)
}

func fatalf(format string, args ...any) {
	_, _ = fmt.Fprintf(os.Stderr, "create-super-admin: "+format+"\n", args...)
	os.Exit(1)
}
