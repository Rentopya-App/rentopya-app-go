import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, orgHeader, unwrap } from '@/core/api/client';
import type { components } from '@/core/api/schema';
import { Permission, useCan } from '@/core/auth/permissions';
import { useSession } from '@/core/auth/session';
import { nextOffset, PAGE_SIZE } from '@/ui/paged-list';

import {
  collectionQuery,
  depositQuery,
  type CollectionFilters,
  type DepositFilters,
  type RefundBody,
  type ResolveBody,
} from './model';

type S = components['schemas'];
export type CashAccount = S['CashAccount'];
export type RentalCharge = S['RentalCharge'];

const useOrg = () => useSession((s) => s.organization?.slug ?? '');

/**
 * Query keys start with `['tenant', slug, area]`, the same prefix the handover
 * wizard's deposit card uses, so a deposit taken there refreshes these lists.
 */
const keys = {
  collections: (org: string) => ['tenant', org, 'finance', 'collections'] as const,
  deposits: (org: string) => ['tenant', org, 'deposits'] as const,
  links: (org: string) => ['tenant', org, 'payment-links'] as const,
  orphans: (org: string) => ['tenant', org, 'payment-orphans'] as const,
};

/** After any money action: the finance lists and the screens that show the same money. */
function useInvalidateMoney() {
  const org = useOrg();
  const qc = useQueryClient();
  return () => {
    for (const area of [
      'finance',
      'deposits',
      'payment-links',
      'payment-orphans',
      'rentals',
      'inspections',
      'field-tasks',
    ])
      void qc.invalidateQueries({ queryKey: ['tenant', org, area] });
    // Payment cards of the reservation screens.
    void qc.invalidateQueries({ queryKey: ['reservation-payments', org] });
  };
}

// ---------------------------------------------------------------- collections

/** `GET /v1/tenant/finance/collections` (`tenant.finance.accounts.read`). */
export function useCollections(f: CollectionFilters, enabled: boolean) {
  const org = useOrg();
  return useInfiniteQuery({
    queryKey: [...keys.collections(org), 'list', f],
    enabled,
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam, signal }) =>
      unwrap(
        api.GET('/v1/tenant/finance/collections', {
          params: { header: orgHeader(), query: { limit: PAGE_SIZE, offset: pageParam, ...collectionQuery(f) } },
          signal,
        }),
      ),
  });
}

export function useCollection(uuid: string) {
  const org = useOrg();
  return useQuery({
    queryKey: [...keys.collections(org), 'one', uuid],
    enabled: !!uuid,
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/v1/tenant/finance/collections/{uuid}', { params: { header: orgHeader(), path: { uuid } }, signal }),
      ),
  });
}

/** Active tills and bank accounts (`tenant.finance.cash.read`; without it nothing is fetched). */
export function useCashAccounts(enabled: boolean) {
  const org = useOrg();
  const can = useCan();
  return useQuery({
    queryKey: ['tenant', org, 'finance', 'cash-accounts', 'active'],
    enabled: enabled && can(Permission.TenantFinanceCashRead),
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/v1/tenant/finance/cash-accounts', {
          params: { header: orgHeader(), query: { limit: 100, offset: 0, status: 'active', sort: 'code' } },
          signal,
        }),
      ),
  });
}

export function useRefundCollection(uuid: string) {
  const done = useInvalidateMoney();
  return useMutation({
    mutationFn: (body: RefundBody) =>
      unwrap(
        api.POST('/v1/tenant/finance/collections/{uuid}/refund', {
          params: { header: orgHeader(), path: { uuid } },
          body,
        }),
      ),
    onSuccess: done,
  });
}

export function useVoidCollection(uuid: string) {
  const done = useInvalidateMoney();
  return useMutation({
    mutationFn: (reason: string) =>
      unwrap(
        api.POST('/v1/tenant/finance/collections/{uuid}/void', {
          params: { header: orgHeader(), path: { uuid } },
          body: { reason },
        }),
      ),
    onSuccess: done,
  });
}

// ---------------------------------------------------------------- payment links

/** `GET /v1/tenant/payment-links` (`tenant.payments.read`), every reservation's links. */
export function usePaymentLinks(status: string | null, enabled: boolean) {
  const org = useOrg();
  return useInfiniteQuery({
    queryKey: [...keys.links(org), status],
    enabled,
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam, signal }) =>
      unwrap(
        api.GET('/v1/tenant/payment-links', {
          params: {
            header: orgHeader(),
            query: { limit: PAGE_SIZE, offset: pageParam, ...(status ? { status } : {}) },
          },
          signal,
        }),
      ),
  });
}

export function useCancelPaymentLink() {
  const done = useInvalidateMoney();
  return useMutation({
    mutationFn: (uuid: string) =>
      unwrap(api.POST('/v1/tenant/payment-links/{uuid}/cancel', { params: { header: orgHeader(), path: { uuid } } })),
    onSuccess: done,
  });
}

// ---------------------------------------------------------------- unmatched payments

/** `GET /v1/tenant/payments/orphans` (`tenant.payments.read`). */
export function usePaymentOrphans(status: string | null, enabled: boolean) {
  const org = useOrg();
  return useInfiniteQuery({
    queryKey: [...keys.orphans(org), status],
    enabled,
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam, signal }) =>
      unwrap(
        api.GET('/v1/tenant/payments/orphans', {
          params: {
            header: orgHeader(),
            query: { limit: PAGE_SIZE, offset: pageParam, sort: '-created_at', ...(status ? { status } : {}) },
          },
          signal,
        }),
      ),
  });
}

/** Reservations for the match picker: reference or customer search, newest first. */
export function useReservationSearch(q: string, enabled: boolean) {
  const org = useOrg();
  return useQuery({
    queryKey: ['tenant', org, 'payment-orphans', 'reservation-search', q],
    enabled,
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/v1/tenant/reservations', {
          params: {
            header: orgHeader(),
            query: { limit: 20, offset: 0, sort: '-created_at', ...(q.trim() ? { q: q.trim() } : {}) },
          },
          signal,
        }),
      ),
  });
}

export function useMatchOrphan(uuid: string) {
  const done = useInvalidateMoney();
  return useMutation({
    mutationFn: (body: { reservation_uuid: string; note: string }) =>
      unwrap(
        api.POST('/v1/tenant/payments/orphans/{uuid}/match', { params: { header: orgHeader(), path: { uuid } }, body }),
      ),
    onSuccess: done,
  });
}

// ---------------------------------------------------------------- deposits

/** `GET /v1/tenant/finance/deposits` (`tenant.finance.deposits.read`). */
export function useDeposits(f: DepositFilters, enabled: boolean) {
  const org = useOrg();
  return useInfiniteQuery({
    queryKey: [...keys.deposits(org), 'list', f],
    enabled,
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam, signal }) =>
      unwrap(
        api.GET('/v1/tenant/finance/deposits', {
          params: { header: orgHeader(), query: { limit: PAGE_SIZE, offset: pageParam, ...depositQuery(f) } },
          signal,
        }),
      ),
  });
}

export function useDepositTotals(heldOver: number | null, enabled: boolean) {
  const org = useOrg();
  return useQuery({
    queryKey: [...keys.deposits(org), 'totals', heldOver ?? 0],
    enabled,
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/v1/tenant/finance/deposits/totals', {
          params: { header: orgHeader(), query: heldOver ? { held_over_days: heldOver } : {} },
          signal,
        }),
      ),
  });
}

export function useDeposit(uuid: string) {
  const org = useOrg();
  return useQuery({
    queryKey: [...keys.deposits(org), 'one', uuid],
    enabled: !!uuid,
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/v1/tenant/finance/deposits/{uuid}', { params: { header: orgHeader(), path: { uuid } }, signal }),
      ),
  });
}

/**
 * The rental's deposit card (`GET /v1/tenant/finance/rentals/{uuid}/deposits`):
 * same key as the handover wizard's card; here for the tills and bank
 * accounts a resolution may pay back from.
 */
export function useRentalDeposits(rentalUuid: string, enabled: boolean) {
  const org = useOrg();
  return useQuery({
    queryKey: [...keys.deposits(org), 'rental', rentalUuid],
    enabled: enabled && !!rentalUuid,
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/v1/tenant/finance/rentals/{uuid}/deposits', {
          params: { header: orgHeader(), path: { uuid: rentalUuid } },
          signal,
        }),
      ),
  });
}

/** The rental's charges for deduction lines (`tenant.rentals.read`; without it, no charge links). */
export function useRentalCharges(rentalUuid: string, enabled: boolean) {
  const org = useOrg();
  const can = useCan();
  return useQuery({
    queryKey: ['tenant', org, 'rentals', rentalUuid, 'detail'],
    enabled: enabled && !!rentalUuid && can(Permission.TenantRentalsRead),
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/v1/tenant/rentals/{uuid}', { params: { header: orgHeader(), path: { uuid: rentalUuid } }, signal }),
      ),
    select: (r) => r.charges,
  });
}

export function useVerifyDeposit(uuid: string) {
  const done = useInvalidateMoney();
  return useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/v1/tenant/finance/deposits/{uuid}/verify', { params: { header: orgHeader(), path: { uuid } } }),
      ),
    onSuccess: done,
  });
}

export function useResolveDeposit(uuid: string) {
  const done = useInvalidateMoney();
  return useMutation({
    mutationFn: (body: ResolveBody) =>
      unwrap(
        api.POST('/v1/tenant/finance/deposits/{uuid}/resolve', {
          params: {
            header: { ...orgHeader(), ...(body.idempotency_key ? { 'Idempotency-Key': body.idempotency_key } : {}) },
            path: { uuid },
          },
          body,
        }),
      ),
    onSuccess: done,
  });
}

export function useCancelDeposit(uuid: string) {
  const done = useInvalidateMoney();
  return useMutation({
    mutationFn: (reason: string) =>
      unwrap(
        api.POST('/v1/tenant/finance/deposits/{uuid}/cancel', {
          params: { header: orgHeader(), path: { uuid } },
          body: { reason },
        }),
      ),
    onSuccess: done,
  });
}
