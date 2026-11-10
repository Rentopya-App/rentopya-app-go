import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, orgHeader, unwrap } from '@/core/api/client';
import { useSession } from '@/core/auth/session';
import { nextOffset, PAGE_SIZE } from '@/ui/paged-list';

import type {
  Transfer,
  TransferAction,
  TransferActionRequest,
  TransferCreateRequest,
  TransferPatchRequest,
  transferQuery,
} from './lib';

const useOrg = () => useSession((s) => s.organization?.slug ?? '');

/** Every cached transfer query starts with this key (the fleet calendar refreshes with it). */
const KEY = 'transfers';

/** `GET /v1/tenant/transfers`, paged (`tenant.transfers.read`; the API applies the branch scope). */
export function useTransferList(query: ReturnType<typeof transferQuery>) {
  const org = useOrg();
  return useInfiniteQuery({
    queryKey: [KEY, org, 'list', query],
    enabled: !!org,
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/v1/tenant/transfers', {
          params: { header: orgHeader(), query: { ...query, limit: PAGE_SIZE, offset: pageParam } },
        }),
      ),
  });
}

export function useTransfer(uuid: string) {
  const org = useOrg();
  return useQuery({
    queryKey: [KEY, org, 'one', uuid],
    enabled: !!org && !!uuid,
    queryFn: () => unwrap(api.GET('/v1/tenant/transfers/{uuid}', { params: { header: orgHeader(), path: { uuid } } })),
  });
}

/** The transfer's audit events (newest first), first page. */
export function useTransferActivity(uuid: string) {
  const org = useOrg();
  return useQuery({
    queryKey: [KEY, org, 'activity', uuid],
    enabled: !!org && !!uuid,
    queryFn: () =>
      unwrap(
        api.GET('/v1/tenant/transfers/{uuid}/activity', {
          params: { header: orgHeader(), path: { uuid }, query: { limit: 20, offset: 0 } },
        }),
      ),
  });
}

/** Members who can be responsible (`tenant.transfers.write`). */
export function useTransferAssignees(enabled: boolean) {
  const org = useOrg();
  return useQuery({
    queryKey: [KEY, org, 'assignees'],
    enabled: !!org && enabled,
    staleTime: 5 * 60_000,
    queryFn: () =>
      unwrap(api.GET('/v1/tenant/transfers/assignees', { params: { header: orgHeader(), query: { q: '' } } })),
  });
}

/** Active vehicles for the create form's picker (server-side plate search). */
export function useVehicleOptions(q: string, enabled: boolean) {
  const org = useOrg();
  return useQuery({
    queryKey: [KEY, org, 'vehicle-options', q],
    enabled: !!org && enabled,
    placeholderData: (previous) => previous,
    queryFn: () =>
      unwrap(
        api.GET('/v1/tenant/vehicles', {
          params: {
            header: orgHeader(),
            query: { limit: 20, offset: 0, sort: 'plate', is_active: true, ...(q.trim() ? { q: q.trim() } : {}) },
          },
        }),
      ),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  const org = useOrg();
  return (t?: Transfer) => {
    if (t) qc.setQueryData([KEY, org, 'one', t.uuid], t);
    void qc.invalidateQueries({ queryKey: [KEY, org] });
    // The vehicle moved or changed status, and the calendar draws transfers.
    void qc.invalidateQueries({ queryKey: ['vehicles', org] });
    void qc.invalidateQueries({ queryKey: ['fleet-calendar', org] });
    if (t) void qc.invalidateQueries({ queryKey: ['vehicle', org, t.vehicle.uuid] });
  };
}

export function useCreateTransfer() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: (body: TransferCreateRequest) =>
      unwrap(api.POST('/v1/tenant/transfers', { params: { header: orgHeader() }, body })),
    onSuccess: done,
  });
}

export function useUpdateTransfer(uuid: string) {
  const done = useInvalidate();
  return useMutation({
    mutationFn: (body: TransferPatchRequest) =>
      unwrap(api.PATCH('/v1/tenant/transfers/{uuid}', { params: { header: orgHeader(), path: { uuid } }, body })),
    onSuccess: done,
  });
}

function postAction(uuid: string, action: TransferAction, body: TransferActionRequest) {
  const params = { header: orgHeader(), path: { uuid } };
  switch (action) {
    case 'start':
      return unwrap(api.POST('/v1/tenant/transfers/{uuid}/start', { params, body }));
    case 'complete':
      return unwrap(api.POST('/v1/tenant/transfers/{uuid}/complete', { params, body }));
    case 'cancel':
      return unwrap(api.POST('/v1/tenant/transfers/{uuid}/cancel', { params, body }));
  }
}

/** Start, complete or cancel; the answer replaces the cached detail. */
export function useTransferAction(uuid: string, action: TransferAction) {
  const done = useInvalidate();
  const qc = useQueryClient();
  const org = useOrg();
  return useMutation({
    mutationFn: (body: TransferActionRequest) => postAction(uuid, action, body),
    onSuccess: done,
    // A 409 means it moved on elsewhere: show its current state.
    onError: () => void qc.invalidateQueries({ queryKey: [KEY, org, 'one', uuid] }),
  });
}
