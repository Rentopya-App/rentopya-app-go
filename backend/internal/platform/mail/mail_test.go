package mail

import (
	"bufio"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"math/big"
	"net"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/config"
)

func TestStripHeaderBreaks(t *testing.T) {
	got := stripHeaderBreaks("Hi Ali\r\nBcc: attacker@example.com\nX")
	if got != "Hi Ali Bcc: attacker@example.com X" {
		t.Fatalf("got %q", got)
	}
}

// fakeSMTP is a tiny scripted SMTP server. starttls (when non-nil) is
// advertised on EHLO and used to upgrade the connection; implicit wraps the
// listener in TLS from the first byte; dropOnQuit closes without a 221.
type fakeSMTP struct {
	addr       string
	ln         net.Listener
	starttls   *tls.Config
	dropOnQuit bool

	mu       sync.Mutex
	received strings.Builder
	upgraded bool
	wg       sync.WaitGroup
}

type fakeOpts struct {
	starttls   *tls.Config
	implicit   *tls.Config
	dropOnQuit bool
}

func startFakeSMTP(t *testing.T, o fakeOpts) *fakeSMTP {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	if o.implicit != nil {
		ln = tls.NewListener(ln, o.implicit)
	}
	f := &fakeSMTP{addr: ln.Addr().String(), ln: ln, starttls: o.starttls, dropOnQuit: o.dropOnQuit}
	f.wg.Add(1)
	go f.serve()
	t.Cleanup(func() { _ = ln.Close(); f.wg.Wait() })
	return f
}

func (f *fakeSMTP) serve() {
	defer f.wg.Done()
	conn, err := f.ln.Accept()
	if err != nil {
		return
	}
	defer func() { _ = conn.Close() }()
	_ = conn.SetDeadline(time.Now().Add(5 * time.Second))
	br := bufio.NewReader(conn)
	w := func(s string) { _, _ = conn.Write([]byte(s)) }

	w("220 fake ESMTP ready\r\n")
	inData, secure := false, false
	for {
		line, err := br.ReadString('\n')
		if err != nil {
			return
		}
		if inData {
			if strings.TrimRight(line, "\r\n") == "." {
				inData = false
				w("250 OK queued\r\n")
				continue
			}
			f.mu.Lock()
			f.received.WriteString(line)
			f.mu.Unlock()
			continue
		}
		cmd := strings.ToUpper(strings.TrimSpace(line))
		switch {
		case strings.HasPrefix(cmd, "EHLO"):
			if f.starttls != nil && !secure {
				w("250-fake\r\n250 STARTTLS\r\n")
			} else {
				w("250-fake\r\n250 HELP\r\n")
			}
		case strings.HasPrefix(cmd, "HELO"):
			w("250 fake\r\n")
		case cmd == "STARTTLS" && f.starttls != nil && !secure:
			w("220 go ahead\r\n")
			tc := tls.Server(conn, f.starttls)
			if err := tc.Handshake(); err != nil {
				return
			}
			conn, br, secure = tc, bufio.NewReader(tc), true
			f.mu.Lock()
			f.upgraded = true
			f.mu.Unlock()
		case cmd == "DATA":
			inData = true
			w("354 end with .\r\n")
		case cmd == "QUIT":
			if !f.dropOnQuit {
				w("221 bye\r\n")
			}
			return
		default:
			w("250 OK\r\n")
		}
	}
}

func (f *fakeSMTP) body() string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.received.String()
}

func (f *fakeSMTP) wasUpgraded() bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.upgraded
}

func hostPort(t *testing.T, addr string) (string, int) {
	t.Helper()
	host, portStr, err := net.SplitHostPort(addr)
	if err != nil {
		t.Fatalf("split host port: %v", err)
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		t.Fatalf("parse port: %v", err)
	}
	return host, port
}

func senderTo(t *testing.T, addr, mode string, insecure bool) *SMTPSender {
	t.Helper()
	host, port := hostPort(t, addr)
	return NewSMTPSender(config.SMTPConfig{
		Host:                  host,
		Port:                  port,
		From:                  "noreply@example.com",
		FromName:              "Rentopya",
		Timeout:               2 * time.Second,
		TLSMode:               mode,
		TLSInsecureSkipVerify: insecure,
	})
}

// selfSignedTLS returns a server TLS config with a throwaway cert for 127.0.0.1.
func selfSignedTLS(t *testing.T) *tls.Config {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("genkey: %v", err)
	}
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "127.0.0.1"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		IPAddresses:  []net.IP{net.ParseIP("127.0.0.1")},
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("cert: %v", err)
	}
	return &tls.Config{Certificates: []tls.Certificate{{Certificate: [][]byte{der}, PrivateKey: key}}, MinVersion: tls.VersionTLS12}
}

func testMsg(body string) Message {
	return Message{To: []string{"user@example.com"}, Subject: "Merhaba Çağrı", Body: body}
}

func TestTransportModes(t *testing.T) {
	cases := []struct {
		mode               string
		port               int
		implicit, startTLS bool
	}{
		{"auto", 587, false, true},
		{"auto", 25, false, true},
		{"auto", 465, true, false},
		{"", 587, false, true}, // NewSMTPSender maps "" to auto
		{"starttls", 465, false, true},
		{"implicit", 587, true, false},
		{"none", 1025, false, false},
	}
	for _, tc := range cases {
		s := NewSMTPSender(config.SMTPConfig{Host: "mail.example.com", Port: tc.port, TLSMode: tc.mode})
		implicit, startTLS := s.transport()
		if implicit != tc.implicit || startTLS != tc.startTLS {
			t.Errorf("mode %q port %d: implicit=%v starttls=%v, want %v/%v", tc.mode, tc.port, implicit, startTLS, tc.implicit, tc.startTLS)
		}
	}
}

func TestNewSMTPSenderDefaultTimeout(t *testing.T) {
	if s := NewSMTPSender(config.SMTPConfig{}); s.timeout != defaultTimeout {
		t.Fatalf("timeout = %v, want %v", s.timeout, defaultTimeout)
	}
}

func TestSendPlaintextDelivers(t *testing.T) {
	f := startFakeSMTP(t, fakeOpts{})
	if err := senderTo(t, f.addr, "none", false).Send(context.Background(), testMsg("hello body")); err != nil {
		t.Fatalf("Send: %v", err)
	}
	body := f.body()
	if !strings.Contains(body, "hello body") || !strings.Contains(body, "To: user@example.com") {
		t.Errorf("server received %q", body)
	}
}

func TestSendSTARTTLSUpgrades(t *testing.T) {
	f := startFakeSMTP(t, fakeOpts{starttls: selfSignedTLS(t)})
	if err := senderTo(t, f.addr, "starttls", true).Send(context.Background(), testMsg("upgraded body")); err != nil {
		t.Fatalf("Send over STARTTLS: %v", err)
	}
	if !f.wasUpgraded() {
		t.Fatal("connection was not upgraded with STARTTLS")
	}
	if !strings.Contains(f.body(), "upgraded body") {
		t.Errorf("server received %q", f.body())
	}
}

func TestSendSTARTTLSVerifiesCertificate(t *testing.T) {
	// Without skip-verify, a self-signed certificate must fail the handshake.
	f := startFakeSMTP(t, fakeOpts{starttls: selfSignedTLS(t)})
	if err := senderTo(t, f.addr, "starttls", false).Send(context.Background(), testMsg("x")); err == nil {
		t.Fatal("expected certificate verification error")
	}
	if strings.Contains(f.body(), "x") {
		t.Fatal("message delivered despite failed TLS")
	}
}

func TestSendRequiresSTARTTLSWhenNotOffered(t *testing.T) {
	for _, mode := range []string{"starttls", "auto"} {
		t.Run(mode, func(t *testing.T) {
			f := startFakeSMTP(t, fakeOpts{}) // server does NOT advertise STARTTLS
			err := senderTo(t, f.addr, mode, false).Send(context.Background(), testMsg("secret body"))
			if err == nil {
				t.Fatal("expected error when STARTTLS is required but not offered")
			}
			if !strings.Contains(err.Error(), "STARTTLS") {
				t.Errorf("error = %v, want STARTTLS mention", err)
			}
			if strings.Contains(f.body(), "secret body") {
				t.Fatal("message sent in plaintext")
			}
		})
	}
}

func TestSendImplicitTLSDelivers(t *testing.T) {
	f := startFakeSMTP(t, fakeOpts{implicit: selfSignedTLS(t)})
	if err := senderTo(t, f.addr, "implicit", true).Send(context.Background(), testMsg("ciphertext body")); err != nil {
		t.Fatalf("Send over implicit TLS: %v", err)
	}
	if !strings.Contains(f.body(), "ciphertext body") {
		t.Errorf("server received %q", f.body())
	}
}

func TestSendIgnoresFailedQuitAfterAccept(t *testing.T) {
	f := startFakeSMTP(t, fakeOpts{dropOnQuit: true})
	if err := senderTo(t, f.addr, "none", false).Send(context.Background(), testMsg("accepted body")); err != nil {
		t.Fatalf("Send must succeed once DATA is accepted: %v", err)
	}
}

// stalledServer accepts connections but never writes the SMTP greeting.
func stalledServer(t *testing.T) string {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	done := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				<-done
				_ = conn.Close()
			}()
		}
	}()
	t.Cleanup(func() { close(done); _ = ln.Close(); wg.Wait() })
	return ln.Addr().String()
}

func TestSendTimesOutOnStalledServer(t *testing.T) {
	for _, mode := range []string{"none", "implicit"} {
		t.Run(mode, func(t *testing.T) {
			s := senderTo(t, stalledServer(t), mode, true)
			s.timeout = 300 * time.Millisecond
			start := time.Now()
			if err := s.Send(context.Background(), testMsg("x")); err == nil {
				t.Fatal("expected timeout error")
			}
			if elapsed := time.Since(start); elapsed > 1500*time.Millisecond {
				t.Errorf("send took %v, timeout not enforced", elapsed)
			}
		})
	}
}

func TestSendHonoursContextDeadline(t *testing.T) {
	s := senderTo(t, stalledServer(t), "none", false)
	s.timeout = 10 * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	start := time.Now()
	if err := s.Send(ctx, testMsg("x")); err == nil {
		t.Fatal("expected deadline error")
	}
	if elapsed := time.Since(start); elapsed > 1500*time.Millisecond {
		t.Errorf("send took %v, context deadline not honoured", elapsed)
	}
}

func TestSendRejectsHeaderInjection(t *testing.T) {
	s := NewSMTPSender(config.SMTPConfig{Host: "127.0.0.1", Port: 2525, From: "a@b.c", TLSMode: "none"})
	err := s.Send(context.Background(), Message{To: []string{"ok@example.com\r\nBcc: evil@example.com"}, Subject: "x", Body: "y"})
	if err == nil {
		t.Fatal("expected error for CRLF in recipient")
	}
}
