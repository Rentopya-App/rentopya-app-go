import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { api, orgHeader, unwrap } from '@/core/api/client';
import type { components } from '@/core/api/schema';
import { useSession } from '@/core/auth/session';
import { nextOffset, PAGE_SIZE } from '@/ui/paged-list';

type S = components['schemas'];
export type FinanceAccount = S['FinanceAccount'];
export type LedgerEntry = S['LedgerEntry'];
export type Invoice = S['Invoice'];
export type InvoiceDetail = S['InvoiceDetail'];
export type CashAccount = S['CashAccount'];
export type CashMovement = S['CashMovement'];
export type Supplier = S['Supplier'];
export type SupplierInvoice = S['SupplierInvoice'];
export type SupplierPayment = S['SupplierPayment'];

type Q = Record<string, string>;
type Page<T> = { items: T[]; total: number; limit: number; offset: number };

function useOrg() {
  return useSession((s) => s.organization?.slug);
}

/** Offset-paged list of the company panel, keyed by name and query. */
function usePaged<T>(
  name: string,
  query: Q,
  fetch: (q: Q, page: { limit: number; offset: number }) => Promise<Page<T>>,
  enabled = true,
) {
  const org = useOrg();
  return useInfiniteQuery({
    queryKey: ['accounting', name, org, query],
    enabled: !!org && enabled,
    initialPageParam: 0,
    getNextPageParam: nextOffset<T>,
    queryFn: ({ pageParam }) => fetch(query, { limit: PAGE_SIZE, offset: pageParam }),
  });
}

function useOne<T>(name: string, uuid: string, fetch: (uuid: string) => Promise<T>) {
  const org = useOrg();
  return useQuery({ queryKey: ['accounting', name, org, uuid], enabled: !!org && !!uuid, queryFn: () => fetch(uuid) });
}

const h = () => ({ header: orgHeader() });

// ---------------------------------------------------------------- customer / supplier accounts (cari)

export function useFinanceAccounts(query: Q) {
  return usePaged('accounts', query, (q, page) =>
    unwrap(api.GET('/v1/tenant/finance/accounts', { params: { ...h(), query: { ...q, ...page } } })),
  );
}

export function useFinanceAccount(uuid: string) {
  return useOne('account', uuid, (u) =>
    unwrap(api.GET('/v1/tenant/finance/accounts/{uuid}', { params: { ...h(), path: { uuid: u } } })),
  );
}

/** Statement of an account, newest entries first. */
export function useStatement(uuid: string) {
  return usePaged(
    `statement-${uuid}`,
    { sort: '-entry_date' },
    (q, page) =>
      unwrap(
        api.GET('/v1/tenant/finance/accounts/{uuid}/statement', {
          params: { ...h(), path: { uuid }, query: { ...q, ...page } },
        }),
      ),
    !!uuid,
  );
}

// ---------------------------------------------------------------- e-invoices

export function useInvoices(query: Q) {
  return usePaged('invoices', query, (q, page) =>
    unwrap(api.GET('/v1/tenant/invoices', { params: { ...h(), query: { ...q, ...page } } })),
  );
}

export function useInvoice(uuid: string) {
  return useOne('invoice', uuid, (u) =>
    unwrap(api.GET('/v1/tenant/invoices/{uuid}', { params: { ...h(), path: { uuid: u } } })),
  );
}

// ---------------------------------------------------------------- cash and bank

export function useCashAccounts(query: Q) {
  return usePaged('cash-accounts', query, (q, page) =>
    unwrap(api.GET('/v1/tenant/finance/cash-accounts', { params: { ...h(), query: { ...q, ...page } } })),
  );
}

export function useCashAccount(uuid: string) {
  return useOne('cash-account', uuid, (u) =>
    unwrap(api.GET('/v1/tenant/finance/cash-accounts/{uuid}', { params: { ...h(), path: { uuid: u } } })),
  );
}

export function useMovements(query: Q) {
  return usePaged('movements', query, (q, page) =>
    unwrap(
      api.GET('/v1/tenant/finance/movements', { params: { ...h(), query: { sort: '-movement_date', ...q, ...page } } }),
    ),
  );
}

// ---------------------------------------------------------------- suppliers and payables

export function useSuppliers(query: Q) {
  return usePaged('suppliers', query, (q, page) =>
    unwrap(api.GET('/v1/tenant/suppliers', { params: { ...h(), query: { ...q, ...page } } })),
  );
}

export function useSupplier(uuid: string) {
  return useOne('supplier', uuid, (u) =>
    unwrap(api.GET('/v1/tenant/suppliers/{uuid}', { params: { ...h(), path: { uuid: u } } })),
  );
}

export function useSupplierInvoices(query: Q, enabled = true) {
  return usePaged(
    'supplier-invoices',
    query,
    (q, page) =>
      unwrap(api.GET('/v1/tenant/finance/supplier-invoices', { params: { ...h(), query: { ...q, ...page } } })),
    enabled,
  );
}

export function useSupplierPayments(query: Q, enabled = true) {
  return usePaged(
    'supplier-payments',
    query,
    (q, page) =>
      unwrap(
        api.GET('/v1/tenant/finance/supplier-payments', {
          params: { ...h(), query: { sort: '-payment_date', ...q, ...page } },
        }),
      ),
    enabled,
  );
}

export function usePayablesSummary() {
  const org = useOrg();
  return useQuery({
    queryKey: ['accounting', 'payables', org],
    enabled: !!org,
    queryFn: () => unwrap(api.GET('/v1/tenant/finance/payables/summary', { params: h() })),
  });
}
