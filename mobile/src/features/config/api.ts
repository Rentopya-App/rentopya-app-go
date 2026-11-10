import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, orgHeader, unwrap } from '@/core/api/client';
import type { components } from '@/core/api/schema';
import { useSession } from '@/core/auth/session';
import { nextOffset, PAGE_SIZE } from '@/ui/paged-list';

type S = components['schemas'];
export type Branch = S['Branch'];
export type ServicePoint = S['ServicePoint'];
export type Segment = S['Segment'];
export type RentalGroup = S['RentalGroup'];
export type RentalProduct = S['RentalProduct'];
export type OneWayRule = S['OneWayRule'];
export type CapacityRule = S['CapacityRule'];
export type RatePlan = S['RatePlan'];
export type DateRule = S['DateRule'];
export type Extra = S['Extra'];
export type ExtraStockRow = S['ExtraStockRow'];
export type Campaign = S['Campaign'];
export type ChannelAccount = S['ChannelAccount'];
export type ChannelMapping = S['ChannelMapping'];
export type PricingPreviewRequest = S['PricingPreviewRequest'];
export type PricingPreview = S['PricingPreview'];

function useOrg() {
  return useSession((s) => s.organization?.slug);
}

const h = () => ({ header: orgHeader() });

/** Offset-paged list of one configuration resource; `fetch` gets limit/offset already merged. */
function usePaged<T>(
  key: string,
  query: Record<string, unknown>,
  fetch: (q: Record<string, unknown>) => Promise<{ items: T[]; total: number; offset: number; limit: number }>,
) {
  const org = useOrg();
  return useInfiniteQuery({
    queryKey: ['config', key, org, query],
    enabled: !!org,
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam }) => fetch({ ...query, limit: PAGE_SIZE, offset: pageParam }),
  });
}

function useOne<T>(key: string, uuid: string, fetch: () => Promise<T>) {
  const org = useOrg();
  return useQuery({ queryKey: ['config', key, org, uuid], enabled: !!org && !!uuid, queryFn: fetch });
}

/** Every write refreshes the configuration caches of the organization (lists and details). */
function useWrite<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => void qc.invalidateQueries({ queryKey: ['config'] }) });
}

const clean = (q: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== '' && v !== null)) as never;

// ---------------------------------------------------------------- branches

export const useBranches = (q: Record<string, unknown>) =>
  usePaged<Branch>('branches', q, (query) =>
    unwrap(api.GET('/v1/tenant/branches', { params: { ...h(), query: clean(query) } })),
  );
export const useBranch = (uuid: string) =>
  useOne('branch', uuid, () => unwrap(api.GET('/v1/tenant/branches/{uuid}', { params: { ...h(), path: { uuid } } })));
export const useServicePoints = (uuid: string) =>
  useOne('service-points', uuid, () =>
    unwrap(api.GET('/v1/tenant/branches/{uuid}/service-points', { params: { ...h(), path: { uuid } } })),
  );
export const usePatchBranch = (uuid: string) =>
  useWrite((body: S['BranchPatchRequest']) =>
    unwrap(api.PATCH('/v1/tenant/branches/{uuid}', { params: { ...h(), path: { uuid } }, body })),
  );
export const usePatchServicePoint = (uuid: string, pointUuid: string) =>
  useWrite((body: S['ServicePointPatchRequest']) =>
    unwrap(
      api.PATCH('/v1/tenant/branches/{uuid}/service-points/{pointUuid}', {
        params: { ...h(), path: { uuid, pointUuid } },
        body,
      }),
    ),
  );

// ---------------------------------------------------------------- fleet set-up

export const useSegments = (q: Record<string, unknown>) =>
  usePaged<Segment>('segments', q, (query) =>
    unwrap(api.GET('/v1/tenant/segments', { params: { ...h(), query: clean(query) } })),
  );
export const useSegment = (uuid: string) =>
  useOne('segment', uuid, () => unwrap(api.GET('/v1/tenant/segments/{uuid}', { params: { ...h(), path: { uuid } } })));
export const usePatchSegment = (uuid: string) =>
  useWrite((body: S['SegmentPatchRequest']) =>
    unwrap(api.PATCH('/v1/tenant/segments/{uuid}', { params: { ...h(), path: { uuid } }, body })),
  );

export const useGroups = (q: Record<string, unknown>) =>
  usePaged<RentalGroup>('groups', q, (query) =>
    unwrap(api.GET('/v1/tenant/rental-groups', { params: { ...h(), query: clean(query) } })),
  );
export const useGroup = (uuid: string) =>
  useOne('group', uuid, () =>
    unwrap(api.GET('/v1/tenant/rental-groups/{uuid}', { params: { ...h(), path: { uuid } } })),
  );
export const usePatchGroup = (uuid: string) =>
  useWrite((body: S['RentalGroupPatchRequest']) =>
    unwrap(api.PATCH('/v1/tenant/rental-groups/{uuid}', { params: { ...h(), path: { uuid } }, body })),
  );

export const useProducts = (q: Record<string, unknown>) =>
  usePaged<RentalProduct>('products', q, (query) =>
    unwrap(api.GET('/v1/tenant/products', { params: { ...h(), query: clean(query) } })),
  );
export const useProduct = (uuid: string) =>
  useOne('product', uuid, () => unwrap(api.GET('/v1/tenant/products/{uuid}', { params: { ...h(), path: { uuid } } })));
export const usePatchProduct = (uuid: string) =>
  useWrite((body: S['RentalProductPatchRequest']) =>
    unwrap(api.PATCH('/v1/tenant/products/{uuid}', { params: { ...h(), path: { uuid } }, body })),
  );

export const useOneWayRules = (q: Record<string, unknown>) =>
  usePaged<OneWayRule>('one-way', q, (query) =>
    unwrap(api.GET('/v1/tenant/one-way-rules', { params: { ...h(), query: clean(query) } })),
  );
export const useOneWayRule = (uuid: string) =>
  useOne('one-way-rule', uuid, () =>
    unwrap(api.GET('/v1/tenant/one-way-rules/{uuid}', { params: { ...h(), path: { uuid } } })),
  );
export const usePatchOneWayRule = (uuid: string) =>
  useWrite((body: S['OneWayRulePatchRequest']) =>
    unwrap(api.PATCH('/v1/tenant/one-way-rules/{uuid}', { params: { ...h(), path: { uuid } }, body })),
  );

export const useCapacityRules = (q: Record<string, unknown>) =>
  usePaged<CapacityRule>('capacity', q, (query) =>
    unwrap(api.GET('/v1/tenant/capacity-rules', { params: { ...h(), query: clean(query) } })),
  );

// ---------------------------------------------------------------- pricing

export const useRatePlans = (q: Record<string, unknown>) =>
  usePaged<RatePlan>('rate-plans', q, (query) =>
    unwrap(api.GET('/v1/tenant/rate-plans', { params: { ...h(), query: clean(query) } })),
  );
export const useRatePlan = (uuid: string) =>
  useOne('rate-plan', uuid, () =>
    unwrap(api.GET('/v1/tenant/rate-plans/{uuid}', { params: { ...h(), path: { uuid } } })),
  );
export const useActivationCheck = (uuid: string, enabled: boolean) => {
  const org = useOrg();
  return useQuery({
    queryKey: ['config', 'rate-plan-check', org, uuid],
    enabled: !!org && !!uuid && enabled,
    queryFn: () =>
      unwrap(api.GET('/v1/tenant/rate-plans/{uuid}/activation-check', { params: { ...h(), path: { uuid } } })),
  });
};
export const useRatePlanMatrix = (q: { scope: string; branch?: string | null }) => {
  const org = useOrg();
  return useQuery({
    queryKey: ['config', 'matrix', org, q],
    enabled: !!org && (q.scope === 'common' || !!q.branch),
    queryFn: () => unwrap(api.GET('/v1/tenant/rate-plans/matrix', { params: { ...h(), query: clean(q) } })),
  });
};
/** activate (optional change note) / deactivate of a rate plan or a date rule (`tenant.pricing.activate`). */
export const usePricingToggle = (kind: 'rate-plans' | 'date-rules', uuid: string) =>
  useWrite(({ on, note }: { on: boolean; note?: string }): Promise<unknown> => {
    const params = { ...h(), path: { uuid } };
    if (kind === 'rate-plans')
      return on
        ? unwrap(api.POST('/v1/tenant/rate-plans/{uuid}/activate', { params, body: { change_note: note } }))
        : unwrap(api.POST('/v1/tenant/rate-plans/{uuid}/deactivate', { params }));
    return on
      ? unwrap(api.POST('/v1/tenant/date-rules/{uuid}/activate', { params, body: { change_note: note } }))
      : unwrap(api.POST('/v1/tenant/date-rules/{uuid}/deactivate', { params }));
  });

export const useDateRules = (q: Record<string, unknown>) =>
  usePaged<DateRule>('date-rules', q, (query) =>
    unwrap(api.GET('/v1/tenant/date-rules', { params: { ...h(), query: clean(query) } })),
  );
export const useDateRule = (uuid: string) =>
  useOne('date-rule', uuid, () =>
    unwrap(api.GET('/v1/tenant/date-rules/{uuid}', { params: { ...h(), path: { uuid } } })),
  );

export const usePricingPreview = () =>
  useMutation({
    mutationFn: (body: PricingPreviewRequest) => unwrap(api.POST('/v1/tenant/pricing/preview', { params: h(), body })),
  });

export const useExtras = (q: Record<string, unknown>) =>
  usePaged<Extra>('extras', q, (query) =>
    unwrap(api.GET('/v1/tenant/extras', { params: { ...h(), query: clean(query) } })),
  );
export const useExtra = (uuid: string) =>
  useOne('extra', uuid, () => unwrap(api.GET('/v1/tenant/extras/{uuid}', { params: { ...h(), path: { uuid } } })));
export const useExtraStock = (uuid: string, enabled = true) => {
  const org = useOrg();
  return useQuery({
    queryKey: ['config', 'extra-stock', org, uuid],
    enabled: !!org && !!uuid && enabled,
    queryFn: () =>
      unwrap(api.GET('/v1/tenant/extras/{uuid}/stock', { params: { ...h(), path: { uuid } } })) as Promise<{
        items: ExtraStockRow[];
      }>,
  });
};
export const useSaveExtraStock = (uuid: string) =>
  useWrite((body: S['ExtraStockRequest']) =>
    unwrap(api.PUT('/v1/tenant/extras/{uuid}/stock', { params: { ...h(), path: { uuid } }, body })),
  );

export const useCampaigns = (q: Record<string, unknown>) =>
  usePaged<Campaign>('campaigns', q, (query) =>
    unwrap(api.GET('/v1/tenant/campaigns', { params: { ...h(), query: clean(query) } })),
  );
export const useCampaign = (uuid: string) =>
  useOne('campaign', uuid, () =>
    unwrap(api.GET('/v1/tenant/campaigns/{uuid}', { params: { ...h(), path: { uuid } } })),
  );
export const usePatchCampaign = (uuid: string) =>
  useWrite((body: S['CampaignPatchRequest']) =>
    unwrap(api.PATCH('/v1/tenant/campaigns/{uuid}', { params: { ...h(), path: { uuid } }, body })),
  );

// ---------------------------------------------------------------- channels

export const useChannelAccounts = () => {
  const org = useOrg();
  return useQuery({
    queryKey: ['config', 'channel-accounts', org],
    enabled: !!org,
    queryFn: () => unwrap(api.GET('/v1/tenant/channel-accounts', { params: h() })),
  });
};
export const useChannelMappings = (q: Record<string, unknown>) =>
  usePaged<ChannelMapping>('channel-mappings', q, (query) =>
    unwrap(api.GET('/v1/tenant/channel-mappings', { params: { ...h(), query: clean(query) } })),
  );
export const useChannelMapping = (uuid: string) =>
  useOne('channel-mapping', uuid, () =>
    unwrap(api.GET('/v1/tenant/channel-mappings/{uuid}', { params: { ...h(), path: { uuid } } })),
  );
export const usePatchChannelMapping = (uuid: string) =>
  useWrite((body: S['ChannelMappingInput']) =>
    unwrap(api.PATCH('/v1/tenant/channel-mappings/{uuid}', { params: { ...h(), path: { uuid } }, body })),
  );
