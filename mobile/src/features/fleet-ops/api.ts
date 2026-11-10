import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, orgHeader, unwrap } from '@/core/api/client';
import { ApiError, toApiError } from '@/core/api/errors';
import type { components } from '@/core/api/schema';
import { Permission, useCan } from '@/core/auth/permissions';
import { useSession } from '@/core/auth/session';
import { formPart } from '@/features/uploads/files';
import { nextOffset, PAGE_SIZE } from '@/ui/paged-list';

import { expenseQuery } from './model';

type S = components['schemas'];
export type FleetAlert = S['FleetAlert'];
export type Expense = S['Expense'];
export type ExpenseCategory = S['ExpenseCategory'];
export type Vehicle = S['Vehicle'];

const useOrg = () => useSession((s) => s.organization?.slug ?? '');

/**
 * Keys under `['vehicles', org]` so the vehicle card's own invalidations
 * (status, maintenance completion, blocks) refresh the alerts and the
 * upcoming maintenance list too.
 */
const keys = {
  alerts: (org: string) => ['vehicles', org, 'fleet-alerts'] as const,
  upcoming: (org: string, f: object) => ['vehicles', org, 'upcoming-maintenance', f] as const,
  expenses: (org: string) => ['expenses', org] as const,
  expense: (org: string, uuid: string) => ['expenses', org, 'one', uuid] as const,
  categories: (org: string, active: boolean) => ['expense-categories', org, active] as const,
};

// --- fleet alerts / maintenance ----------------------------------------------

/** `GET /v1/tenant/fleet/alerts`: documents (30 days) and maintenance (15 days / 1000 km) in the branch scope. */
export function useFleetAlerts() {
  const org = useOrg();
  const can = useCan();
  return useQuery({
    queryKey: keys.alerts(org),
    enabled: can(Permission.TenantVehiclesRead),
    queryFn: () => unwrap(api.GET('/v1/tenant/fleet/alerts', { params: { header: orgHeader() } })),
  });
}

/**
 * Upcoming maintenance across the fleet: active vehicles ordered by their
 * next planned maintenance date (vehicles without a date come last, as
 * the panel's vehicle list sorts them), with the branch filter.
 */
export function useUpcomingMaintenance(f: { q: string; branch: string | null }) {
  const org = useOrg();
  return useInfiniteQuery({
    queryKey: keys.upcoming(org, f),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/v1/tenant/vehicles', {
          params: {
            header: orgHeader(),
            query: {
              limit: PAGE_SIZE,
              offset: pageParam,
              sort: 'next_maintenance_date',
              is_active: true,
              ...(f.q.trim() ? { q: f.q.trim() } : {}),
              ...(f.branch ? { current_branch: f.branch } : {}),
            },
          },
        }),
      ),
  });
}

/** Vehicle choices (plate search on the server) for the maintenance and expense forms. */
export function useVehicleOptions(q: string, enabled: boolean) {
  const org = useOrg();
  return useQuery({
    queryKey: ['vehicles', org, 'options', q.trim()],
    enabled,
    staleTime: 60_000,
    queryFn: () =>
      unwrap(
        api.GET('/v1/tenant/vehicles', {
          params: {
            header: orgHeader(),
            query: { limit: 50, offset: 0, sort: 'plate', ...(q.trim() ? { q: q.trim() } : {}) },
          },
        }),
      ),
  });
}

export function useVehicleBrief(uuid: string | undefined) {
  const org = useOrg();
  return useQuery({
    queryKey: ['vehicle', org, uuid ?? ''],
    enabled: !!uuid,
    queryFn: () =>
      unwrap(api.GET('/v1/tenant/vehicles/{uuid}', { params: { header: orgHeader(), path: { uuid: uuid ?? '' } } })),
  });
}

/** Plan or record maintenance (`tenant.vehicles.write`); refreshes the vehicle, the lists and the alerts. */
export function useCreateMaintenance() {
  const qc = useQueryClient();
  const org = useOrg();
  return useMutation({
    mutationFn: ({ vehicleUuid, body }: { vehicleUuid: string; body: S['VehicleMaintenanceCreateRequest'] }) =>
      unwrap(
        api.POST('/v1/tenant/vehicles/{uuid}/maintenance', {
          params: { header: orgHeader(), path: { uuid: vehicleUuid } },
          body,
        }),
      ),
    onSuccess: (_, { vehicleUuid }) => {
      void qc.invalidateQueries({ queryKey: ['vehicles', org] });
      void qc.invalidateQueries({ queryKey: ['vehicle', org, vehicleUuid] });
    },
  });
}

// --- expenses ----------------------------------------------------------------

export type ExpenseFilters = Parameters<typeof expenseQuery>[0];

export function useExpenses(f: ExpenseFilters) {
  const org = useOrg();
  return useInfiniteQuery({
    queryKey: [...keys.expenses(org), 'list', f],
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/v1/tenant/finance/expenses', {
          params: { header: orgHeader(), query: { limit: PAGE_SIZE, offset: pageParam, ...expenseQuery(f) } },
        }),
      ),
  });
}

export function useExpense(uuid: string) {
  const org = useOrg();
  return useQuery({
    queryKey: keys.expense(org, uuid),
    enabled: !!uuid,
    queryFn: () =>
      unwrap(api.GET('/v1/tenant/finance/expenses/{uuid}', { params: { header: orgHeader(), path: { uuid } } })),
  });
}

/** `active` = only categories new expenses may use (the form); all of them for the read-only list. */
export function useExpenseCategories(active: boolean, q = '') {
  const org = useOrg();
  return useQuery({
    queryKey: [...keys.categories(org, active), q.trim()],
    staleTime: 5 * 60_000,
    queryFn: () =>
      unwrap(
        api.GET('/v1/tenant/finance/expense-categories', {
          params: {
            header: orgHeader(),
            query: { ...(active ? { active: true } : {}), ...(q.trim() ? { q: q.trim() } : {}) },
          },
        }),
      ),
  });
}

/** Paying accounts for a new expense; only with `tenant.finance.cash.read` (the panel's rule too). */
export function useCashAccounts(enabled: boolean) {
  const org = useOrg();
  const can = useCan();
  return useQuery({
    queryKey: ['cash-accounts', org, 'active'],
    enabled: enabled && can(Permission.TenantFinanceCashRead),
    staleTime: 60_000,
    queryFn: () =>
      unwrap(
        api.GET('/v1/tenant/finance/cash-accounts', {
          params: { header: orgHeader(), query: { limit: 100, offset: 0, status: 'active', sort: 'code' } },
        }),
      ),
  });
}

function useInvalidateExpenses() {
  const qc = useQueryClient();
  const org = useOrg();
  return () => {
    void qc.invalidateQueries({ queryKey: keys.expenses(org) });
    void qc.invalidateQueries({ queryKey: ['expense-categories', org] });
  };
}

export function useSaveExpense(uuid?: string) {
  const done = useInvalidateExpenses();
  return useMutation({
    mutationFn: (body: S['ExpenseInput']) =>
      uuid
        ? unwrap(
            api.PATCH('/v1/tenant/finance/expenses/{uuid}', { params: { header: orgHeader(), path: { uuid } }, body }),
          )
        : unwrap(api.POST('/v1/tenant/finance/expenses', { params: { header: orgHeader() }, body })),
    onSuccess: done,
  });
}

export function useVoidExpense(uuid: string) {
  const done = useInvalidateExpenses();
  return useMutation({
    mutationFn: (reason: string) =>
      unwrap(
        api.POST('/v1/tenant/finance/expenses/{uuid}/void', {
          params: { header: orgHeader(), path: { uuid } },
          body: { reason },
        }),
      ),
    onSuccess: done,
  });
}

export type ReceiptFile = { uri: string; name: string; type: string };

/**
 * `PUT /v1/tenant/finance/expenses/{uuid}/file` (multipart `file`), as the
 * panel uploads it; replaces the previous file. The API stores it in
 * private storage and streams it back; the app never sees a storage key.
 */
export async function uploadReceipt(uuid: string, file: ReceiptFile) {
  const form = new FormData();
  form.append('file', (await formPart(file.uri, file.name, file.type)) as Blob);
  const call = api.PUT('/v1/tenant/finance/expenses/{uuid}/file', {
    params: { header: orgHeader(), path: { uuid } },
    body: form as never,
  });
  let r: Awaited<typeof call>;
  try {
    r = await call;
  } catch (e) {
    throw new ApiError(0, { code: 'NETWORK_ERROR', message: e instanceof Error ? e.message : String(e) });
  }
  if (r.error !== undefined || !r.response.ok || !r.data) throw toApiError(r.response.status, r.error);
  return r.data.data;
}

export function useUploadReceipt(uuid: string) {
  const done = useInvalidateExpenses();
  return useMutation({ mutationFn: (file: ReceiptFile) => uploadReceipt(uuid, file), onSuccess: done });
}
