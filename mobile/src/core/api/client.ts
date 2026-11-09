import createClient from 'openapi-fetch';
import { Platform } from 'react-native';

import { getTokens, setTokens } from '@/core/auth/tokens';
import { API_URL, APP_VERSION } from '@/core/config';
import { i18n } from '@/core/i18n';

import { createAuthFetch } from './auth-fetch';
import { ApiError, toApiError } from './errors';
import type { paths } from './schema';

let onSessionExpired: () => void = () => {};
/** The session store registers how to sign out when the refresh chain is gone. */
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

let onTenantAccessLost: (organization: string, code: string) => void = () => {};
/** The session store registers how to go back to the picker when a membership is gone. */
export function setTenantAccessLostHandler(fn: (organization: string, code: string) => void) {
  onTenantAccessLost = fn;
}

let activeOrganization: string | null = null;
/** Slug sent as `X-Organization` on every `/v1/tenant/*` call (set by the session store). */
export function setActiveOrganization(slug: string | null) {
  activeOrganization = slug;
}

/**
 * Typed header param for `/v1/tenant/*` calls. The fetch below sets the same
 * header on every tenant call; the generated types still require it per call.
 */
export function orgHeader(): { 'X-Organization': string } {
  return { 'X-Organization': activeOrganization ?? '' };
}

function baseHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'X-App-Version': APP_VERSION,
    'Accept-Language': i18n.language,
    'User-Agent': `RentopyaMobile/${APP_VERSION} (${Platform.OS})`,
  };
}

const auth = createAuthFetch({
  apiUrl: API_URL,
  fetch: (r) => fetch(r),
  getTokens,
  saveTokens: setTokens,
  getOrganization: () => activeOrganization,
  headers: baseHeaders,
  onSessionExpired: () => onSessionExpired(),
  onTenantAccessLost: (org, code) => onTenantAccessLost(org, code),
});

/** Rotates the refresh token once, however many requests ask at the same time. */
export const refreshTokens = auth.refreshTokens;

/** Typed `/v1` client: `<EXPO_PUBLIC_API_URL>/v1/*`, straight to the Go API. */
export const api = createClient<paths>({ baseUrl: API_URL, fetch: auth.authFetch });

type Result<T> = { data?: { data: T }; error?: unknown; response: Response };

function networkError(e: unknown) {
  return new ApiError(0, { code: 'NETWORK_ERROR', message: e instanceof Error ? e.message : String(e) });
}

/**
 * Turns an openapi-fetch call into the envelope's `data`, or throws ApiError
 * with the backend error code. Network failures become NETWORK_ERROR.
 */
export async function unwrap<T>(call: Promise<Result<T>>): Promise<T> {
  let r: Result<T>;
  try {
    r = await call;
  } catch (e) {
    throw networkError(e);
  }
  if (r.error !== undefined || !r.response.ok || !r.data) throw toApiError(r.response.status, r.error);
  return r.data.data;
}

/** Like `unwrap`, but keeps the list envelope's `meta` (pagination). */
export async function unwrapList<T, M>(
  call: Promise<{ data?: { data: T; meta: M }; error?: unknown; response: Response }>,
) {
  let r: Awaited<typeof call>;
  try {
    r = await call;
  } catch (e) {
    throw networkError(e);
  }
  if (r.error !== undefined || !r.response.ok || !r.data) throw toApiError(r.response.status, r.error);
  return { items: r.data.data, meta: r.data.meta };
}

/** For `204 No Content` answers: resolves when the call succeeded, throws ApiError otherwise. */
export async function unwrapVoid(call: Promise<{ error?: unknown; response: Response }>): Promise<void> {
  let r: Awaited<typeof call>;
  try {
    r = await call;
  } catch (e) {
    throw networkError(e);
  }
  if (r.error !== undefined || !r.response.ok) throw toApiError(r.response.status, r.error);
}
