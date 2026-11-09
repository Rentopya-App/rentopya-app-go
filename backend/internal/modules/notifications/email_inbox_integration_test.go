package notifications_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/database/db"
	branchusecase "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/branches/usecase"
	notifmodule "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/notifications"
	notifhandler "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/notifications/handler"
	notifmodel "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/notifications/model"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/notifications/providers"
	notifusecase "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/notifications/usecase"
	orgmodel "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/organizations/model"
	orgrepository "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/organizations/repository"
	orgusecase "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/organizations/usecase"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/crypto"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/jwt"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/orgctx"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// mailbox records the e-mails the provider was asked to send.
type mailbox struct{ sent []db.Notification }

func (m *mailbox) Channel() string { return notifmodel.ChannelEmail }

func (m *mailbox) Deliver(_ context.Context, n db.Notification, _ *uuid.UUID) (providers.DeliveryResult, error) {
	m.sent = append(m.sent, n)
	return providers.DeliveryResult{Status: notifmodel.StatusSent, Provider: "test"}, nil
}

// TestUnverifiedUserCannotReadVerificationCode (TEC-1166): an e-mail row
// never shows in the inbox (list, count, detail, action redeem, tenant
// inbox), and a security e-mail is sealed on the row: the code reaches the
// mailbox only. Runs with TEST_DATABASE_URL.
func TestUnverifiedUserCannotReadVerificationCode(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	q := db.New(pool)
	suffix := uuid.NewString()[:8]

	// Not verified: email_verified_at stays NULL.
	user, err := q.CreateUser(ctx, db.CreateUserParams{
		Email: "unverified-" + suffix + "@example.test", PasswordHash: "x", Name: "Una", Surname: "Test", Status: "active",
	})
	if err != nil {
		t.Fatal(err)
	}
	orgSvc := orgusecase.New(orgrepository.NewPostgres(pool, q), branchusecase.NewOrganizationHooks(nil))
	org, err := orgSvc.CreateOrganization(ctx, orgmodel.CreateOrganizationInput{Name: "Inbox " + suffix, OwnerUserID: user.ID})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		bg := context.Background()
		_, _ = pool.Exec(bg, "DELETE FROM notifications WHERE user_id = $1", user.ID)
		_, _ = pool.Exec(bg, "DELETE FROM organizations WHERE id = $1", org.ID)
		_, _ = pool.Exec(bg, "DELETE FROM users WHERE id = $1", user.ID)
	})

	fc, err := crypto.NewFieldCipher("0123456789abcdef0123456789abcdef")
	if err != nil {
		t.Fatal(err)
	}
	sealer, err := fc.Sealer(notifusecase.SealPurpose)
	if err != nil {
		t.Fatal(err)
	}
	box := &mailbox{}
	svc := notifusecase.New(q, nil, []providers.Provider{providers.InappProvider{}, box}, nil).WithSealer(sealer)
	svc.WithActionSigner("test-action-secret", 0)

	const code = "731942"
	uid, email := user.ID, user.Email
	link := "https://app.example/verify#" + code
	rows, err := svc.Enqueue(ctx, notifmodel.EnqueueInput{
		UserID: &uid, Channels: []string{notifmodel.ChannelEmail}, Recipient: &email, ActionURL: &link,
		TemplateCode: "auth.email_verification", SecurityEmail: true,
		TemplateVars: map[string]string{"name": "Una", "code": code, "link": link},
		SecretVars:   []string{"code"},
	})
	if err != nil || len(rows) != 1 {
		t.Fatalf("enqueue = %v, %v", rows, err)
	}
	emailRow := rows[0].UUID
	// An ordinary e-mail of the same user (not sealed) stays out too.
	plain, err := svc.Enqueue(ctx, notifmodel.EnqueueInput{
		UserID: &uid, Channels: []string{notifmodel.ChannelEmail}, Recipient: &email,
		Title: "plain mail " + code, Body: "plain body " + code,
	})
	if err != nil || len(plain) != 1 {
		t.Fatalf("plain enqueue = %v, %v", plain, err)
	}
	if _, err := svc.Enqueue(ctx, notifmodel.EnqueueInput{
		UserID: &uid, Channels: []string{notifmodel.ChannelInapp}, Title: "inbox", Body: "hello",
	}); err != nil {
		t.Fatal(err)
	}

	// The mailbox got the real code (delivery opened the sealed content).
	if len(box.sent) != 2 || !strings.Contains(box.sent[0].Body+box.sent[0].Title, code) {
		t.Fatalf("mailbox = %+v", box.sent)
	}
	// The row keeps neither the code nor the ciphertext once delivered.
	var rowJSON string
	var sealedLeft bool
	if err := pool.QueryRow(ctx,
		"SELECT row_to_json(n)::text, sealed_content IS NOT NULL FROM notifications n WHERE uuid = $1", emailRow,
	).Scan(&rowJSON, &sealedLeft); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(rowJSON, code) || sealedLeft {
		t.Fatalf("delivered security row = %s (sealed left %v)", rowJSON, sealedLeft)
	}

	tokens, err := jwt.NewManager("test-access-secret-0123456789abcdef", time.Minute, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	h := notifhandler.New(svc)
	loader := readerLoader{user.Uuid: user.ID}
	notifmodule.RegisterRoutes(mux, h, tokens, loader)
	notifmodule.RegisterTenantRoutes(mux, h, tokens, loader, orgSvc)
	access, _, err := tokens.IssueAccess(jwt.AccessInput{UserID: user.Uuid})
	if err != nil {
		t.Fatal(err)
	}
	get := func(path, orgRef string) (int, string) {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", "Bearer "+access)
		if orgRef != "" {
			req.Header.Set(orgctx.HeaderName, orgRef)
		}
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)
		return rr.Code, rr.Body.String()
	}
	exp := strconv.FormatInt(time.Now().Add(time.Hour).Unix(), 10)
	for _, tc := range []struct {
		path, org string
		status    int
		contains  string
	}{
		{"/v1/notifications", "", http.StatusOK, `"total":1`},
		{"/v1/notifications?channel=email", "", http.StatusOK, `"total":0`},
		{"/v1/notifications?q=" + code, "", http.StatusOK, `"total":0`},
		{"/v1/notifications/unread-count", "", http.StatusOK, `"count":1`},
		{"/v1/tenant/notifications", org.Slug, http.StatusOK, `"total":1`},
		{"/v1/tenant/notifications?channel=email", org.Slug, http.StatusOK, `"total":0`},
		{"/v1/tenant/notifications/unread-count", org.Slug, http.StatusOK, `"count":1`},
		{"/v1/notifications/" + emailRow.String(), "", http.StatusNotFound, ""},
		{"/v1/notifications/" + plain[0].UUID.String(), "", http.StatusNotFound, ""},
		{"/v1/notifications/" + emailRow.String() + "/action?exp=" + exp + "&sig=x", "", http.StatusNotFound, ""},
	} {
		status, body := get(tc.path, tc.org)
		if status != tc.status || !strings.Contains(body, tc.contains) {
			t.Fatalf("GET %s = %d %s", tc.path, status, body)
		}
		if strings.Contains(body, code) {
			t.Fatalf("GET %s leaks the code: %s", tc.path, body)
		}
	}
}
