package customerportal_test

import (
	"net/http"
	"regexp"
	"slices"
	"testing"
	"time"
)

// TestPortalContactSignIn (TEC-1283): a renter signs in with only a phone
// number or an e-mail address and sees every reservation of their card in
// this organization. Unknown contacts, a driver-only number and another
// organization's renter with the same number answer the same and send
// nothing; nothing of another organization is ever visible.
func TestPortalContactSignIn(t *testing.T) {
	e := newEnv(t)
	x := e.customer(e.a, "Ayşe", "+905321112233", "ayse@example.test")
	d := e.driver(e.a, x.customer, "Deniz", "+905551234567")
	r1 := e.reserve(e.a, x, 3, d)
	r2 := e.reserve(e.a, x, 10)
	// The same number in organization B, with its own reservation.
	xb := e.customer(e.b, "Ayşe", "+905321112233", "")
	rb := e.reserve(e.b, xb, 4)
	base := "/v1/customer/" + e.a.slug

	start := func(contact string) resp {
		return e.call(http.MethodPost, base+"/auth/start", "", map[string]any{"contact": contact})
	}
	unknown := start("05329990000")
	driverOnly := start("0555 123 45 67")
	if unknown.code != http.StatusAccepted || string(stripMeta(unknown.raw)) != string(stripMeta(driverOnly.raw)) {
		t.Fatalf("answers differ:\n%s\n%s", unknown.raw, driverOnly.raw)
	}
	if e.smsCount("5329990000") != 0 || e.smsCount("5551234567") != 0 {
		t.Fatal("a code went out without a renter match")
	}

	// National form, no reference: the code goes to the renter.
	matched := start("0532 111 22 33")
	if string(stripMeta(matched.raw)) != string(stripMeta(unknown.raw)) || e.smsCount("5321112233") != 1 {
		t.Fatalf("matched answer %s", matched.raw)
	}
	code := e.smsCode("5321112233")
	verify := func(contact, c string) resp {
		return e.call(http.MethodPost, base+"/auth/verify", "", map[string]any{"contact": contact, "code": c})
	}
	// Another contact never uses up this code; a reference sign-in of the
	// same customer has its own code.
	for _, r := range []resp{verify("05329990000", code), verify("ayse@example.test", code),
		e.call(http.MethodPost, base+"/auth/verify", "", map[string]any{"reference": r1.Reference, "contact": "05321112233", "code": code})} {
		if r.code != http.StatusBadRequest || r.code_() != "OTP_INVALID" {
			t.Fatalf("verify failure %d %s", r.code, r.raw)
		}
	}
	v := verify("+90 532 111 22 33", code)
	if v.code != http.StatusOK {
		t.Fatalf("verify %d %s", v.code, v.raw)
	}
	token, _ := v.data["session_token"].(string)
	if sess := e.call(http.MethodGet, base+"/session", token, nil); sess.data["role"] != "renter" {
		t.Fatalf("session %s", sess.raw)
	}
	list := uuidsOf(items(e.call(http.MethodGet, base+"/reservations", token, nil)))
	if len(list) != 2 || !slices.Contains(list, r1.UUID.String()) || !slices.Contains(list, r2.UUID.String()) {
		t.Fatalf("renter sees %v", list)
	}
	if r := e.call(http.MethodGet, base+"/reservations/"+rb.UUID.String(), token, nil); r.code != http.StatusNotFound {
		t.Fatalf("B's reservation through A's session: %d", r.code)
	}
	// The session of A never opens B's portal.
	if r := e.call(http.MethodGet, "/v1/customer/"+e.b.slug+"/reservations", token, nil); r.code != http.StatusUnauthorized {
		t.Fatalf("A's session in B: %d", r.code)
	}

	// E-mail, any case, no reference.
	e.advance(61 * time.Second)
	if r := start("AYSE@Example.test"); r.code != http.StatusAccepted || r.data["channel"] != "email" {
		t.Fatalf("email start %d %s", r.code, r.raw)
	}
	m := regexp.MustCompile(`kodunuz: (\d{6})`).FindStringSubmatch(e.mailer.last("ayse@example.test"))
	if m == nil {
		t.Fatal("no e-mail code")
	}
	if r := verify("ayse@example.test", m[1]); r.code != http.StatusOK {
		t.Fatalf("email verify %d %s", r.code, r.raw)
	}

	// Malformed contact: a plain validation error; a typed reference keeps
	// the reference sign-in rules.
	if r := start("not a contact"); r.code != http.StatusBadRequest {
		t.Fatalf("malformed %d", r.code)
	}
	if r := e.call(http.MethodPost, base+"/auth/start", "", map[string]any{"reference": "x", "contact": "05321112233"}); r.code != http.StatusBadRequest {
		t.Fatalf("malformed reference %d", r.code)
	}
}
