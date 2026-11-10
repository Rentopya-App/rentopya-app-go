import { api, unwrap } from '@/core/api/client';
import type { components } from '@/core/api/schema';

import { getTokens } from './tokens';

export type Me = components['schemas']['Me'];
export type { MeOrganization } from './organization';
export type ApiTokens = components['schemas']['Tokens'];

/** E-mail + password; `MFA_REQUIRED` asks for the authenticator code on a second try. */
export function login(input: { email: string; password: string; totpCode?: string }) {
  return unwrap(
    api.POST('/v1/auth/login', {
      body: { email: input.email.trim(), password: input.password, totp_code: input.totpCode?.trim() || undefined },
    }),
  );
}

/** The user, account-level permissions and organization memberships (each with its own permissions). */
export function fetchMe() {
  return unwrap(api.GET('/v1/auth/me'));
}

/** Revokes this device's refresh token (the access token expires on its own). */
export function logout() {
  const refresh = getTokens()?.refresh;
  if (!refresh) return Promise.resolve(undefined);
  return unwrap(api.POST('/v1/auth/logout', { body: { refresh_token: refresh } }));
}
