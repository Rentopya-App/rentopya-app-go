package mail

import (
	"context"
	"crypto/tls"
	"fmt"
	"mime"
	"net"
	"net/smtp"
	"strconv"
	"strings"
	"time"

	"github.com/furkanmeclis/nextjs-go-boilerplate/backend/internal/config"
)

// defaultTimeout bounds a send when none is configured.
const defaultTimeout = 10 * time.Second

// Message is an outbound email.
type Message struct {
	To      []string
	Subject string
	Body    string
}

// Sender delivers email messages.
type Sender interface {
	Send(ctx context.Context, msg Message) error
}

// SMTPSender sends mail via SMTP (MailHog in development) with a whole-send
// timeout and the configured transport security (STARTTLS / implicit TLS).
type SMTPSender struct {
	host     string
	port     int
	username string
	password string
	from     string
	fromName string
	timeout  time.Duration
	// tlsMode is one of auto|starttls|implicit|none (see config.SMTPConfig).
	tlsMode  string
	insecure bool
}

// NewSMTPSender builds a sender from config.
func NewSMTPSender(cfg config.SMTPConfig) *SMTPSender {
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = defaultTimeout
	}
	mode := strings.ToLower(strings.TrimSpace(cfg.TLSMode))
	if mode == "" {
		mode = config.SMTPTLSAuto
	}
	return &SMTPSender{
		host:     cfg.Host,
		port:     cfg.Port,
		username: cfg.Username,
		password: cfg.Password,
		from:     cfg.From,
		fromName: cfg.FromName,
		timeout:  timeout,
		tlsMode:  mode,
		insecure: cfg.TLSInsecureSkipVerify,
	}
}

// Send delivers a plain-text email.
func (s *SMTPSender) Send(ctx context.Context, msg Message) error {
	if s == nil {
		return fmt.Errorf("mail: sender is nil")
	}
	if len(msg.To) == 0 {
		return fmt.Errorf("mail: recipient required")
	}
	from := s.from
	if from == "" {
		from = "noreply@localhost"
	}
	fromHeader := from
	if s.fromName != "" {
		fromHeader = fmt.Sprintf("%s <%s>", s.fromName, from)
	}
	// Header values must not carry CR/LF: subjects interpolate user-chosen
	// names and a newline would inject extra headers (Bcc, etc.).
	for _, to := range msg.To {
		if strings.ContainsAny(to, "\r\n") {
			return fmt.Errorf("mail: invalid recipient")
		}
	}
	subject := mime.QEncoding.Encode("utf-8", stripHeaderBreaks(msg.Subject))
	payload := strings.Builder{}
	payload.WriteString("From: ")
	payload.WriteString(fromHeader)
	payload.WriteString("\r\n")
	payload.WriteString("To: ")
	payload.WriteString(strings.Join(msg.To, ", "))
	payload.WriteString("\r\n")
	payload.WriteString("Subject: ")
	payload.WriteString(subject)
	payload.WriteString("\r\n")
	payload.WriteString("MIME-Version: 1.0\r\n")
	payload.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	payload.WriteString("\r\n")
	payload.WriteString(msg.Body)

	if err := s.deliver(ctx, from, msg.To, []byte(payload.String())); err != nil {
		return fmt.Errorf("mail: send: %w", err)
	}
	return nil
}

// transport resolves the TLS mode into (implicit TLS, STARTTLS required).
// auto means implicit TLS on port 465 and required STARTTLS on any other port;
// only "none" ever speaks plaintext, so a stripped STARTTLS advertisement can
// never downgrade mail silently.
func (s *SMTPSender) transport() (implicit, startTLS bool) {
	switch s.tlsMode {
	case config.SMTPTLSNone:
		return false, false
	case config.SMTPTLSImplicit:
		return true, false
	case config.SMTPTLSStartTLS:
		return false, true
	default: // auto
		if s.port == 465 {
			return true, false
		}
		return false, true
	}
}

// deliver opens an SMTP connection (bounded by the timeout, with the
// configured transport security) and sends one message. net/smtp's SendMail
// offers neither a timeout nor implicit TLS, so the client is driven here.
func (s *SMTPSender) deliver(ctx context.Context, from string, to []string, payload []byte) error {
	timeout := s.timeout
	if timeout <= 0 {
		timeout = defaultTimeout
	}
	addr := net.JoinHostPort(s.host, strconv.Itoa(s.port))

	// One deadline for the whole send: the configured timeout, or an earlier
	// deadline already on the context.
	deadline := time.Now().Add(timeout)
	if d, ok := ctx.Deadline(); ok && d.Before(deadline) {
		deadline = d
	}
	dctx, cancel := context.WithDeadline(ctx, deadline)
	defer cancel()

	implicit, startTLS := s.transport()
	tlsConfig := &tls.Config{
		ServerName:         s.host,
		InsecureSkipVerify: s.insecure, //nolint:gosec // config refuses this outside development/test
		MinVersion:         tls.VersionTLS12,
	}

	dialer := &net.Dialer{Timeout: timeout}
	var conn net.Conn
	var err error
	if implicit {
		conn, err = (&tls.Dialer{NetDialer: dialer, Config: tlsConfig}).DialContext(dctx, "tcp", addr)
	} else {
		conn, err = dialer.DialContext(dctx, "tcp", addr)
	}
	if err != nil {
		return fmt.Errorf("dial %s: %w", addr, err)
	}
	defer func() { _ = conn.Close() }()
	// Every read and write after the dial (greeting, EHLO, STARTTLS
	// handshake, AUTH, DATA) shares the same deadline.
	if err := conn.SetDeadline(deadline); err != nil {
		return err
	}
	// Closing the socket on context cancellation unblocks any pending I/O.
	stop := context.AfterFunc(dctx, func() { _ = conn.SetDeadline(time.Unix(1, 0)) })
	defer stop()

	c, err := smtp.NewClient(conn, s.host)
	if err != nil {
		return fmt.Errorf("greeting: %w", err)
	}
	defer func() { _ = c.Close() }()

	if startTLS {
		if ok, _ := c.Extension("STARTTLS"); !ok {
			return fmt.Errorf("server at %s does not offer STARTTLS (set SMTP_TLS=implicit for port 465, or none only for a local mail catcher)", addr)
		}
		if err := c.StartTLS(tlsConfig); err != nil {
			return fmt.Errorf("starttls: %w", err)
		}
	}

	if s.username != "" {
		// smtp.PlainAuth refuses to send credentials over an unencrypted
		// connection to a non-localhost server.
		auth := smtp.PlainAuth("", s.username, s.password, s.host)
		if err := c.Auth(auth); err != nil {
			return fmt.Errorf("auth: %w", err)
		}
	}
	if err := c.Mail(from); err != nil {
		return fmt.Errorf("mail from: %w", err)
	}
	for _, rcpt := range to {
		if err := c.Rcpt(rcpt); err != nil {
			return fmt.Errorf("rcpt to: %w", err)
		}
	}
	wc, err := c.Data()
	if err != nil {
		return fmt.Errorf("data: %w", err)
	}
	if _, err := wc.Write(payload); err != nil {
		_ = wc.Close()
		return fmt.Errorf("write: %w", err)
	}
	if err := wc.Close(); err != nil {
		return fmt.Errorf("close data: %w", err)
	}
	// The server has accepted the message here; a failed QUIT (for example a
	// server that drops the connection) must not report the send as failed,
	// or the queue would retry and deliver a duplicate.
	_ = c.Quit()
	return nil
}

func stripHeaderBreaks(v string) string {
	return strings.NewReplacer("\r\n", " ", "\r", " ", "\n", " ").Replace(v)
}

// NoopSender discards mail (tests).
type NoopSender struct{}

// Send implements Sender.
func (NoopSender) Send(context.Context, Message) error { return nil }

var (
	_ Sender = (*SMTPSender)(nil)
	_ Sender = NoopSender{}
)
