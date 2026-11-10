import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from '@/core/api/client';
import { useSession } from '@/core/auth/session';

/** Account-level calls (`/v1/auth/*`, `/v1/notification-preferences`): no organization header. */

export function useSessions() {
  return useQuery({
    queryKey: ['account', 'sessions'],
    queryFn: async () => (await unwrap(api.GET('/v1/auth/sessions'))).items ?? [],
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (uuid: string) => unwrap(api.DELETE('/v1/auth/sessions/{uuid}', { params: { path: { uuid } } })),
    onSettled: () => qc.invalidateQueries({ queryKey: ['account', 'sessions'] }),
  });
}

export function useRevokeOtherSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST('/v1/auth/sessions/revoke-others')),
    onSettled: () => qc.invalidateQueries({ queryKey: ['account', 'sessions'] }),
  });
}

export function useTotpStatus() {
  return useQuery({ queryKey: ['account', 'totp'], queryFn: () => unwrap(api.GET('/v1/auth/totp')) });
}

export const totpApi = {
  setup: () => unwrap(api.POST('/v1/auth/totp/setup')),
  confirm: (code: string) => unwrap(api.POST('/v1/auth/totp/confirm', { body: { code } })),
  disable: (code: string) => unwrap(api.POST('/v1/auth/totp/disable', { body: { code } })),
};

export function usePasskeys() {
  return useQuery({
    queryKey: ['account', 'passkeys'],
    queryFn: async () => (await unwrap(api.GET('/v1/auth/passkeys'))).items ?? [],
  });
}

export function useDeletePasskey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (uuid: string) => unwrap(api.DELETE('/v1/auth/passkeys/{uuid}', { params: { path: { uuid } } })),
    onSettled: () => qc.invalidateQueries({ queryKey: ['account', 'passkeys'] }),
  });
}

/** `PATCH /v1/auth/profile`; then the cached session (`/v1/auth/me`) is refreshed. */
export function useUpdateProfile() {
  return useMutation({
    mutationFn: (body: { name: string; surname: string }) => unwrap(api.PATCH('/v1/auth/profile', { body })),
    onSuccess: () => useSession.getState().refreshMe(),
  });
}

export function useRequestEmailVerify() {
  return useMutation({
    mutationFn: (email: string) => unwrap(api.POST('/v1/auth/email/verify-request', { body: { email } })),
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: ['account', 'notification-preferences'],
    queryFn: () => unwrap(api.GET('/v1/notification-preferences')),
  });
}

export type NotificationPreferences = NonNullable<ReturnType<typeof useNotificationPreferences>['data']>;

export function useSaveNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NotificationPreferences) => unwrap(api.PUT('/v1/notification-preferences', { body })),
    onSuccess: (saved) => qc.setQueryData(['account', 'notification-preferences'], saved),
  });
}

export const deletionApi = {
  /** E-mails the 6-digit confirmation code (409 LAST_ORGANIZATION_OWNER when the user must hand over first). */
  requestCode: () => unwrap(api.POST('/v1/auth/account/deactivate/request')),
  /** With `code`, or `{}` after a step-up grant (else 403 STEP_UP_REQUIRED). */
  deactivate: (code?: string) => unwrap(api.POST('/v1/auth/account/deactivate', { body: code ? { code } : {} })),
};

export const stepUpApi = {
  status: () => unwrap(api.GET('/v1/auth/step-up')),
  password: (password: string) => unwrap(api.POST('/v1/auth/step-up/password', { body: { password } })),
  totp: (code: string) => unwrap(api.POST('/v1/auth/step-up/totp', { body: { code } })),
};
