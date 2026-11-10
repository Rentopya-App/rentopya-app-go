/**
 * Account and security helpers (authenticator URI, session labels, account
 * deletion errors). Free of app imports so they run under `node --test`.
 */

export type Otpauth = {
  type: 'totp' | 'hotp';
  /** Label after the issuer prefix (usually the e-mail). */
  account: string;
  issuer: string;
  /** Base32 secret, upper case, no spaces or padding. */
  secret: string;
  algorithm: string;
  digits: number;
  period: number;
};

function decode(part: string) {
  try {
    return decodeURIComponent(part.replace(/\+/g, ' '));
  } catch {
    return part;
  }
}

/**
 * Reads an `otpauth://totp/Issuer:account?secret=…&issuer=…` URI (the one
 * `/v1/auth/totp/setup` returns). Null when it is not one or has no valid
 * base32 secret.
 */
export function parseOtpauth(uri: string | null | undefined): Otpauth | null {
  if (!uri) return null;
  const m = /^otpauth:\/\/(totp|hotp)\/([^?#]*)(?:\?([^#]*))?/i.exec(uri.trim());
  if (!m) return null;
  const params = new Map<string, string>();
  for (const pair of (m[3] ?? '').split('&')) {
    if (!pair) continue;
    const i = pair.indexOf('=');
    const key = decode(i < 0 ? pair : pair.slice(0, i)).toLowerCase();
    if (!params.has(key)) params.set(key, decode(i < 0 ? '' : pair.slice(i + 1)));
  }
  const secret = (params.get('secret') ?? '').replace(/[\s=-]/g, '').toUpperCase();
  if (!secret || !/^[A-Z2-7]+$/.test(secret)) return null;
  const label = decode(m[2]);
  const colon = label.indexOf(':');
  const labelIssuer = colon >= 0 ? label.slice(0, colon).trim() : '';
  const account = (colon >= 0 ? label.slice(colon + 1) : label).trim();
  const digits = Number(params.get('digits') ?? 6);
  const period = Number(params.get('period') ?? 30);
  return {
    type: m[1].toLowerCase() as Otpauth['type'],
    account,
    issuer: params.get('issuer')?.trim() || labelIssuer,
    secret,
    algorithm: (params.get('algorithm') || 'SHA1').toUpperCase(),
    digits: Number.isInteger(digits) && digits > 0 ? digits : 6,
    period: Number.isInteger(period) && period > 0 ? period : 30,
  };
}

/** `JBSWY3DPEHPK3PXP` → `JBSW Y3DP EHPK 3PXP`, easier to type into another app. */
export function groupSecret(secret: string, size = 4) {
  const clean = secret.replace(/\s/g, '');
  const parts: string[] = [];
  for (let i = 0; i < clean.length; i += size) parts.push(clean.slice(i, i + size));
  return parts.join(' ');
}

/**
 * An authenticator code as typed: spaces dropped. The API also takes a
 * recovery code here, so only the length is checked (the panel's rule: at
 * least 6 characters).
 */
export function normalizeCode(input: string) {
  return input.replace(/\s+/g, '');
}

export function isCodeReady(input: string) {
  return normalizeCode(input).length >= 6;
}

export type DeviceKind = 'app' | 'mobile' | 'desktop' | 'unknown';

/**
 * A readable name for a session's User-Agent: this app (`RentopyaMobile/1.2
 * (ios)`), else browser and system. The raw string stays available.
 */
export function describeUserAgent(ua: string | null | undefined): { kind: DeviceKind; label: string | null } {
  const s = ua?.trim() ?? '';
  if (!s) return { kind: 'unknown', label: null };
  const app = /^RentopyaMobile\/([\w.-]+)(?:\s*\((\w+)\))?/i.exec(s);
  if (app) {
    const os = app[2]?.toLowerCase();
    const system = os === 'ios' ? 'iOS' : os === 'android' ? 'Android' : os ? os : null;
    return { kind: 'app', label: ['Rentopya', app[1], system ? `· ${system}` : null].filter(Boolean).join(' ') };
  }
  const browser = /Edg\//.test(s)
    ? 'Edge'
    : /OPR\/|Opera/.test(s)
      ? 'Opera'
      : /Firefox\//.test(s)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(s)
          ? 'Chrome'
          : /Safari\//.test(s)
            ? 'Safari'
            : null;
  const system = /iPhone|iPad|iPod/.test(s)
    ? 'iOS'
    : /Android/.test(s)
      ? 'Android'
      : /Windows/.test(s)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(s)
          ? 'macOS'
          : /Linux/.test(s)
            ? 'Linux'
            : null;
  const mobile = /Mobile|iPhone|Android/.test(s);
  const label = [browser, system].filter(Boolean).join(' · ');
  return { kind: label ? (mobile ? 'mobile' : 'desktop') : 'unknown', label: label || s };
}

type ErrorDetail = { field?: string | null; message?: string | null; code?: string | null };

/**
 * `409 LAST_ORGANIZATION_OWNER` lists each organization the user is the only
 * owner of (`field = organization`, `message` = name, `code` = slug).
 */
export function lastOwnerOrganizations(details: readonly ErrorDetail[] | null | undefined) {
  return (details ?? [])
    .filter((d) => (d.field ?? 'organization') === 'organization' && (d.message || d.code))
    .map((d) => ({ name: (d.message || d.code) as string, slug: d.code ?? null }));
}
