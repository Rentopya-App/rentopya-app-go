import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, orgHeader, unwrap } from '@/core/api/client';
import { ApiError, isApiError, toApiError } from '@/core/api/errors';
import { useSession } from '@/core/auth/session';
import { nextOffset, PAGE_SIZE } from '@/ui/paged-list';

import {
  capacityProblem,
  createProblem,
  type QuoteRequest,
  type ReservationCreateRequest,
  type SearchRequest,
} from './lib';

type Call<T> = Promise<{ data?: { data: T }; error?: unknown; response: Response }>;

/** Like `unwrap`, but keeps the error envelope's `data` (alternatives, a fresh quote, ineligible drivers). */
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

const dataOf = (e: unknown) => (e as { data?: unknown }).data;

export function capacityOf(e: unknown) {
  return isApiError(e) ? capacityProblem(e.code, dataOf(e), e.details) : null;
}

export function createProblemOf(e: unknown) {
  return isApiError(e) ? createProblem(e.code, dataOf(e), e.details) : createProblem(undefined, null);
}

function useOrg() {
  return useSession((s) => s.organization?.slug);
}

// ---------------------------------------------------------------- availability

export function useAvailabilitySearch(body: SearchRequest | null) {
  const org = useOrg();
  return useQuery({
    queryKey: ['availability-search', org, body],
    enabled: !!org && !!body,
    staleTime: 0,
    queryFn: () => unwrap(api.POST('/v1/tenant/availability/search', { params: { header: orgHeader() }, body: body! })),
  });
}

export function useHolds() {
  const org = useOrg();
  return useInfiniteQuery({
    queryKey: ['availability-holds', org],
    enabled: !!org,
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/v1/tenant/availability/holds', {
          params: { header: orgHeader(), query: { status: 'active', limit: PAGE_SIZE, offset: pageParam } },
        }),
      ),
  });
}

function useAfterHold() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['availability-holds'] });
    void qc.invalidateQueries({ queryKey: ['availability-search'] });
  };
}

export function useCreateHold() {
  const after = useAfterHold();
  return useMutation({
    mutationFn: (body: SearchRequest & { product_uuid: string; hold_minutes: number; note: string }) =>
      withData(api.POST('/v1/tenant/availability/holds', { params: { header: orgHeader() }, body })),
    onSuccess: after,
  });
}

export function useExtendHold() {
  const after = useAfterHold();
  return useMutation({
    mutationFn: ({ uuid, minutes }: { uuid: string; minutes: number }) =>
      unwrap(
        api.POST('/v1/tenant/availability/holds/{uuid}/extend', {
          params: { header: orgHeader(), path: { uuid } },
          body: { minutes },
        }),
      ),
    onSuccess: after,
  });
}

export function useReleaseHold() {
  const after = useAfterHold();
  return useMutation({
    mutationFn: (uuid: string) =>
      unwrap(api.DELETE('/v1/tenant/availability/holds/{uuid}', { params: { header: orgHeader(), path: { uuid } } })),
    onSuccess: after,
  });
}

// ---------------------------------------------------------------- wizard

/** Products on sale for the slot with their price (`tenant.quotes.read`). */
export function useProductSearch(body: SearchRequest | null) {
  const org = useOrg();
  return useQuery({
    queryKey: ['quote-search', org, body],
    enabled: !!org && !!body,
    staleTime: 0,
    queryFn: () => withData(api.POST('/v1/tenant/quotes/search', { params: { header: orgHeader() }, body: body! })),
  });
}

/** Customer search for the wizard (`tenant.customers.read`). */
export function useCustomerSearch(q: string, enabled: boolean) {
  const org = useOrg();
  return useQuery({
    queryKey: ['customers', org, 'pick', q],
    enabled: !!org && enabled,
    retry: false,
    queryFn: () =>
      unwrap(
        api.GET('/v1/tenant/customers', {
          params: { header: orgHeader(), query: { limit: 20, offset: 0, sort: 'display_name', ...(q ? { q } : {}) } },
        }),
      ),
  });
}

export function useCreateQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: QuoteRequest) =>
      withData(api.POST('/v1/tenant/quotes', { params: { header: orgHeader() }, body })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['quotes'] }),
  });
}

export function useCreateReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReservationCreateRequest) =>
      withData(api.POST('/v1/tenant/reservations', { params: { header: orgHeader() }, body })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reservations'] });
      void qc.invalidateQueries({ queryKey: ['quotes'] });
      void qc.invalidateQueries({ queryKey: ['availability-holds'] });
    },
  });
}
