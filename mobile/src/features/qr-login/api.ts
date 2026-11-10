import { useMutation, useQuery } from '@tanstack/react-query';

import { api, unwrap } from '@/core/api/client';
import { isApiError } from '@/core/api/errors';

/**
 * QR web sign-in on the phone (`/v1/auth/qr/sessions/{id}`, `auth.session`):
 * the first signed-in viewer claims the session, then approves or rejects
 * it. Details are never cached: the code lives about two minutes.
 */
export function useQrSession(id: string) {
  return useQuery({
    queryKey: ['qr-login', id],
    enabled: !!id,
    gcTime: 0,
    staleTime: Infinity,
    retry: (n, e) => n < 2 && isApiError(e, 'NETWORK_ERROR'),
    queryFn: () => unwrap(api.GET('/v1/auth/qr/sessions/{id}', { params: { path: { id } } })),
  });
}

export function useQrDecision(id: string) {
  return useMutation({
    mutationFn: (decision: 'approve' | 'reject') =>
      decision === 'approve'
        ? unwrap(api.POST('/v1/auth/qr/sessions/{id}/approve', { params: { path: { id } } }))
        : unwrap(api.POST('/v1/auth/qr/sessions/{id}/reject', { params: { path: { id } } })),
  });
}
