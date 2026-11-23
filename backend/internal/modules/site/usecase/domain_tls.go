package usecase

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"net"
	"net/netip"
	"syscall"
	"time"
)

// ErrDomainTLSUnverified: the host does not serve a valid certificate for itself (TEC-1279).
var ErrDomainTLSUnverified = errors.New("TLS certificate check failed")

const (
	// tlsProvisionWindow is how long a newly verified domain on an automated provisioner may
	// wait for its first certificate before the check reports it as failed.
	tlsProvisionWindow = time.Hour
	// tlsProvisionRetry is the next check while a certificate is being issued.
	tlsProvisionRetry = 5 * time.Minute
)

// TLSProbe is a successful certificate check.
type TLSProbe struct {
	NotAfter time.Time
}

// TLSProber checks that host serves, on port 443 with SNI, a certificate that chains to a
// trusted root, covers the host and is within its validity window.
type TLSProber interface {
	Probe(ctx context.Context, host string) (TLSProbe, error)
}

// NetTLSProber dials the public host. Only global unicast addresses are dialed, so a domain
// whose DNS changed to an internal address after verification cannot be used to reach
// internal services (the port is fixed and nothing but the error class is reported).
type NetTLSProber struct {
	Timeout time.Duration
	// Roots overrides the system roots (tests); Address dials another host:port while
	// SNI and verification still use the domain (tests).
	Roots   *x509.CertPool
	Address string
	// AllowPrivate permits loopback and private addresses (tests only).
	AllowPrivate bool
}

func (p NetTLSProber) Probe(ctx context.Context, host string) (TLSProbe, error) {
	timeout := p.Timeout
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	address := p.Address
	if address == "" {
		address = net.JoinHostPort(host, "443")
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	dialer := &tls.Dialer{
		NetDialer: &net.Dialer{Timeout: timeout, Control: func(_, address string, _ syscall.RawConn) error {
			if p.AllowPrivate {
				return nil
			}
			ap, err := netip.ParseAddrPort(address)
			if err != nil || !publicAddress(ap.Addr()) {
				return errNonPublicAddress
			}
			return nil
		}},
		Config: &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12, RootCAs: p.Roots},
	}
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return TLSProbe{}, fmt.Errorf("%w: %s", ErrDomainTLSUnverified, describeTLSError(host, err))
	}
	defer func() { _ = conn.Close() }()
	state := conn.(*tls.Conn).ConnectionState()
	if len(state.PeerCertificates) == 0 {
		return TLSProbe{}, fmt.Errorf("%w: no certificate presented", ErrDomainTLSUnverified)
	}
	return TLSProbe{NotAfter: state.PeerCertificates[0].NotAfter.UTC()}, nil
}

var errNonPublicAddress = errors.New("host resolves to a non-public address")

func publicAddress(a netip.Addr) bool {
	a = a.Unmap()
	return a.IsGlobalUnicast() && !a.IsPrivate() && !a.IsLoopback() && !a.IsLinkLocalUnicast()
}

// describeTLSError turns a dial or handshake error into a message an administrator can act on.
func describeTLSError(host string, err error) string {
	var unknown x509.UnknownAuthorityError
	var hostname x509.HostnameError
	var invalid x509.CertificateInvalidError
	switch {
	case errors.As(err, &unknown):
		return "certificate is not issued by a trusted authority (self-signed or the proxy's default certificate); issue a certificate for " + host
	case errors.As(err, &hostname):
		return "certificate does not cover " + host
	case errors.As(err, &invalid) && invalid.Reason == x509.Expired:
		return "certificate has expired or is not yet valid"
	case errors.As(err, &invalid):
		return "certificate is invalid: " + invalid.Error()
	case errors.Is(err, errNonPublicAddress):
		return errNonPublicAddress.Error()
	case errors.Is(err, context.DeadlineExceeded):
		return "timed out connecting to " + host + ":443"
	default:
		var netErr net.Error
		if errors.As(err, &netErr) || errors.Is(err, syscall.ECONNREFUSED) {
			return "could not connect to " + host + ":443"
		}
		return "TLS handshake with " + host + " failed"
	}
}
