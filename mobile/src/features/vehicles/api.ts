import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, orgHeader, unwrap } from '@/core/api/client';
import type { components } from '@/core/api/schema';
import { Permission, useCan } from '@/core/auth/permissions';
import { useSession } from '@/core/auth/session';
import { nextOffset, PAGE_SIZE } from '@/ui/paged-list';

import { OPEN_RENTAL_STATUSES } from './labels';

type S = components['schemas'];
export type Vehicle = S['Vehicle'];
export type VehicleBlock = S['VehicleBlock'];
export type VehicleDocument = S['VehicleDocument'];
export type VehicleMaintenance = S['VehicleMaintenance'];
export type VehicleEvent = S['VehicleEvent'];
export type FleetActivityEntry = S['FleetActivityEntry'];
export type RentalListItem = S['RentalListItem'];

export type VehicleFilters = { q: string; status: string | null; group: string | null; branch: string | null };

const useOrg = () => useSession((s) => s.organization?.slug ?? '');

/** Every cached query of one vehicle starts with this key. */
const vehicleKey = (org: string, uuid: string) => ['vehicle', org, uuid] as const;

/** `GET /v1/tenant/vehicles`: plate / VIN / name search, status, rental group and the branch filter (current branch). */
export function useVehicleList(f: VehicleFilters) {
  const org = useOrg();
  return useInfiniteQuery({
    queryKey: ['vehicles', org, f],
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
              sort: 'plate',
              ...(f.q.trim() ? { q: f.q.trim() } : {}),
              ...(f.status ? { status: f.status } : {}),
              ...(f.group ? { rental_group: f.group } : {}),
              ...(f.branch ? { current_branch: f.branch } : {}),
            },
          },
        }),
      ),
  });
}

/** Facet values (rental groups with counts) in the member's branch scope. */
export function useVehicleFacets() {
  const org = useOrg();
  return useQuery({
    queryKey: ['vehicles', org, 'facets'],
    staleTime: 5 * 60_000,
    queryFn: () => unwrap(api.GET('/v1/tenant/vehicles/facets', { params: { header: orgHeader() } })),
  });
}

/** A plate lookup for the scanner: at most two hits, so one hit opens the vehicle. */
export function findByPlate(q: string) {
  return unwrap(api.GET('/v1/tenant/vehicles', { params: { header: orgHeader(), query: { q, limit: 2, offset: 0 } } }));
}

export function useVehicle(uuid: string) {
  const org = useOrg();
  return useQuery({
    queryKey: vehicleKey(org, uuid),
    enabled: !!uuid,
    queryFn: () => unwrap(api.GET('/v1/tenant/vehicles/{uuid}', { params: { header: orgHeader(), path: { uuid } } })),
  });
}

export function useVehicleDocuments(uuid: string) {
  const org = useOrg();
  return useQuery({
    queryKey: [...vehicleKey(org, uuid), 'documents'],
    queryFn: () =>
      unwrap(api.GET('/v1/tenant/vehicles/{uuid}/documents', { params: { header: orgHeader(), path: { uuid } } })),
  });
}

export function useVehicleMaintenance(uuid: string) {
  const org = useOrg();
  return useQuery({
    queryKey: [...vehicleKey(org, uuid), 'maintenance'],
    queryFn: () =>
      unwrap(api.GET('/v1/tenant/vehicles/{uuid}/maintenance', { params: { header: orgHeader(), path: { uuid } } })),
  });
}

/** Blocks, newest start first (`tenant.blocks.read`; without it nothing is fetched). */
export function useVehicleBlocks(uuid: string) {
  const org = useOrg();
  const can = useCan();
  return useQuery({
    queryKey: [...vehicleKey(org, uuid), 'blocks'],
    enabled: can(Permission.TenantBlocksRead),
    queryFn: () =>
      unwrap(
        api.GET('/v1/tenant/vehicles/{uuid}/blocks', {
          params: { header: orgHeader(), path: { uuid }, query: { limit: 20, offset: 0 } },
        }),
      ),
  });
}

export function useVehicleKasko(uuid: string) {
  const org = useOrg();
  return useQuery({
    queryKey: [...vehicleKey(org, uuid), 'kasko'],
    queryFn: () =>
      unwrap(api.GET('/v1/tenant/vehicles/{uuid}/kasko', { params: { header: orgHeader(), path: { uuid } } })),
  });
}

/** The rental holding the vehicle now (`tenant.rentals.read`), or null. */
export function useOpenRental(uuid: string) {
  const org = useOrg();
  const can = useCan();
  return useQuery({
    queryKey: [...vehicleKey(org, uuid), 'open-rental'],
    enabled: can(Permission.TenantRentalsRead),
    queryFn: async () => {
      const page = await unwrap(
        api.GET('/v1/tenant/rentals', {
          params: {
            header: orgHeader(),
            query: { vehicle: uuid, status: OPEN_RENTAL_STATUSES, sort: '-planned_pickup_at', limit: 1, offset: 0 },
          },
        }),
      );
      return page.items[0] ?? null;
    },
  });
}

/** Status history (newest first), paged. */
export function useVehicleEvents(uuid: string, limit = PAGE_SIZE) {
  const org = useOrg();
  return useInfiniteQuery({
    queryKey: [...vehicleKey(org, uuid), 'events', limit],
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/v1/tenant/vehicles/{uuid}/events', {
          params: { header: orgHeader(), path: { uuid }, query: { limit, offset: pageParam } },
        }),
      ),
  });
}

/** Activity (audit) of the vehicle, paged. */
export function useVehicleActivity(uuid: string, limit = PAGE_SIZE) {
  const org = useOrg();
  return useInfiniteQuery({
    queryKey: [...vehicleKey(org, uuid), 'activity', limit],
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/v1/tenant/vehicles/{uuid}/activity', {
          params: { header: orgHeader(), path: { uuid }, query: { limit, offset: pageParam } },
        }),
      ),
  });
}

/** After a change: the vehicle with its sub-lists, and the lists it appears in. */
function useInvalidateVehicle(uuid?: string) {
  const qc = useQueryClient();
  const org = useOrg();
  return () => {
    void qc.invalidateQueries({ queryKey: ['vehicles', org] });
    if (uuid) void qc.invalidateQueries({ queryKey: vehicleKey(org, uuid) });
  };
}

export function useChangeStatus(uuid: string) {
  const done = useInvalidateVehicle(uuid);
  return useMutation({
    mutationFn: (body: S['VehicleStatusRequest']) =>
      unwrap(api.POST('/v1/tenant/vehicles/{uuid}/status', { params: { header: orgHeader(), path: { uuid } }, body })),
    onSuccess: done,
  });
}

export function useSaveVehicle(uuid?: string) {
  const done = useInvalidateVehicle(uuid);
  return useMutation({
    mutationFn: (body: S['VehicleCreateRequest']) =>
      uuid
        ? unwrap(api.PATCH('/v1/tenant/vehicles/{uuid}', { params: { header: orgHeader(), path: { uuid } }, body }))
        : unwrap(api.POST('/v1/tenant/vehicles', { params: { header: orgHeader() }, body })),
    onSuccess: done,
  });
}

export function useCompleteMaintenance(uuid: string) {
  const done = useInvalidateVehicle(uuid);
  return useMutation({
    mutationFn: ({ itemUuid, body }: { itemUuid: string; body: S['VehicleMaintenanceCompleteRequest'] }) =>
      unwrap(
        api.POST('/v1/tenant/vehicles/{uuid}/maintenance/{itemUuid}/complete', {
          params: { header: orgHeader(), path: { uuid, itemUuid } },
          body,
        }),
      ),
    onSuccess: done,
  });
}

export function useCreateBlock(uuid: string) {
  const done = useInvalidateVehicle(uuid);
  return useMutation({
    mutationFn: (body: S['VehicleBlockRequest']) =>
      unwrap(api.POST('/v1/tenant/vehicles/{uuid}/blocks', { params: { header: orgHeader(), path: { uuid } }, body })),
    onSuccess: done,
  });
}

export function useReleaseBlock(uuid: string) {
  const done = useInvalidateVehicle(uuid);
  return useMutation({
    mutationFn: ({ blockUuid, syncStatus }: { blockUuid: string; syncStatus: boolean }) =>
      unwrap(
        api.POST('/v1/tenant/vehicles/{uuid}/blocks/{blockUuid}/release', {
          params: { header: orgHeader(), path: { uuid, blockUuid } },
          body: { sync_status: syncStatus },
        }),
      ),
    onSuccess: done,
  });
}

/** Catalog cascade of the vehicle form (`/v1/tenant/catalog/*`), searched on the server. */
export function useCatalog(level: 'brands' | 'models' | 'types', parent: string, q: string, enabled: boolean) {
  const org = useOrg();
  return useQuery({
    queryKey: ['catalog', org, level, parent, q],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const header = orgHeader();
      const query = { q: q.trim() || undefined, limit: 50 };
      if (level === 'brands') {
        const page = await unwrap(api.GET('/v1/tenant/catalog/brands', { params: { header, query } }));
        return page.items.map((b) => ({ value: b.uuid, label: b.display_name, years: [] as number[] }));
      }
      if (level === 'models') {
        const page = await unwrap(
          api.GET('/v1/tenant/catalog/models', { params: { header, query: { ...query, brand: parent } } }),
        );
        return page.items.map((m) => ({ value: m.uuid, label: m.name, years: [] as number[] }));
      }
      const page = await unwrap(
        api.GET('/v1/tenant/catalog/types', { params: { header, query: { ...query, model: parent } } }),
      );
      return page.items.map((t) => ({
        value: t.uuid,
        label: t.name,
        description: t.years.length
          ? `${Math.min(...t.years)}–${Math.max(...t.years)} · ${t.tsb_type_code}`
          : t.tsb_type_code,
        years: t.years,
      }));
    },
  });
}

/** Pull-to-refresh on the vehicle card: the vehicle and every section under it. */
export function useRefreshVehicle(uuid: string) {
  const qc = useQueryClient();
  const org = useOrg();
  return () => qc.refetchQueries({ queryKey: vehicleKey(org, uuid), type: 'active' });
}
