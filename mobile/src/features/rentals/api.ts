import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, orgHeader, unwrap } from '@/core/api/client';
import { isApiError } from '@/core/api/errors';
import { useSession } from '@/core/auth/session';
import { API_URL } from '@/core/config';
import { apiErrorMessage, i18n } from '@/core/i18n';
import { nextOffset, PAGE_SIZE } from '@/ui/paged-list';

import {
  mediaMap,
  problemKey,
  type Decision,
  type inspectionListQuery,
  type OperationTask,
  type Rental,
  type rentalListQuery,
  type taskListQuery,
} from './lib';

type RentalQuery = ReturnType<typeof rentalListQuery>;
type TaskQuery = ReturnType<typeof taskListQuery>;
type InspectionQuery = ReturnType<typeof inspectionListQuery>;

/** Query keys carry the organization slug (the panel's `rentalKeys`; the Today summary shares `detail`). */
export const rentalKeys = {
  all: (slug: string) => ['tenant', slug, 'rentals'] as const,
  list: (slug: string, q: RentalQuery) => ['tenant', slug, 'rentals', 'list', q] as const,
  facets: (slug: string) => ['tenant', slug, 'rentals', 'facets'] as const,
  detail: (slug: string, uuid: string) => ['tenant', slug, 'rentals', 'detail', uuid] as const,
  events: (slug: string, uuid: string) => ['tenant', slug, 'rentals', 'events', uuid] as const,
  tasks: (slug: string, q: TaskQuery) => ['tenant', slug, 'rentals', 'tasks', q] as const,
  task: (slug: string, uuid: string) => ['tenant', slug, 'rentals', 'task', uuid] as const,
  taskFacets: (slug: string) => ['tenant', slug, 'rentals', 'task-facets'] as const,
};

export const inspectionKeys = {
  all: (slug: string) => ['tenant', slug, 'inspection-records'] as const,
  list: (slug: string, q: InspectionQuery) => ['tenant', slug, 'inspection-records', 'list', q] as const,
  detail: (slug: string, uuid: string) => ['tenant', slug, 'inspection-records', 'detail', uuid] as const,
  media: (slug: string, uuid: string, version: string) =>
    ['tenant', slug, 'inspection-records', 'media', uuid, version] as const,
};

function useSlug() {
  return useSession((s) => s.organization?.slug ?? '');
}

/**
 * Rental actions move vehicles and capacity: refresh rentals and their
 * tasks, the Today board, reservations and field tasks.
 */
export function useInvalidateRentals() {
  const slug = useSlug();
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: rentalKeys.all(slug) }),
      qc.invalidateQueries({ queryKey: ['tenant', slug, 'overview'] }),
      qc.invalidateQueries({ queryKey: ['tenant', slug, 'reservations'] }),
      qc.invalidateQueries({ queryKey: ['field-tasks'] }),
    ]);
}

// ------------------------------------------------------------ rentals

/** `GET /v1/tenant/rentals` (`tenant.rentals.read`), paged. */
export function useRentals(query: RentalQuery) {
  const slug = useSlug();
  return useInfiniteQuery({
    queryKey: rentalKeys.list(slug, query),
    enabled: !!slug,
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam, signal }) =>
      unwrap(
        api.GET('/v1/tenant/rentals', {
          params: { header: orgHeader(), query: { ...query, limit: PAGE_SIZE, offset: pageParam } },
          signal,
        }),
      ),
  });
}

/** Status / branch / product counts (the product filter's options). */
export function useRentalFacets() {
  const slug = useSlug();
  return useQuery({
    queryKey: rentalKeys.facets(slug),
    enabled: !!slug,
    staleTime: 60_000,
    queryFn: ({ signal }) => unwrap(api.GET('/v1/tenant/rentals/facets', { params: { header: orgHeader() }, signal })),
  });
}

export function useRental(uuid: string | undefined) {
  const slug = useSlug();
  return useQuery({
    queryKey: rentalKeys.detail(slug, uuid ?? ''),
    enabled: !!slug && !!uuid,
    queryFn: ({ signal }) =>
      unwrap(api.GET('/v1/tenant/rentals/{uuid}', { params: { header: orgHeader(), path: { uuid: uuid! } }, signal })),
  });
}

/** The rental's timeline, newest first, 20 per page. */
export function useRentalEvents(uuid: string) {
  const slug = useSlug();
  return useInfiniteQuery({
    queryKey: rentalKeys.events(slug, uuid),
    enabled: !!slug && !!uuid,
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam, signal }) =>
      unwrap(
        api.GET('/v1/tenant/rentals/{uuid}/events', {
          params: { header: orgHeader(), path: { uuid }, query: { limit: 20, offset: pageParam } },
          signal,
        }),
      ),
  });
}

/** One rental action; the answer is the updated rental (it replaces the cached detail). */
function useRentalMutation<T>(uuid: string, fn: (uuid: string, body: T) => Promise<Rental>) {
  const slug = useSlug();
  const qc = useQueryClient();
  const invalidate = useInvalidateRentals();
  return useMutation({
    mutationFn: (body: T) => fn(uuid, body),
    onSuccess: (rental) => {
      qc.setQueryData(rentalKeys.detail(slug, uuid), rental);
      void invalidate();
    },
    onError: () => {
      // A 409 means the rental moved on elsewhere: show its current state.
      void qc.invalidateQueries({ queryKey: rentalKeys.detail(slug, uuid) });
    },
  });
}

const path = (uuid: string) => ({ header: orgHeader(), path: { uuid } });

export function useExtendRental(uuid: string) {
  return useRentalMutation(uuid, (id, body: { ends_at: string; reason?: string }) =>
    unwrap(api.POST('/v1/tenant/rentals/{uuid}/extend', { params: path(id), body })),
  );
}

export type SwapBody = {
  vehicle_uuid: string;
  at: string;
  branch_uuid: string;
  in_km: number;
  in_fuel: number;
  out_km: number;
  out_fuel: number;
  reason: string;
};

export function useSwapVehicle(uuid: string) {
  return useRentalMutation(uuid, (id, body: SwapBody) =>
    unwrap(api.POST('/v1/tenant/rentals/{uuid}/swap', { params: path(id), body })),
  );
}

export function useCancelRental(uuid: string) {
  return useRentalMutation(uuid, (id, reason: string) =>
    unwrap(api.POST('/v1/tenant/rentals/{uuid}/cancel', { params: path(id), body: { reason } })),
  );
}

export function useDecideCharge(uuid: string) {
  return useRentalMutation(uuid, (id, v: { charge: string; decision: Decision; note: string }) => {
    const params = { header: orgHeader(), path: { uuid: id, chargeUuid: v.charge } };
    const body = v.note ? { note: v.note } : {};
    return v.decision === 'approve'
      ? unwrap(api.POST('/v1/tenant/rentals/{uuid}/charges/{chargeUuid}/approve', { params, body }))
      : unwrap(api.POST('/v1/tenant/rentals/{uuid}/charges/{chargeUuid}/waive', { params, body }));
  });
}

/**
 * Swap candidates: active vehicles by plate (the panel's swap combobox),
 * the rental's own vehicle left out.
 */
export function useSwapCandidates(q: string, exclude: string, enabled: boolean) {
  const slug = useSlug();
  return useQuery({
    queryKey: ['tenant', slug, 'rentals', 'swap-candidates', q],
    enabled: !!slug && enabled,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const page = await unwrap(
        api.GET('/v1/tenant/vehicles', {
          params: {
            header: orgHeader(),
            query: { limit: 20, offset: 0, sort: 'plate', is_active: true, q: q.trim() || undefined },
          },
          signal,
        }),
      );
      return page.items.filter((v) => v.uuid !== exclude);
    },
  });
}

/** Text of a failed rental action: the rental problem codes first, then the shared error catalog. */
export function rentalErrorText(e: unknown) {
  const key = isApiError(e) ? problemKey(e.code, e.details) : null;
  return key ? i18n.t(`rentals:${key}`) : apiErrorMessage(e);
}

// ------------------------------------------------------------ operation tasks

/** `GET /v1/tenant/operation-tasks` (`tenant.rentals.read`), paged. */
export function useOperationTasks(query: TaskQuery, enabled = true) {
  const slug = useSlug();
  return useInfiniteQuery({
    queryKey: rentalKeys.tasks(slug, query),
    enabled: !!slug && enabled,
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam, signal }) =>
      unwrap(
        api.GET('/v1/tenant/operation-tasks', {
          params: { header: orgHeader(), query: { ...query, limit: PAGE_SIZE, offset: pageParam } },
          signal,
        }),
      ),
  });
}

export function useOperationTask(uuid: string) {
  const slug = useSlug();
  return useQuery({
    queryKey: rentalKeys.task(slug, uuid),
    enabled: !!slug && !!uuid,
    queryFn: ({ signal }) => unwrap(api.GET('/v1/tenant/operation-tasks/{uuid}', { params: path(uuid), signal })),
  });
}

export type TaskAction = 'start' | 'complete' | 'cancel';

/** Start / complete / cancel / assign; the answer replaces the cached task, the lists refresh. */
export function useOperationTaskAction(uuid: string) {
  const slug = useSlug();
  const qc = useQueryClient();
  const invalidate = useInvalidateRentals();
  return useMutation({
    mutationFn: (v: { action: TaskAction; note?: string } | { action: 'assign'; userUuid: string | null }) => {
      const params = path(uuid);
      switch (v.action) {
        case 'assign':
          return unwrap(
            api.POST('/v1/tenant/operation-tasks/{uuid}/assign', { params, body: { user_uuid: v.userUuid } }),
          );
        case 'start':
          return unwrap(api.POST('/v1/tenant/operation-tasks/{uuid}/start', { params }));
        case 'complete':
          return unwrap(
            api.POST('/v1/tenant/operation-tasks/{uuid}/complete', { params, body: v.note ? { note: v.note } : {} }),
          );
        case 'cancel':
          return unwrap(api.POST('/v1/tenant/operation-tasks/{uuid}/cancel', { params, body: { note: v.note ?? '' } }));
      }
    },
    onSuccess: (task: OperationTask) => {
      qc.setQueryData(rentalKeys.task(slug, uuid), task);
      void invalidate();
    },
    onError: () => void qc.invalidateQueries({ queryKey: rentalKeys.task(slug, uuid) }),
  });
}

/**
 * Members to assign (`GET /v1/tenant/members`, needs `tenant.members.read`).
 * Without it the list stays empty and only clearing the assignment is offered,
 * like the panel's member picker.
 */
export function useMemberOptions(q: string, enabled: boolean) {
  const slug = useSlug();
  return useQuery({
    queryKey: ['tenant', slug, 'members', 'picker', q],
    enabled: !!slug && enabled,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      try {
        const page = await unwrap(
          api.GET('/v1/tenant/members', {
            params: { header: orgHeader(), query: { limit: 20, offset: 0, q: q.trim() || undefined } },
            signal,
          }),
        );
        return page.items.map((m) => ({
          value: m.user.uuid,
          label: `${m.user.name} ${m.user.surname}`.trim() || m.user.email,
          description: m.user.email,
        }));
      } catch {
        return [];
      }
    },
  });
}

// ------------------------------------------------------------ inspections

/** `GET /v1/tenant/inspections` (`tenant.rentals.read`), paged. */
export function useInspections(query: InspectionQuery, enabled = true) {
  const slug = useSlug();
  return useInfiniteQuery({
    queryKey: inspectionKeys.list(slug, query),
    enabled: !!slug && enabled,
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam, signal }) =>
      unwrap(
        api.GET('/v1/tenant/inspections', {
          params: { header: orgHeader(), query: { ...query, limit: PAGE_SIZE, offset: pageParam } },
          signal,
        }),
      ),
  });
}

export function useInspection(uuid: string) {
  const slug = useSlug();
  return useQuery({
    queryKey: inspectionKeys.detail(slug, uuid),
    enabled: !!slug && !!uuid,
    queryFn: ({ signal }) => unwrap(api.GET('/v1/tenant/inspections/{uuid}', { params: path(uuid), signal })),
  });
}

/**
 * Short-lived signed links (10 min) of a form's completed photos and
 * signature: uuid → absolute URL. Refreshed before they expire.
 */
export function useInspectionMedia(uuid: string | null | undefined, version: string) {
  const slug = useSlug();
  return useQuery({
    queryKey: inspectionKeys.media(slug, uuid ?? '', version),
    enabled: !!slug && !!uuid && version !== '',
    staleTime: 8 * 60_000,
    refetchInterval: 8 * 60_000,
    queryFn: async () => {
      const out = await unwrap(
        api.POST('/v1/tenant/inspections/{uuid}/media-links', { params: path(uuid!), body: {} }),
      );
      return mediaMap(out.items, API_URL);
    },
  });
}
