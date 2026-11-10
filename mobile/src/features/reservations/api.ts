import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api, orgHeader, unwrap } from '@/core/api/client';
import { ApiError, isApiError, toApiError } from '@/core/api/errors';
import { useSession } from '@/core/auth/session';
import { nextOffset, PAGE_SIZE } from '@/ui/paged-list';

import {
  listQuery,
  reservationProblem,
  type CollectMethod,
  type CustomerRequest,
  type ListFilters,
  type Reservation,
  type ResolutionTask,
} from './lib';

type Call<T> = Promise<{ data?: { data: T }; error?: unknown; response: Response }>;

/**
 * Like `unwrap`, but keeps the error envelope's `data`: a changed price
 * (the fresh quote), an extension conflict (alternatives) or ineligible
 * drivers come back there, and the screens offer the next step from it.
 */
async function withData<T>(call: Call<T>): Promise<T> {
  let r: Awaited<Call<T>>;
  try {
    r = await call;
  } catch (e) {
    throw new ApiError(0, { code: 'NETWORK_ERROR', message: e instanceof Error ? e.message : String(e) });
  }
  if (r.error !== undefined || !r.response.ok || !r.data) {
    const err = toApiError(r.response.status, r.error) as ApiError & { data?: unknown };
    err.data = (r.error as { data?: unknown } | undefined)?.data ?? null;
    throw err;
  }
  return r.data.data;
}

/** The panel's `reservationProblem` of anything a reservation call threw. */
export function problemOf(e: unknown) {
  if (!isApiError(e)) return reservationProblem(undefined, null);
  return reservationProblem(e.code, (e as ApiError & { data?: unknown }).data, e.details);
}

function useOrg() {
  return useSession((s) => s.organization?.slug);
}

// ---------------------------------------------------------------- reservations

export function useReservations(filters: ListFilters, extra?: { status?: string; sort?: string }) {
  const org = useOrg();
  const query = { ...listQuery(filters), ...extra };
  return useInfiniteQuery({
    queryKey: ['reservations', org, query],
    enabled: !!org,
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/v1/tenant/reservations', {
          params: { header: orgHeader(), query: { ...query, limit: PAGE_SIZE, offset: pageParam } },
        }),
      ),
  });
}

export function useReservation(uuid: string) {
  const org = useOrg();
  return useQuery({
    queryKey: ['reservation', org, uuid],
    enabled: !!org && !!uuid,
    queryFn: () =>
      unwrap(api.GET('/v1/tenant/reservations/{uuid}', { params: { header: orgHeader(), path: { uuid } } })),
  });
}

export function useReservationEvents(uuid: string) {
  const org = useOrg();
  return useInfiniteQuery({
    queryKey: ['reservation-events', org, uuid],
    enabled: !!org && !!uuid,
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/v1/tenant/reservations/{uuid}/events', {
          params: { header: orgHeader(), path: { uuid }, query: { limit: 20, offset: pageParam } },
        }),
      ),
  });
}

/** After any write on a reservation: the answer replaces the cached detail; lists and sections refresh. */
function settle(qc: QueryClient, org: string | undefined, r: Reservation) {
  qc.setQueryData(['reservation', org, r.uuid], r);
  void qc.invalidateQueries({ queryKey: ['reservations'] });
  void qc.invalidateQueries({ queryKey: ['reservation-events', org, r.uuid] });
  void qc.invalidateQueries({ queryKey: ['reservation-links', org, r.uuid] });
  void qc.invalidateQueries({ queryKey: ['reservation-payments', org, r.uuid] });
  void qc.invalidateQueries({ queryKey: ['resolution-tasks'] });
}

function useReservationMutation<V>(uuid: string, fn: (v: V) => Promise<Reservation>) {
  const org = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => settle(qc, org, r),
    // A 409 means the reservation moved on elsewhere: show its current state.
    onError: () => void qc.invalidateQueries({ queryKey: ['reservation', org, uuid] }),
  });
}

export type Transition = 'submit' | 'confirm' | 'cancel' | 'no-show';

/** submit / confirm (no body), cancel / no-show (reason). */
export function useTransition(uuid: string) {
  return useReservationMutation(uuid, ({ action, reason }: { action: Transition; reason?: string }) => {
    const params = { header: orgHeader(), path: { uuid } };
    switch (action) {
      case 'submit':
        return unwrap(api.POST('/v1/tenant/reservations/{uuid}/submit', { params }));
      case 'confirm':
        return unwrap(api.POST('/v1/tenant/reservations/{uuid}/confirm', { params }));
      case 'cancel':
        return unwrap(api.POST('/v1/tenant/reservations/{uuid}/cancel', { params, body: { reason: reason ?? '' } }));
      case 'no-show':
        return unwrap(api.POST('/v1/tenant/reservations/{uuid}/no-show', { params, body: { reason: reason ?? '' } }));
    }
  });
}

/** Staff accept (approval queue and detail, `tenant.reservations.approve`); answers the payment link too. */
export function useAccept(uuid: string) {
  const org = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { quote_uuid?: string; send_payment_link: boolean; note?: string }) =>
      withData(
        api.POST('/v1/tenant/reservations/{uuid}/accept', {
          params: { header: orgHeader(), path: { uuid } },
          body,
        }),
      ),
    onSuccess: (out) => settle(qc, org, out.reservation),
  });
}

export function useReject(uuid: string) {
  return useReservationMutation(uuid, (reason: string) =>
    unwrap(
      api.POST('/v1/tenant/reservations/{uuid}/reject', {
        params: { header: orgHeader(), path: { uuid } },
        body: { reason },
      }),
    ),
  );
}

export function useExtend(uuid: string) {
  return useReservationMutation(uuid, async (body: { ends_at: string; reason?: string }) => {
    const out = await withData(
      api.POST('/v1/tenant/reservations/{uuid}/extend', { params: { header: orgHeader(), path: { uuid } }, body }),
    );
    return out.reservation;
  });
}

export function useApplyChange(uuid: string) {
  return useReservationMutation(uuid, async (body: { quote_uuid: string; reason?: string; keep_price?: boolean }) => {
    const out = await withData(
      api.POST('/v1/tenant/reservations/{uuid}/change', { params: { header: orgHeader(), path: { uuid } }, body }),
    );
    return out.reservation;
  });
}

export function useChangeQuote(uuid: string) {
  return useMutation({
    mutationFn: (body: {
      pickup_branch_uuid: string;
      return_branch_uuid: string;
      starts_at: string;
      ends_at: string;
      product_uuid: string | null;
    }) =>
      withData(
        api.POST('/v1/tenant/reservations/{uuid}/quotes', { params: { header: orgHeader(), path: { uuid } }, body }),
      ),
  });
}

/** Products on sale for the reservation's slot (the change screen's product choice, `tenant.quotes.read`). */
export function useQuoteSearch(
  body: { pickup_branch_uuid: string; return_branch_uuid: string; starts_at: string; ends_at: string; channel: string },
  enabled: boolean,
) {
  const org = useOrg();
  return useQuery({
    queryKey: ['quote-search', org, body],
    enabled: !!org && enabled,
    queryFn: () => unwrap(api.POST('/v1/tenant/quotes/search', { params: { header: orgHeader() }, body })),
  });
}

export function usePlateCandidates(uuid: string) {
  const org = useOrg();
  return useQuery({
    queryKey: ['plate-candidates', org, uuid],
    enabled: !!org && !!uuid,
    staleTime: 0,
    queryFn: () =>
      unwrap(
        api.GET('/v1/tenant/reservations/{uuid}/plate-candidates', {
          params: { header: orgHeader(), path: { uuid } },
        }),
      ),
  });
}

export function usePlate(uuid: string) {
  return useReservationMutation(uuid, async (body: { vehicle_uuid: string; fix: boolean; reason?: string }) => {
    const out = await withData(
      api.POST('/v1/tenant/reservations/{uuid}/plate', {
        params: { header: orgHeader(), path: { uuid } },
        body: { ...body, source: 'staff' },
      }),
    );
    return out.reservation;
  });
}

export function useCustomerDrivers(customerUuid: string) {
  const org = useOrg();
  return useQuery({
    queryKey: ['customer-drivers', org, customerUuid],
    enabled: !!org && !!customerUuid,
    queryFn: () =>
      unwrap(
        api.GET('/v1/tenant/customers/{uuid}/drivers', {
          params: { header: orgHeader(), path: { uuid: customerUuid } },
        }),
      ),
  });
}

export function useUpdateDrivers(uuid: string) {
  return useReservationMutation(
    uuid,
    (body: {
      drivers: { driver_uuid: string; role: 'primary' | 'additional' }[];
      eligibility_override: { reason: string } | null;
    }) =>
      withData(
        api.PUT('/v1/tenant/reservations/{uuid}/drivers', {
          params: { header: orgHeader(), path: { uuid } },
          body: { drivers: body.drivers, eligibility_override: body.eligibility_override ?? undefined },
        }),
      ),
  );
}

export function useAssign(uuid: string) {
  return useReservationMutation(uuid, (userUuid: string | null) =>
    unwrap(
      api.POST('/v1/tenant/reservations/{uuid}/assign', {
        params: { header: orgHeader(), path: { uuid } },
        body: { user_uuid: userUuid },
      }),
    ),
  );
}

/** Member search for the staff pickers (`tenant.members.read`; without it the list is empty). */
export function useMembers(q: string, enabled: boolean) {
  const org = useOrg();
  return useQuery({
    queryKey: ['members', org, q],
    enabled: !!org && enabled,
    retry: false,
    queryFn: () =>
      unwrap(
        api.GET('/v1/tenant/members', {
          params: { header: orgHeader(), query: { limit: 20, offset: 0, ...(q ? { q } : {}) } },
        }),
      ),
  });
}

// ---------------------------------------------------------------- payments

export function usePaymentLinks(reservationUuid: string, enabled: boolean) {
  const org = useOrg();
  return useQuery({
    queryKey: ['reservation-links', org, reservationUuid],
    enabled: !!org && enabled,
    queryFn: () =>
      unwrap(
        api.GET('/v1/tenant/payment-links', {
          params: { header: orgHeader(), query: { limit: 20, offset: 0, reservation: reservationUuid } },
        }),
      ),
  });
}

export function usePayments(reservationUuid: string, enabled: boolean) {
  const org = useOrg();
  return useQuery({
    queryKey: ['reservation-payments', org, reservationUuid],
    enabled: !!org && enabled,
    queryFn: () =>
      unwrap(
        api.GET('/v1/tenant/payments', {
          params: {
            header: orgHeader(),
            query: { limit: 50, offset: 0, sort: '-created_at', reservation: reservationUuid },
          },
        }),
      ),
  });
}

function useAfterPayment(reservationUuid: string) {
  const org = useOrg();
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['reservation', org, reservationUuid] });
    void qc.invalidateQueries({ queryKey: ['reservation-links', org, reservationUuid] });
    void qc.invalidateQueries({ queryKey: ['reservation-payments', org, reservationUuid] });
    void qc.invalidateQueries({ queryKey: ['reservation-events', org, reservationUuid] });
  };
}

export function useCreateLink(reservationUuid: string) {
  const after = useAfterPayment(reservationUuid);
  return useMutation({
    mutationFn: (body: { amount?: string }) =>
      unwrap(
        api.POST('/v1/tenant/reservations/{uuid}/payment-links', {
          params: { header: orgHeader(), path: { uuid: reservationUuid } },
          body,
        }),
      ),
    onSuccess: after,
  });
}

export function useCancelLink(reservationUuid: string) {
  const after = useAfterPayment(reservationUuid);
  return useMutation({
    mutationFn: (linkUuid: string) =>
      unwrap(
        api.POST('/v1/tenant/payment-links/{uuid}/cancel', {
          params: { header: orgHeader(), path: { uuid: linkUuid } },
        }),
      ),
    onSuccess: after,
  });
}

export function useCollect(reservationUuid: string) {
  const after = useAfterPayment(reservationUuid);
  return useMutation({
    mutationFn: (body: { amount?: string; method: CollectMethod; note?: string }) =>
      unwrap(
        api.POST('/v1/tenant/reservations/{uuid}/collections', {
          params: { header: orgHeader(), path: { uuid: reservationUuid } },
          body,
        }),
      ),
    onSuccess: after,
  });
}

// ---------------------------------------------------------------- quotes

export function useQuotes(filters: { q: string; status: string }) {
  const org = useOrg();
  const q = filters.q.trim();
  const query = {
    sort: '-created_at',
    ...(q ? { q } : {}),
    ...(filters.status !== 'all' ? { status: filters.status } : {}),
  };
  return useInfiniteQuery({
    queryKey: ['quotes', org, query],
    enabled: !!org,
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/v1/tenant/quotes', {
          params: { header: orgHeader(), query: { ...query, limit: PAGE_SIZE, offset: pageParam } },
        }),
      ),
  });
}

// ---------------------------------------------------------------- resolution tasks

export function useTasks(filters: { q: string; status: string; reservation?: string }, enabled = true) {
  const org = useOrg();
  const q = filters.q.trim();
  const query = {
    sort: '-created_at',
    ...(q ? { q } : {}),
    ...(filters.status !== 'all' ? { status: filters.status } : {}),
    ...(filters.reservation ? { reservation: filters.reservation } : {}),
  };
  return useInfiniteQuery({
    queryKey: ['resolution-tasks', org, query],
    enabled: !!org && enabled,
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/v1/tenant/resolution-tasks', {
          params: { header: orgHeader(), query: { ...query, limit: PAGE_SIZE, offset: pageParam } },
        }),
      ),
  });
}

export function useTask(uuid: string) {
  const org = useOrg();
  return useQuery({
    queryKey: ['resolution-task', org, uuid],
    enabled: !!org && !!uuid,
    queryFn: () =>
      unwrap(api.GET('/v1/tenant/resolution-tasks/{uuid}', { params: { header: orgHeader(), path: { uuid } } })),
  });
}

function useTaskSettle() {
  const org = useOrg();
  const qc = useQueryClient();
  return (task: ResolutionTask) => {
    qc.setQueryData(['resolution-task', org, task.uuid], task);
    void qc.invalidateQueries({ queryKey: ['resolution-tasks'] });
    void qc.invalidateQueries({ queryKey: ['reservation', org, task.reservation.uuid] });
    void qc.invalidateQueries({ queryKey: ['reservation-events', org, task.reservation.uuid] });
  };
}

export function useResolveTask(uuid: string) {
  const done = useTaskSettle();
  return useMutation({
    mutationFn: (note: string) =>
      unwrap(
        api.POST('/v1/tenant/resolution-tasks/{uuid}/resolve', {
          params: { header: orgHeader(), path: { uuid } },
          body: { note },
        }),
      ),
    onSuccess: done,
  });
}

export function useAssignTask(uuid: string) {
  const done = useTaskSettle();
  return useMutation({
    mutationFn: (userUuid: string | null) =>
      unwrap(
        api.POST('/v1/tenant/resolution-tasks/{uuid}/assign', {
          params: { header: orgHeader(), path: { uuid } },
          body: { user_uuid: userUuid },
        }),
      ),
    onSuccess: done,
  });
}

export function useReplanTask(uuid: string) {
  const done = useTaskSettle();
  return useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/v1/tenant/resolution-tasks/{uuid}/replan', { params: { header: orgHeader(), path: { uuid } } }),
      ),
    onSuccess: (out) => done(out.task),
  });
}

// ---------------------------------------------------------------- customer requests

export function useCustomerRequests(filters: { q: string; status: string; reservation?: string }) {
  const org = useOrg();
  const q = filters.q.trim();
  const query = {
    sort: '-created_at',
    ...(q ? { q } : {}),
    ...(filters.status !== 'all' ? { status: filters.status } : {}),
    ...(filters.reservation ? { reservation: filters.reservation } : {}),
  };
  return useInfiniteQuery({
    queryKey: ['customer-requests', org, query],
    enabled: !!org,
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/v1/tenant/customer-requests', {
          params: { header: orgHeader(), query: { ...query, limit: PAGE_SIZE, offset: pageParam } },
        }),
      ),
  });
}

export function useCustomerRequest(uuid: string) {
  const org = useOrg();
  return useQuery({
    queryKey: ['customer-request', org, uuid],
    enabled: !!org && !!uuid,
    queryFn: () =>
      unwrap(api.GET('/v1/tenant/customer-requests/{uuid}', { params: { header: orgHeader(), path: { uuid } } })),
  });
}

export function useResolveRequest(uuid: string) {
  const org = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { status: 'resolved' | 'rejected'; note: string }) =>
      unwrap(
        api.POST('/v1/tenant/customer-requests/{uuid}/resolve', {
          params: { header: orgHeader(), path: { uuid } },
          body,
        }),
      ),
    onSuccess: (req: CustomerRequest) => {
      qc.setQueryData(['customer-request', org, uuid], req);
      void qc.invalidateQueries({ queryKey: ['customer-requests'] });
      void qc.invalidateQueries({ queryKey: ['reservation-events', org, req.reservation.uuid] });
    },
  });
}
