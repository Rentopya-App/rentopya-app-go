package main

import (
	"bytes"
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/auth/model"
	authrepo "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/auth/repository"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/password"
)

func envOf(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestParseOptionsHasNoDefaultCredentials(t *testing.T) {
	_, err := parseOptions(nil, envOf(nil), io.Discard)
	if err == nil || !strings.Contains(err.Error(), "email is required") {
		t.Fatalf("bare run: want email required error, got %v", err)
	}
	_, err = parseOptions([]string{"-email", "ops@rentopya.test"}, envOf(nil), io.Discard)
	if err == nil || !strings.Contains(err.Error(), "password is required") {
		t.Fatalf("no password: want password required error, got %v", err)
	}
}

func TestParseOptionsRejectsWeakPasswords(t *testing.T) {
	for _, weak := range []string{"short1A", "alllowercase1", "ALLUPPERCASE1", "NoDigitsHere"} {
		_, err := parseOptions([]string{"-email", "ops@rentopya.test", "-password", weak}, envOf(nil), io.Discard)
		if !errors.Is(err, password.ErrInvalidPassword) {
			t.Errorf("password %q: want ErrInvalidPassword, got %v", weak, err)
		}
		_, err = parseOptions([]string{"-email", "ops@rentopya.test"}, envOf(map[string]string{"SA_PASSWORD": weak}), io.Discard)
		if !errors.Is(err, password.ErrInvalidPassword) {
			t.Errorf("SA_PASSWORD %q: want ErrInvalidPassword, got %v", weak, err)
		}
	}
}

func TestParseOptionsEnvFallbackAndFlags(t *testing.T) {
	o, err := parseOptions(nil, envOf(map[string]string{
		"SA_EMAIL": " Ops@Rentopya.Test ", "SA_PASSWORD": "Str0ngPassword", "SA_RESET_PASSWORD": "true",
	}), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	if o.Email != "ops@rentopya.test" || o.Password != "Str0ngPassword" || !o.ResetPassword {
		t.Fatalf("env fallback: %+v", o)
	}
	if o.Name != "Platform" || o.Surname != "Admin" {
		t.Fatalf("name defaults: %+v", o)
	}

	o, err = parseOptions([]string{"-email", "a@b.test", "-generate-password", "-name", "Ada", "-surname", "Admin"},
		envOf(map[string]string{"SA_EMAIL": "other@b.test"}), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	if o.Email != "a@b.test" || !o.GeneratePassword || o.ResetPassword || o.Name != "Ada" {
		t.Fatalf("flags win over env: %+v", o)
	}

	cases := []struct {
		name string
		args []string
		env  map[string]string
		want string
	}{
		{"invalid email", []string{"-email", "not-an-email", "-generate-password"}, nil, "not a valid address"},
		{"generate with password", []string{"-email", "a@b.test", "-generate-password"}, map[string]string{"SA_PASSWORD": "Str0ngPassword"}, "cannot be combined"},
		{"bad reset env", []string{"-email", "a@b.test", "-generate-password"}, map[string]string{"SA_RESET_PASSWORD": "maybe"}, "not a boolean"},
		{"stray args", []string{"-email", "a@b.test", "-generate-password", "extra"}, nil, "unexpected arguments"},
	}
	for _, tc := range cases {
		_, err := parseOptions(tc.args, envOf(tc.env), io.Discard)
		if err == nil || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: want %q, got %v", tc.name, tc.want, err)
		}
	}
}

func TestGeneratePasswordMeetsPolicyAndIsRandom(t *testing.T) {
	seen := map[string]bool{}
	for range 50 {
		p, err := generatePassword()
		if err != nil {
			t.Fatal(err)
		}
		if len(p) != generatedPasswordLength {
			t.Fatalf("length %d", len(p))
		}
		if err := password.ValidatePassword(p); err != nil {
			t.Fatalf("generated password fails policy: %v", err)
		}
		if seen[p] {
			t.Fatal("generated password repeated")
		}
		seen[p] = true
	}
}

type fakeStore struct {
	existing *model.User
	upserted bool
	hash     string
}

func (f *fakeStore) FindUserByEmail(_ context.Context, email string) (model.User, error) {
	if f.existing != nil && f.existing.Email == email {
		return *f.existing, nil
	}
	return model.User{}, authrepo.ErrNotFound
}

func (f *fakeStore) UpsertSuperAdmin(_ context.Context, email, name, surname, hash string) (model.User, bool, error) {
	f.upserted = true
	f.hash = hash
	return model.User{UUID: uuid.New(), Email: email, Name: name, Surname: surname, Status: "active"}, f.existing == nil, nil
}

func TestRunGeneratesPasswordAndPrintsItOnce(t *testing.T) {
	s := &fakeStore{}
	var out bytes.Buffer
	err := run(context.Background(), options{Email: "a@b.test", Name: "P", Surname: "A", GeneratePassword: true}, s, &out)
	if err != nil {
		t.Fatal(err)
	}
	const marker = "password (generated, shown once; store it now): "
	if strings.Count(out.String(), marker) != 1 {
		t.Fatalf("output must show the generated password exactly once:\n%s", out.String())
	}
	line := out.String()[strings.Index(out.String(), marker)+len(marker):]
	plain := strings.TrimSpace(strings.SplitN(line, "\n", 2)[0])
	ok, err := password.Verify(s.hash, plain)
	if err != nil || !ok {
		t.Fatalf("printed password does not match the stored hash (ok=%v err=%v)", ok, err)
	}
}

func TestRunDoesNotPrintAGivenPassword(t *testing.T) {
	s := &fakeStore{}
	var out bytes.Buffer
	if err := run(context.Background(), options{Email: "a@b.test", Password: "Str0ngPassword", Name: "P", Surname: "A"}, s, &out); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(out.String(), "Str0ngPassword") {
		t.Fatal("a caller-supplied password must not be echoed")
	}
}

func TestRunRefusesToOverwriteExistingUser(t *testing.T) {
	s := &fakeStore{existing: &model.User{ID: 1, Email: "a@b.test"}}
	err := run(context.Background(), options{Email: "a@b.test", Password: "Str0ngPassword", Name: "P", Surname: "A"}, s, io.Discard)
	if err == nil || !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("want already exists error, got %v", err)
	}
	if s.upserted {
		t.Fatal("existing user's password was overwritten without -reset-password")
	}

	var out bytes.Buffer
	err = run(context.Background(), options{Email: "a@b.test", Password: "Str0ngPassword", Name: "P", Surname: "A", ResetPassword: true}, s, &out)
	if err != nil {
		t.Fatal(err)
	}
	if !s.upserted || !strings.Contains(out.String(), "password reset") {
		t.Fatalf("reset: upserted=%v out=%s", s.upserted, out.String())
	}
}
