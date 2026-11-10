package notifyengine_test

import (
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/database/db"
	accountsusecase "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/integrations/accounts/usecase"
	jobsusecase "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/integrations/jobs/usecase"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/notifyengine/adapters"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/notifyengine/catalog"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/notifyengine/channel"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/notifyengine/model"
	engine "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/notifyengine/usecase"
	smsusecase "github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/modules/sms/usecase"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/crypto"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/integrations"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/mail"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/sms/netgsm"
	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/platform/sms/netgsm/netgsmfake"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// mailbox records e-mails (fails while failing is set).
type mailbox struct {
	mu      sync.Mutex
	sent    []mail.Message
	failing bool
}

func (m *mailbox) Send(_ context.Context, msg mail.Message) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failing {
		return errors.New("smtp down")
	}
	m.sent = append(m.sent, msg)
	return nil
}

func (m *mailbox) count() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.sent)
}

type env struct {
	ctx      context.Context
	pool     *pgxpool.Pool
	q        *db.Queries
	org      int64
	slug     string
	customer int64
	custUUID uuid.UUID
	fake     *netgsmfake.Fake
	runner   *jobsusecase.Runner
	sms      *smsusecase.Service
	mail     *mailbox
	eng      *engine.Engine
}

// newEnv: one organization with a Netgsm account on the fake, the real
// SMS service and runner, a recording mailer and a customer with a mobile
// number and an e-mail address. withSMSAccount=false leaves SMS without an
// account.
func newEnv(t *testing.T, withSMSAccount bool) *env {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	q := db.New(pool)
	suffix := strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	org, err := q.CreateOrganization(ctx, db.CreateOrganizationParams{Slug: "ntf-" + suffix, Name: "Notify " + suffix})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), "DELETE FROM organizations WHERE id = $1", org.ID) })
	fake := netgsmfake.New()
	t.Cleanup(fake.Server.Close)
	fake.AddAccount("8501112233", "pw-"+suffix, "RENTOPIA")
	adapter := netgsm.New(netgsm.Config{SandboxBaseURL: fake.URL()})
	fc, err := crypto.NewFieldCipher(strings.Repeat("n", 32))
	if err != nil {
		t.Fatal(err)
	}
	vault, err := integrations.NewVault(fc)
	if err != nil {
		t.Fatal(err)
	}
	accounts := accountsusecase.New(q, vault, integrations.NewRegistry(adapter))
	if withSMSAccount {
		if _, err := accounts.Connect(ctx, org.ID, accountsusecase.ConnectInput{
			Provider: "netgsm", DisplayName: "Netgsm", Mode: "sandbox",
			Credentials: map[string]string{"usercode": "8501112233", "password": "pw-" + suffix, "msgheader": "RENTOPIA"},
		}); err != nil {
			t.Fatal(err)
		}
	}
	ops := integrations.NewOperationRegistry()
	runner := jobsusecase.NewRunner(q, accounts, ops)
	smsSvc, err := smsusecase.New(pool, q, fc, accounts, runner, ops, adapter)
	if err != nil {
		t.Fatal(err)
	}
	box := &mailbox{}
	eng := engine.New(pool, q, "https://app.example.test")
	smsCh := adapters.NewSMS(smsSvc, q)
	eng.Register(smsCh, adapters.NewEmail(box), adapters.NewPush(nil, q, adapters.VAPID{}))
	runner.AddListener(smsCh)
	e := &env{ctx: ctx, pool: pool, q: q, org: org.ID, slug: org.Slug, fake: fake, runner: runner, sms: smsSvc, mail: box, eng: eng}
	if err := pool.QueryRow(ctx, `INSERT INTO customers (organization_id, customer_type, first_name, last_name, phone, email)
		VALUES ($1, 'individual', 'Ayşe', 'Yılmaz', '+905321112233', 'ayse@example.test') RETURNING id, uuid`, org.ID).
		Scan(&e.customer, &e.custUUID); err != nil {
		t.Fatal(err)
	}
	return e
}

var fixedRef = uuid.MustParse("6f1c1f1e-0000-4000-8000-000000000001")

func (e *env) emit(t *testing.T, code, key string) engine.Emitted {
	t.Helper()
	ref := fixedRef
	out, err := e.eng.Emit(e.ctx, e.org, engine.EmitInput{
		Event: code, CustomerID: e.customer, RefType: "reservation", RefUUID: &ref, Key: key,
		Vars: map[string]string{"reference": "R-1", "pickup_at": "18.10.2026 10:00", "pickup_branch": "Merkez"},
	})
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func (e *env) dispatch(t *testing.T, id uuid.UUID) model.Dispatch {
	t.Helper()
	d, err := e.eng.GetDispatch(e.ctx, e.org, id)
	if err != nil {
		t.Fatal(err)
	}
	return d
}

func (e *env) jobOf(t *testing.T, smsUUID string) int64 {
	t.Helper()
	var id int64
	if err := e.pool.QueryRow(e.ctx, `SELECT integration_job_id FROM sms_messages WHERE organization_id = $1 AND uuid = $2`,
		e.org, smsUUID).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

func attempts(d model.Dispatch) string {
	parts := make([]string, 0, len(d.Attempts))
	for _, a := range d.Attempts {
		parts = append(parts, a.Channel+":"+a.Status)
	}
	return strings.Join(parts, ",")
}

// RT-A30: an SMS that is reported undelivered is logged as failed and the
// configured alternative channel (e-mail) runs.
func TestFallbackAfterUndeliveredReport(t *testing.T) {
	e := newEnv(t, true)
	out := e.emit(t, catalog.ReservationConfirmed, "status:confirmed")
	if !out.Created {
		t.Fatal("dispatch not created")
	}
	d := e.dispatch(t, out.Dispatch.Uuid)
	if d.Status != engine.DispatchSending || attempts(d) != "sms:sent" {
		t.Fatalf("after send: %s %s", d.Status, attempts(d))
	}
	msgs := e.fake.Messages()
	if len(msgs) != 1 || !strings.Contains(msgs[0].Text, "R-1") || !strings.Contains(msgs[0].Text, "https://app.example.test/r/"+e.slug) {
		t.Fatalf("sms: %+v", msgs)
	}
	var smsUUID string
	if err := e.pool.QueryRow(e.ctx, `SELECT external_uuid::text FROM notification_deliveries WHERE organization_id = $1 AND channel = 'sms'`, e.org).Scan(&smsUUID); err != nil {
		t.Fatal(err)
	}
	var body string
	if err := e.pool.QueryRow(e.ctx, `SELECT body_redacted FROM sms_messages WHERE organization_id = $1 AND uuid = $2`, e.org, smsUUID).Scan(&body); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(body, "https://") || !strings.Contains(body, "[link]") {
		t.Fatalf("the SMS log keeps the link: %q", body)
	}
	e.fake.SetStatus(msgs[0].JobID, 3)
	if _, err := e.runner.Process(e.ctx, e.org, e.jobOf(t, smsUUID), jobsusecase.TriggerSweep); err != nil {
		t.Fatal(err)
	}
	d = e.dispatch(t, out.Dispatch.Uuid)
	if d.Status != engine.DispatchDelivered || attempts(d) != "sms:failed,email:sent" {
		t.Fatalf("after report: %s %s (%s)", d.Status, attempts(d), d.LastError)
	}
	if d.Attempts[0].Error == "" || d.Attempts[1].RecipientMasked != "a***@example.test" {
		t.Fatalf("attempts: %+v", d.Attempts)
	}
	if e.mail.count() != 1 || !strings.Contains(e.mail.sent[0].Subject, "R-1") {
		t.Fatalf("mail: %+v", e.mail.sent)
	}
	// The same event again (retry of the caller) sends nothing.
	again := e.emit(t, catalog.ReservationConfirmed, "status:confirmed")
	if again.Created {
		t.Fatal("a repeated event created a second dispatch")
	}
}

// A rejected send falls back at once; a delivered report ends the
// dispatch without the next channel.
func TestFallbackAfterRejectionAndDelivered(t *testing.T) {
	e := newEnv(t, true)
	e.fake.FailNext("40")
	out := e.emit(t, catalog.ReservationRejected, "status:cancelled")
	d := e.dispatch(t, out.Dispatch.Uuid)
	if d.Status != engine.DispatchDelivered || attempts(d) != "sms:failed,email:sent" {
		t.Fatalf("rejected sms: %s %s", d.Status, attempts(d))
	}

	ok := e.emit(t, catalog.ReservationCancelled, "status:cancelled")
	msgs := e.fake.Messages()
	e.fake.SetStatus(msgs[len(msgs)-1].JobID, 1)
	var smsUUID string
	if err := e.pool.QueryRow(e.ctx, `SELECT dl.external_uuid::text FROM notification_deliveries dl
		JOIN notification_dispatches d ON d.id = dl.dispatch_id WHERE d.organization_id = $1 AND d.uuid = $2`, e.org, ok.Dispatch.Uuid).Scan(&smsUUID); err != nil {
		t.Fatal(err)
	}
	if _, err := e.runner.Process(e.ctx, e.org, e.jobOf(t, smsUUID), jobsusecase.TriggerSweep); err != nil {
		t.Fatal(err)
	}
	d = e.dispatch(t, ok.Dispatch.Uuid)
	if d.Status != engine.DispatchDelivered || attempts(d) != "sms:delivered" {
		t.Fatalf("delivered: %s %s", d.Status, attempts(d))
	}
	if e.mail.count() != 1 {
		t.Fatalf("e-mail sent although the SMS was delivered: %d", e.mail.count())
	}
}

// A channel without an adapter (WhatsApp before TEC-735) or without an
// account is skipped and logged; when every channel fails the dispatch
// fails; fallback off stops after the first channel.
func TestSkippedChannelsAndNoFallback(t *testing.T) {
	e := newEnv(t, false)
	if _, err := e.eng.PutRule(e.ctx, e.org, catalog.ReservationConfirmed, model.RuleInput{
		Enabled: true, Channels: []string{"whatsapp", "sms", "email"}, Fallback: true,
	}); err != nil {
		t.Fatal(err)
	}
	out := e.emit(t, catalog.ReservationConfirmed, "a")
	d := e.dispatch(t, out.Dispatch.Uuid)
	if d.Status != engine.DispatchDelivered || attempts(d) != "whatsapp:skipped,sms:skipped,email:sent" {
		t.Fatalf("skips: %s %s", d.Status, attempts(d))
	}
	e.mail.failing = true
	failed := e.emit(t, catalog.ReservationConfirmed, "b")
	if d := e.dispatch(t, failed.Dispatch.Uuid); d.Status != engine.DispatchFailed || attempts(d) != "whatsapp:skipped,sms:skipped,email:failed" {
		t.Fatalf("all failed: %s %s", d.Status, attempts(d))
	}
	if _, err := e.eng.PutRule(e.ctx, e.org, catalog.ReservationConfirmed, model.RuleInput{
		Enabled: true, Channels: []string{"sms", "email"}, Fallback: false,
	}); err != nil {
		t.Fatal(err)
	}
	e.mail.failing = false
	nofb := e.emit(t, catalog.ReservationConfirmed, "c")
	if d := e.dispatch(t, nofb.Dispatch.Uuid); d.Status != engine.DispatchSkipped || attempts(d) != "sms:skipped" {
		t.Fatalf("no fallback: %s %s", d.Status, attempts(d))
	}
	// Processing a finished dispatch again sends nothing more.
	if err := e.eng.Process(e.ctx, e.org, nofb.Dispatch.ID); err != nil {
		t.Fatal(err)
	}
	if d := e.dispatch(t, nofb.Dispatch.Uuid); len(d.Attempts) != 1 {
		t.Fatalf("re-processed: %s", attempts(d))
	}
	// A disabled event creates nothing.
	if _, err := e.eng.PutRule(e.ctx, e.org, catalog.ReservationConfirmed, model.RuleInput{Enabled: false, Channels: []string{}}); err != nil {
		t.Fatal(err)
	}
	if out := e.emit(t, catalog.ReservationConfirmed, "d"); out.Created || !out.Disabled {
		t.Fatalf("disabled: %+v", out)
	}
}

// Organization templates replace the default per channel and language;
// unknown variables are refused; rules validate channels and offsets.
func TestTemplatesAndRuleValidation(t *testing.T) {
	e := newEnv(t, false)
	if _, err := e.eng.PutTemplate(e.ctx, e.org, catalog.ReservationConfirmed, "email", "tr", model.TemplateInput{
		Subject: "Onay {{reference}}", Body: "Merhaba {{customer_name}} {{identity_number}}",
	}); err == nil {
		t.Fatal("unknown variable accepted")
	}
	if _, err := e.eng.PutTemplate(e.ctx, e.org, catalog.ReservationConfirmed, "email", "tr", model.TemplateInput{
		Subject: "Onay {{reference}}", Body: "Merhaba {{customer_name}}, {{organization_name}}",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := e.eng.PutRule(e.ctx, e.org, catalog.ReservationConfirmed, model.RuleInput{
		Enabled: true, Channels: []string{"email"}, Fallback: true,
	}); err != nil {
		t.Fatal(err)
	}
	e.emit(t, catalog.ReservationConfirmed, "x")
	if e.mail.count() != 1 || e.mail.sent[0].Subject != "Onay R-1" || e.mail.sent[0].Body != "Merhaba Ayşe Yılmaz, Notify "+strings.TrimPrefix(e.slug, "ntf-") {
		t.Fatalf("custom template: %+v", e.mail.sent)
	}
	var ve *engine.ValidationError
	if _, err := e.eng.PutRule(e.ctx, e.org, catalog.ReservationConfirmed, model.RuleInput{
		Enabled: true, Channels: []string{"fax", "sms", "sms"},
	}); !errors.As(err, &ve) || len(ve.Details) != 2 {
		t.Fatalf("channels: %v", err)
	}
	if _, err := e.eng.PutRule(e.ctx, e.org, catalog.ReservationConfirmed, model.RuleInput{
		Enabled: true, Channels: []string{"sms"}, ReminderOffsets: []int32{60},
	}); !errors.As(err, &ve) {
		t.Fatalf("offsets on an instant event: %v", err)
	}
	if _, err := e.eng.PutRule(e.ctx, e.org, catalog.RentalPickupUpcoming, model.RuleInput{
		Enabled: true, Channels: []string{"sms"}, ReminderOffsets: []int32{60, -5, 999999},
	}); !errors.As(err, &ve) || len(ve.Details) != 2 {
		t.Fatalf("offset range: %v", err)
	}
	ev, err := e.eng.ResetRule(e.ctx, e.org, catalog.ReservationConfirmed)
	if err != nil || ev.Rule.Custom || len(ev.Rule.Channels) != 2 {
		t.Fatalf("reset: %+v %v", ev, err)
	}
	p, err := e.eng.Preview(e.ctx, e.org, model.PreviewInput{Event: catalog.ReservationConfirmed, Channel: "email", Language: "tr"})
	if err != nil || p.Subject != "Onay R-2026-000123" {
		t.Fatalf("preview: %+v %v", p, err)
	}
}

// Another organization's dispatches and deliveries are invisible.
func TestOrganizationIsolation(t *testing.T) {
	a := newEnv(t, false)
	b := newEnv(t, false)
	out := a.emit(t, catalog.ReservationConfirmed, "iso")
	if _, err := b.eng.GetDispatch(b.ctx, b.org, out.Dispatch.Uuid); !errors.Is(err, engine.ErrNotFound) {
		t.Fatalf("cross-organization dispatch: %v", err)
	}
	items, total, err := b.eng.ListDeliveries(b.ctx, b.org, model.DeliveryFilter{Limit: 20})
	if err != nil || total != 0 || len(items) != 0 {
		t.Fatalf("cross-organization history: %d %v", total, err)
	}
	items, total, err = a.eng.ListDeliveries(a.ctx, a.org, model.DeliveryFilter{Limit: 20, Channels: []string{"email"}})
	if err != nil || total != 1 || items[0].RecipientName != "Ayşe Yılmaz" || items[0].Event != catalog.ReservationConfirmed {
		t.Fatalf("history: %+v %d %v", items, total, err)
	}
	// A customer of another organization is not a test recipient.
	if _, err := b.eng.Test(b.ctx, b.org, model.TestInput{Event: catalog.ReservationConfirmed, CustomerUUID: &a.custUUID}); err == nil {
		t.Fatal("test send to another organization's customer")
	}
}

// Reminders: the smallest due offset is sent once per deadline; the
// sweep is idempotent.
func TestPickupReminders(t *testing.T) {
	e := newEnv(t, false)
	now := time.Now().UTC().Truncate(time.Second)
	e.eng.SetClock(func() time.Time { return now })
	resUUID := e.seedReservation(t, now.Add(90*time.Minute))
	// The sweep runs every organization; this test runs its own only (the
	// test database is shared).
	e.eng.RemindOrganization(e.ctx, e.org)
	e.eng.RemindOrganization(e.ctx, e.org)
	var n int
	var key string
	if err := e.pool.QueryRow(e.ctx, `SELECT COUNT(*), MIN(idempotency_key) FROM notification_dispatches
		WHERE organization_id = $1 AND event_code = $2 AND ref_uuid = $3`, e.org, catalog.RentalPickupUpcoming, resUUID).Scan(&n, &key); err != nil {
		t.Fatal(err)
	}
	if n != 1 || !strings.Contains(key, "remind:120:") {
		t.Fatalf("reminders: %d %q", n, key)
	}
	if _, err := e.eng.ProcessDueOrganization(e.ctx, e.org); err != nil {
		t.Fatal(err)
	}
	if e.mail.count() != 1 || !strings.Contains(e.mail.sent[0].Body, "Merkez") {
		t.Fatalf("reminder mail: %+v", e.mail.sent)
	}
}

// seedReservation inserts a confirmed reservation picked up at at.
func (e *env) seedReservation(t *testing.T, at time.Time) uuid.UUID {
	t.Helper()
	var branch, segment, product int64
	ctx := e.ctx
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	must(e.pool.QueryRow(ctx, `INSERT INTO branches (organization_id, code, name) VALUES ($1, 'MRK', 'Merkez') RETURNING id`, e.org).Scan(&branch))
	must(e.pool.QueryRow(ctx, `INSERT INTO vehicle_segments (organization_id, code, name) VALUES ($1, 'EKO', 'Ekonomi') RETURNING id`, e.org).Scan(&segment))
	must(e.pool.QueryRow(ctx, `INSERT INTO rental_products (organization_id, code, title, segment_id) VALUES ($1, 'P1', 'Ürün', $2) RETURNING id`, e.org, segment).Scan(&product))
	_, err := e.pool.Exec(ctx, `INSERT INTO rental_product_versions (organization_id, product_id, version, guarantee_type)
		VALUES ($1, $2, 1, 'GROUP')`, e.org, product)
	must(err)
	var id uuid.UUID
	must(e.pool.QueryRow(ctx, `INSERT INTO reservations (organization_id, reference, status, pickup_branch_id, return_branch_id,
		starts_at, ends_at, rental_product_id, product_version, sold_rental_product_id, sold_product_version, guarantee_type,
		product_snapshot, sold_snapshot, customer_id, channel, total_amount, quote_snapshot)
		VALUES ($1, 'R-REM', 'confirmed', $2, $2, $3, $4, $5, 1, $5, 1, 'GROUP', '{}', '{}', $6, 'office', 100, '{}')
		RETURNING uuid`, e.org, branch, at, at.Add(72*time.Hour), product, e.customer).Scan(&id))
	return id
}

// Reservation transitions map onto events inside the caller's
// transaction; a rolled-back transaction leaves no dispatch.
func TestReservationTransitions(t *testing.T) {
	e := newEnv(t, false)
	resUUID := e.seedReservation(t, time.Now().Add(72*time.Hour))
	var resID int64
	if err := e.pool.QueryRow(e.ctx, `SELECT id FROM reservations WHERE organization_id = $1 AND uuid = $2`, e.org, resUUID).Scan(&resID); err != nil {
		t.Fatal(err)
	}
	tx, err := e.pool.Begin(e.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err := e.eng.ReservationChanged(e.ctx, e.q.WithTx(tx), e.org, resID, "reject", "awaiting_review", "cancelled"); err != nil {
		t.Fatal(err)
	}
	_ = tx.Rollback(e.ctx)
	count := func(code string) int {
		var n int
		if err := e.pool.QueryRow(e.ctx, `SELECT COUNT(*) FROM notification_dispatches WHERE organization_id = $1 AND event_code = $2`, e.org, code).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	if count(catalog.ReservationRejected) != 0 {
		t.Fatal("a rolled-back transition left a dispatch")
	}
	for _, c := range []struct{ action, from, to, code string }{
		{"reject", "awaiting_review", "cancelled", catalog.ReservationRejected},
		{"confirm", "awaiting_payment", "confirmed", catalog.ReservationConfirmed},
		{"cancel", "confirmed", "cancelled", catalog.ReservationCancelled},
		{"submit", "request", "awaiting_payment", catalog.ReservationPaymentPending},
	} {
		if err := e.eng.ReservationChanged(e.ctx, e.q, e.org, resID, c.action, c.from, c.to); err != nil {
			t.Fatal(err)
		}
		if count(c.code) != 1 {
			t.Fatalf("%s: no dispatch", c.code)
		}
	}
	if err := e.eng.ReservationChanged(e.ctx, e.q, e.org, resID, "no_show", "confirmed", "no_show"); err != nil {
		t.Fatal(err)
	}
	if n, err := e.eng.ProcessDueOrganization(e.ctx, e.org); err != nil || n != 4 {
		t.Fatalf("processed %d %v", n, err)
	}
	if e.mail.count() != 4 {
		t.Fatalf("mails: %d", e.mail.count())
	}
}

// Customer web push: the customer's own subscriptions; an expired one is
// dropped and the next channel runs.
func TestCustomerPush(t *testing.T) {
	e := newEnv(t, false)
	push := adapters.NewPush(nil, e.q, adapters.VAPID{PublicKey: "pub", PrivateKey: "priv", Subject: "mailto:x@example.test"})
	var payloads []string
	status := http.StatusCreated
	push.SetSender(func(payload []byte, _ *webpush.Subscription, _ *webpush.Options) (*http.Response, error) {
		payloads = append(payloads, string(payload))
		return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(""))}, nil
	})
	e.eng.Register(push)
	if err := e.eng.SubscribeCustomerPush(e.ctx, e.org, e.customer, model.PushSubscriptionInput{
		Endpoint: "https://push.example.test/sub/1", KeyP256dh: "p256", KeyAuth: "auth",
	}); err != nil {
		t.Fatal(err)
	}
	if err := e.eng.SubscribeCustomerPush(e.ctx, e.org, e.customer, model.PushSubscriptionInput{Endpoint: "http://insecure"}); err == nil {
		t.Fatal("a non-https endpoint was accepted")
	}
	if _, err := e.eng.PutRule(e.ctx, e.org, catalog.ReservationConfirmed, model.RuleInput{
		Enabled: true, Channels: []string{"push", "email"}, Fallback: true,
	}); err != nil {
		t.Fatal(err)
	}
	ok := e.emit(t, catalog.ReservationConfirmed, "push-1")
	if d := e.dispatch(t, ok.Dispatch.Uuid); attempts(d) != "push:sent" {
		t.Fatalf("push: %s", attempts(d))
	}
	if len(payloads) != 1 || !strings.Contains(payloads[0], `"action_url":"/r/`+e.slug+`"`) {
		t.Fatalf("payload: %v", payloads)
	}
	status = http.StatusGone
	gone := e.emit(t, catalog.ReservationConfirmed, "push-2")
	if d := e.dispatch(t, gone.Dispatch.Uuid); attempts(d) != "push:failed,email:sent" {
		t.Fatalf("expired subscription: %s", attempts(d))
	}
	var n int
	if err := e.pool.QueryRow(e.ctx, `SELECT COUNT(*) FROM customer_push_subscriptions WHERE organization_id = $1`, e.org).Scan(&n); err != nil || n != 0 {
		t.Fatalf("expired subscription kept: %d %v", n, err)
	}
	none := e.emit(t, catalog.ReservationConfirmed, "push-3")
	if d := e.dispatch(t, none.Dispatch.Uuid); attempts(d) != "push:skipped,email:sent" {
		t.Fatalf("no subscription: %s", attempts(d))
	}
}

// seedMember adds a user as a member of the organization with one system
// role: approver=true picks a role that grants tenant.reservations.approve,
// false one that does not. branch>0 limits the member to that branch.
func (e *env) seedMember(t *testing.T, approver bool, branch int64) int64 {
	t.Helper()
	ctx := e.ctx
	var role int64
	if err := e.pool.QueryRow(ctx, `SELECT r.id FROM roles r
		WHERE r.scope = 'tenant' AND r.organization_id IS NULL
		  AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
		              WHERE rp.role_id = r.id AND p.slug = 'tenant.reservations.approve') = $1
		ORDER BY r.id LIMIT 1`, approver).Scan(&role); err != nil {
		t.Fatal(err)
	}
	var user, member int64
	if err := e.pool.QueryRow(ctx, `INSERT INTO users (email, password_hash, name, surname, status)
		VALUES ($1, 'x', 'Personel', 'Bir', 'active') RETURNING id`, uuid.NewString()+"@example.test").Scan(&user); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = e.pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", user) })
	scope := "all"
	if branch > 0 {
		scope = "selected"
	}
	if err := e.pool.QueryRow(ctx, `INSERT INTO organization_members (organization_id, user_id, role_id, branch_scope)
		VALUES ($1, $2, $3, $4) RETURNING id`, e.org, user, role, scope).Scan(&member); err != nil {
		t.Fatal(err)
	}
	if _, err := e.pool.Exec(ctx, `INSERT INTO organization_member_roles (organization_id, member_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
		e.org, member, role); err != nil {
		t.Fatal(err)
	}
	if branch > 0 {
		if _, err := e.pool.Exec(ctx, `INSERT INTO organization_member_branches (organization_id, member_id, branch_id) VALUES ($1, $2, $3)`,
			e.org, member, branch); err != nil {
			t.Fatal(err)
		}
	}
	return user
}

func (e *env) staffDispatches(t *testing.T, code string) map[int64]string {
	t.Helper()
	rows, err := e.pool.Query(e.ctx, `SELECT user_id, vars->>'link' FROM notification_dispatches
		WHERE organization_id = $1 AND event_code = $2`, e.org, code)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	out := map[int64]string{}
	for rows.Next() {
		var u int64
		var link string
		if err := rows.Scan(&u, &link); err != nil {
			t.Fatal(err)
		}
		out[u] = link
	}
	return out
}

// Staff pushes of the mobile app (TEC-1140): a reservation waiting for a
// decision reaches every member who may approve it in its branch, once;
// a handover task reminds its assignee before the due time, once.
func TestStaffApprovalAndHandoverReminders(t *testing.T) {
	e := newEnv(t, false)
	now := time.Now().UTC().Truncate(time.Second)
	e.eng.SetClock(func() time.Time { return now })
	resUUID := e.seedReservation(t, now.Add(48*time.Hour))
	var branch int64
	if _, err := e.pool.Exec(e.ctx, `UPDATE reservations SET status = 'request' WHERE organization_id = $1 AND uuid = $2`, e.org, resUUID); err != nil {
		t.Fatal(err)
	}
	if err := e.pool.QueryRow(e.ctx, `SELECT pickup_branch_id FROM reservations WHERE organization_id = $1 AND uuid = $2`, e.org, resUUID).Scan(&branch); err != nil {
		t.Fatal(err)
	}
	var other int64
	if err := e.pool.QueryRow(e.ctx, `INSERT INTO branches (organization_id, code, name) VALUES ($1, 'DGR', 'Diğer') RETURNING id`, e.org).Scan(&other); err != nil {
		t.Fatal(err)
	}
	approver := e.seedMember(t, true, 0)
	branchApprover := e.seedMember(t, true, branch)
	otherBranch := e.seedMember(t, true, other)
	clerk := e.seedMember(t, false, 0)

	e.eng.RemindOrganization(e.ctx, e.org)
	e.eng.RemindOrganization(e.ctx, e.org)
	got := e.staffDispatches(t, catalog.ReservationApprovalWaiting)
	if len(got) != 2 || got[approver] == "" || got[branchApprover] == "" {
		t.Fatalf("approval waiting recipients: %v", got)
	}
	if _, ok := got[otherBranch]; ok {
		t.Fatal("a member of another branch was notified")
	}
	if _, ok := got[clerk]; ok {
		t.Fatal("a member without the approve permission was notified")
	}
	if want := "https://app.example.test/t/" + e.slug + "/reservations/" + resUUID.String(); got[approver] != want {
		t.Fatalf("link %q, want %q", got[approver], want)
	}

	// Handover in 45 minutes: inside the default 60-minute reminder.
	var task uuid.UUID
	if err := e.pool.QueryRow(e.ctx, `INSERT INTO operation_tasks (organization_id, task_type, status, branch_id, due_at, assignee_id, origin)
		VALUES ($1, 'handover', 'assigned', $2, $3, $4, 'manual') RETURNING uuid`,
		e.org, branch, now.Add(45*time.Minute), clerk).Scan(&task); err != nil {
		t.Fatal(err)
	}
	e.eng.RemindOrganization(e.ctx, e.org)
	e.eng.RemindOrganization(e.ctx, e.org)
	hand := e.staffDispatches(t, catalog.FieldTaskHandoverUpcoming)
	if want := "https://app.example.test/t/" + e.slug + "/field/my/" + task.String(); len(hand) != 1 || hand[clerk] != want {
		t.Fatalf("handover reminders: %v", hand)
	}
}

var _ = channel.Known
