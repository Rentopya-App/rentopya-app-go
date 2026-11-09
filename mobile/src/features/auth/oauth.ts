import { api, unwrap } from '@/core/api/client';
import type { components } from '@/core/api/schema';

export type NativeProvider = 'apple' | 'google';
/** What `/v1/auth/oauth/{provider}/native` needs from one provider sheet. */
export type NativeCredential = components['schemas']['NativeOAuthRequest'];

/**
 * Signs in (or creates the account) with a native Apple / Google id token.
 * An Apple relay e-mail without a linked account answers
 * `OAUTH_LINK_CHOICE_REQUIRED` (see `link-choice.ts`); 2FA answers
 * `MFA_REQUIRED`, then send the same credential again with the code.
 */
export function nativeSignIn(provider: NativeProvider, credential: NativeCredential, totpCode?: string) {
  return unwrap(
    api.POST('/v1/auth/oauth/{provider}/native', {
      params: { path: { provider } },
      body: { ...credential, totp_code: totpCode?.trim() || undefined },
    }),
  );
}

/** "I have an account": e-mails a link code to that account. */
export function requestLinkCode(ticket: string, email: string) {
  return unwrap(api.POST('/v1/auth/oauth/link/request', { body: { link_ticket: ticket, email: email.trim() } }));
}

export function verifyLink(input: { ticket: string; email: string; code: string; totpCode?: string }) {
  return unwrap(
    api.POST('/v1/auth/oauth/link/verify', {
      body: {
        link_ticket: input.ticket,
        email: input.email.trim(),
        code: input.code.trim(),
        totp_code: input.totpCode?.trim() || undefined,
      },
    }),
  );
}

/** "Create a new account" with the provider identity. */
export function createFromLink(ticket: string, totpCode?: string) {
  return unwrap(
    api.POST('/v1/auth/oauth/link/create', { body: { link_ticket: ticket, totp_code: totpCode?.trim() || undefined } }),
  );
}
