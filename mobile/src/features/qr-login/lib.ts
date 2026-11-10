/**
 * QR web sign-in helpers. The panel's sign-in page shows a QR of
 * `{panel}/login/qr/{id}`; the app also opens `rentopya://login/qr/{id}`.
 * Free of app imports so they run under `node --test`.
 */
import type { components } from '../../core/api/schema';

export type QrLoginDetails = components['schemas']['QRLoginDetails'];

/** Session id format of `/v1/auth/qr/sessions/{id}` (OpenAPI `QRSessionID`). */
const ID = /^[A-Za-z0-9_-]{43}$/;

export function isQrSessionId(id: string | null | undefined): boolean {
  return !!id && ID.test(id);
}

/**
 * The QR sign-in session id in a scanned code or opened link:
 * `https://<panel>/login/qr/{id}`, `rentopya://login/qr/{id}` or the bare id.
 * Null for anything else (another QR, a vehicle label, a web page).
 */
export function parseQrLogin(input: string | null | undefined): string | null {
  const s = input?.trim();
  if (!s) return null;
  if (isQrSessionId(s)) return s;
  // Scheme + host (`https://app.example.com`, `rentopya://`) dropped; query and hash ignored.
  const rest = s.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i, '').split(/[?#]/)[0];
  const parts = rest.split('/').filter(Boolean);
  // `rentopya://login/qr/{id}` parses "login" as the host above: accept both shapes.
  const tail = /^[a-z][a-z0-9+.-]*:\/\/login(?:[/?#]|$)/i.test(s) ? ['login', ...parts] : parts;
  // The path ends in `/login/qr/{id}` (a panel under a sub-path still matches).
  const [login, qr, id] = tail.slice(-3);
  return tail.length >= 3 && login === 'login' && qr === 'qr' && isQrSessionId(id) ? id : null;
}

/** "Chrome 128 · Windows" */
export function clientLabel(client: QrLoginDetails['client']) {
  const browser = [client.browser, client.browser_version].filter(Boolean).join(' ');
  return [browser, client.os].filter(Boolean).join(' · ') || client.user_agent || '';
}

/** "Kadıköy, İstanbul, TR"; null when the API could not place the IP. */
export function locationLabel(location: QrLoginDetails['location']) {
  if (!location) return null;
  const parts = [location.city, location.region, location.country || location.country_code].filter(
    (p): p is string => !!p && !!p.trim(),
  );
  const unique = parts.filter((p, i) => parts.indexOf(p) === i);
  return unique.length ? unique.join(', ') : null;
}

/** Seconds left before the code expires (never negative). */
export function secondsLeft(expiresAt: string, now = Date.now()) {
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((t - now) / 1000));
}

/** What a failed details / approve / reject call means for the screen. */
export type QrProblem = 'expired' | 'claimed' | 'resolved' | 'forbidden' | 'rate_limited' | 'other';

export function qrProblem(code: string | undefined, status?: number): QrProblem {
  switch (code) {
    case 'QR_SESSION_NOT_FOUND':
      return 'expired';
    case 'QR_SESSION_CLAIMED':
      return 'claimed';
    case 'QR_SESSION_RESOLVED':
      return 'resolved';
    case 'ACCOUNT_DEACTIVATED':
    case 'FORBIDDEN':
      return 'forbidden';
    case 'RATE_LIMITED':
      return 'rate_limited';
    default:
      if (status === 404) return 'expired';
      if (status === 429) return 'rate_limited';
      return 'other';
  }
}
