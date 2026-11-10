/**
 * The fetch every `/v1` call goes through: Bearer access token, proactive and
 * on-401 refresh (single flight, the refresh token rotates on each use),
 * `X-Organization` on `/v1/tenant/*`, and the signals the session store acts
 * on (refresh chain gone → sign out; membership gone → back to the picker).
 *
 * Built from injected dependencies and free of app imports, so the rules run
 * under `node --test` (`auth-fetch.test.ts`); `client.ts` wires the real ones.
 */
import type { components } from './schema';

export type ApiTokens = components['schemas']['Tokens'];

export type Tokens = {
  access: string;
  refresh: string;
  /** Epoch ms when the access token expires. */
  accessExpiresAt: number;
};

/** Sign-in and refresh never carry the Bearer: their 401 is a wrong password or a dead chain. */
export const NO_BEARER_PATHS = ['/v1/auth/login', '/v1/auth/refresh'];

/**
 * A 401 on these is an answer (wrong password, code or id token), not an
 * expired access token: never refresh and resend.
 */
export const NO_RETRY_PATHS = [
  '/v1/auth/login',
  '/v1/auth/refresh',
  '/v1/auth/logout',
  '/v1/auth/step-up/',
  '/v1/auth/oauth/',
];

/** Refresh this long before the access token expires, so requests never race it. */
export const REFRESH_MARGIN_MS = 30_000;

export const TENANT_PREFIX = '/v1/tenant/';

/** Codes that mean the picked organization can no longer be used by this member. */
export const TENANT_LOST_CODES = [
  'NO_TENANT_MEMBERSHIP',
  'ORGANIZATION_SUSPENDED',
  'ORGANIZATION_ACCESS_EXPIRED',
  'ORGANIZATION_REQUIRED',
] as const;

export function isTenantPath(path: string) {
  return path.startsWith(TENANT_PREFIX);
}

/**
 * Whether a `/v1/tenant/*` answer means the membership is gone (removed,
 * suspended, access window over): a `403`/`400` with one of
 * `TENANT_LOST_CODES`, or a `404` on the context itself. A `404` on a record
 * is just a missing (or another organization's) record.
 */
export function tenantAccessLost(path: string, status: number, code: string | undefined) {
  if (!isTenantPath(path)) return false;
  if (status === 404) return path === '/v1/tenant/context';
  if (status !== 403 && status !== 400) return false;
  return !!code && (TENANT_LOST_CODES as readonly string[]).includes(code);
}

export function tokensFromApi(t: ApiTokens, now = Date.now()): Tokens {
  return { access: t.access_token, refresh: t.refresh_token, accessExpiresAt: now + t.expires_in * 1000 };
}

export type AuthFetchDeps = {
  /** API origin without `/v1`. */
  apiUrl: string;
  fetch: (request: Request) => Promise<Response>;
  getTokens: () => Tokens | null;
  saveTokens: (t: Tokens) => Promise<void>;
  /** Slug of the picked organization (sent as `X-Organization`), or null. */
  getOrganization: () => string | null;
  /** Fixed headers (Accept, Accept-Language, X-App-Version, User-Agent). */
  headers: () => Record<string, string>;
  /** The refresh token was refused: the session is over. */
  onSessionExpired: () => void;
  /** A tenant call said the membership in `organization` is gone. */
  onTenantAccessLost?: (organization: string, code: string) => void;
  now?: () => number;
};

function pathOf(url: string, apiUrl: string) {
  const p = new URL(url).pathname;
  // The API may live under a path prefix (`https://host/api`); routes start at /v1.
  const base = new URL(apiUrl).pathname.replace(/\/$/, '');
  return base && p.startsWith(base) ? p.slice(base.length) : p;
}

async function errorCode(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.clone().json()) as { error?: { code?: string } };
    return body?.error?.code;
  } catch {
    return undefined;
  }
}

export function createAuthFetch(d: AuthFetchDeps) {
  const now = d.now ?? Date.now;
  let refreshing: Promise<boolean> | null = null;

  /** Rotates the refresh token once, however many requests ask at the same time. */
  function refreshTokens(): Promise<boolean> {
    refreshing ??= (async () => {
      const t = d.getTokens();
      if (!t) return false;
      try {
        const res = await d.fetch(
          new Request(`${d.apiUrl}/v1/auth/refresh`, {
            method: 'POST',
            headers: { ...d.headers(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: t.refresh }),
          }),
        );
        if (!res.ok) {
          // 4xx: expired, revoked or reused refresh token, the chain is gone. A 5xx or
          // a network failure keeps the session (offline must not sign anyone out).
          if (res.status >= 400 && res.status < 500) d.onSessionExpired();
          return false;
        }
        const body = (await res.json()) as { data: ApiTokens };
        await d.saveTokens(tokensFromApi(body.data, now()));
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  /** Headers of one attempt; returns the access token it carries (or null). */
  function prepare(request: Request, path: string, organization: string | null) {
    for (const [k, v] of Object.entries(d.headers())) request.headers.set(k, v);
    if (isTenantPath(path) && organization) request.headers.set('X-Organization', organization);
    const t = d.getTokens();
    if (t && !NO_BEARER_PATHS.includes(path)) {
      request.headers.set('Authorization', `Bearer ${t.access}`);
      return t.access;
    }
    return null;
  }

  async function authFetch(request: Request): Promise<Response> {
    const path = pathOf(request.url, d.apiUrl);
    const noRetry = NO_RETRY_PATHS.some((p) => path.startsWith(p));
    const retry = noRetry ? null : request.clone();
    // The organization of this call, fixed before any await so a switch mid-flight
    // never sends one organization's request with another's header. A caller that names
    // its organization keeps it (the upload queue sends each job for the organization it was
    // captured in); typed calls name the picked one through `orgHeader()`.
    const organization = request.headers.get('X-Organization') || d.getOrganization();

    const t = d.getTokens();
    if (t && !noRetry && t.accessExpiresAt - now() < REFRESH_MARGIN_MS) await refreshTokens();

    const sent = prepare(request, path, organization);
    let res = await d.fetch(request);
    if (res.status === 401 && retry && sent) {
      // Another request may have rotated the pair while this one was in flight:
      // then the new access token is already here and no second refresh is needed.
      const fresh = d.getTokens();
      const ok = fresh && fresh.access !== sent ? true : await refreshTokens();
      if (ok && d.getTokens()) {
        prepare(retry, path, organization);
        res = await d.fetch(retry);
      }
    }

    if (
      organization &&
      d.onTenantAccessLost &&
      isTenantPath(path) &&
      (res.status === 403 || res.status === 404 || res.status === 400)
    ) {
      const code = await errorCode(res);
      if (tenantAccessLost(path, res.status, code)) d.onTenantAccessLost(organization, code ?? 'NOT_FOUND');
    }
    return res;
  }

  return { authFetch, refreshTokens };
}
