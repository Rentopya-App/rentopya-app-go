import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, orgHeader, unwrap } from '@/core/api/client';
import { isApiError } from '@/core/api/errors';
import { useSession } from '@/core/auth/session';
import { apiErrorMessage, i18n } from '@/core/i18n';
import { nextOffset, PAGE_SIZE } from '@/ui/paged-list';

import {
  kabisProblemText,
  tollProblemText,
  type kabisListQuery,
  type KabisDetail,
  type KabisResolution,
  type TollDecision,
  type tollListQuery,
  type TollPassDetail,
} from './lib';

type KabisQuery = ReturnType<typeof kabisListQuery>;
type TollQuery = ReturnType<typeof tollListQuery>;

const t = (key: string, params?: Record<string, string | number>) => i18n.t(key, params);

/** Query keys carry the organization slug (the panel's `kabisKeys` / `tollKeys`). */
export const complianceKeys = {
  kabis: (slug: string) => ['tenant', slug, 'kabis'] as const,
  kabisList: (slug: string, q: KabisQuery) => ['tenant', slug, 'kabis', 'list', q] as const,
  kabisFacets: (slug: string) => ['tenant', slug, 'kabis', 'facets'] as const,
  kabisDetail: (slug: string, uuid: string) => ['tenant', slug, 'kabis', 'detail', uuid] as const,
  tolls: (slug: string) => ['tenant', slug, 'tolls'] as const,
  tollList: (slug: string, q: TollQuery) => ['tenant', slug, 'tolls', 'list', q] as const,
  tollFacets: (slug: string) => ['tenant', slug, 'tolls', 'facets'] as const,
  tollDetail: (slug: string, uuid: string) => ['tenant', slug, 'tolls', 'detail', uuid] as const,
  candidates: (slug: string, uuid: string) => ['tenant', slug, 'tolls', 'candidates', uuid] as const,
};

function useSlug() {
  return useSession((s) => s.organization?.slug ?? '');
}

function path(uuid: string) {
  return { header: orgHeader(), path: { uuid } };
}

/** Text of a refused KABİS action: the KABİS problem codes first, then the shared error catalog. */
export function kabisErrorText(e: unknown) {
  return (isApiError(e) ? kabisProblemText(t, e) : null) ?? apiErrorMessage(e);
}

/** The toll problem text of a refused decision, or null (the form shows the shared error text). */
export function tollProblem(e: unknown) {
  return isApiError(e) ? tollProblemText(t, e) : null;
}

/** Text of a refused toll decision: the toll problem codes first, then the shared error catalog. */
export function tollErrorText(e: unknown) {
  return tollProblem(e) ?? apiErrorMessage(e);
}

// ------------------------------------------------------------ KABİS

/** `GET /v1/tenant/kabis-notifications` (`tenant.kabis.read`), paged. */
export function useKabisList(query: KabisQuery) {
  const slug = useSlug();
  return useInfiniteQuery({
    queryKey: complianceKeys.kabisList(slug, query),
    enabled: !!slug,
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam, signal }) =>
      unwrap(
        api.GET('/v1/tenant/kabis-notifications', {
          params: { header: orgHeader(), query: { ...query, limit: PAGE_SIZE, offset: pageParam } },
          signal,
        }),
      ),
  });
}

/** Status counts and the "needs a person" count (the panel's filter badges). */
export function useKabisFacets(enabled = true) {
  const slug = useSlug();
  return useQuery({
    queryKey: complianceKeys.kabisFacets(slug),
    enabled: !!slug && enabled,
    staleTime: 30_000,
    queryFn: ({ signal }) =>
      unwrap(api.GET('/v1/tenant/kabis-notifications/facets', { params: { header: orgHeader() }, signal })),
  });
}

export function useKabis(uuid: string | undefined) {
  const slug = useSlug();
  return useQuery({
    queryKey: complianceKeys.kabisDetail(slug, uuid ?? ''),
    enabled: !!slug && !!uuid,
    queryFn: ({ signal }) => unwrap(api.GET('/v1/tenant/kabis-notifications/{uuid}', { params: path(uuid!), signal })),
  });
}

function useSettleKabis() {
  const slug = useSlug();
  const qc = useQueryClient();
  return (n: KabisDetail) => {
    qc.setQueryData(complianceKeys.kabisDetail(slug, n.uuid), n);
    void qc.invalidateQueries({ queryKey: complianceKeys.kabis(slug) });
    void qc.invalidateQueries({ queryKey: ['tenant', slug, 'overview'] });
  };
}

/** "Yeniden dene" (`tenant.kabis.retry`): a status check first on the server, then maybe a resend. */
export function useRetryKabis(uuid: string) {
  const settle = useSettleKabis();
  return useMutation({
    mutationFn: () => unwrap(api.POST('/v1/tenant/kabis-notifications/{uuid}/retry', { params: path(uuid) })),
    onSuccess: (r) => settle(r.notification),
  });
}

/** "Manuel bildirildi" / "Uzlaştır" (`tenant.kabis.reconcile`): reason and the official reference (JSON body). */
export function useResolveKabis(uuid: string, action: KabisResolution) {
  const settle = useSettleKabis();
  return useMutation({
    mutationFn: (body: { reason: string; reference: string }) =>
      action === 'mark-manual'
        ? unwrap(api.POST('/v1/tenant/kabis-notifications/{uuid}/mark-manual', { params: path(uuid), body }))
        : unwrap(api.POST('/v1/tenant/kabis-notifications/{uuid}/reconcile', { params: path(uuid), body })),
    onSuccess: settle,
  });
}

// ------------------------------------------------------------ tolls

/** `GET /v1/tenant/toll-passes` (`tenant.tolls.read`), paged. */
export function useTollPasses(query: TollQuery) {
  const slug = useSlug();
  return useInfiniteQuery({
    queryKey: complianceKeys.tollList(slug, query),
    enabled: !!slug,
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam, signal }) =>
      unwrap(
        api.GET('/v1/tenant/toll-passes', {
          params: { header: orgHeader(), query: { ...query, limit: PAGE_SIZE, offset: pageParam } },
          signal,
        }),
      ),
  });
}

/** Status counts and the review queue count. */
export function useTollFacets(enabled = true) {
  const slug = useSlug();
  return useQuery({
    queryKey: complianceKeys.tollFacets(slug),
    enabled: !!slug && enabled,
    staleTime: 30_000,
    queryFn: ({ signal }) =>
      unwrap(api.GET('/v1/tenant/toll-passes/facets', { params: { header: orgHeader() }, signal })),
  });
}

export function useTollPass(uuid: string | undefined) {
  const slug = useSlug();
  return useQuery({
    queryKey: complianceKeys.tollDetail(slug, uuid ?? ''),
    enabled: !!slug && !!uuid,
    queryFn: ({ signal }) => unwrap(api.GET('/v1/tenant/toll-passes/{uuid}', { params: path(uuid!), signal })),
  });
}

/** The vehicle's rentals around the pass time (`contains_pass` marks the actual interval). */
export function useTollCandidates(uuid: string) {
  const slug = useSlug();
  return useQuery({
    queryKey: complianceKeys.candidates(slug, uuid),
    enabled: !!slug && !!uuid,
    queryFn: ({ signal }) =>
      unwrap(api.GET('/v1/tenant/toll-passes/{uuid}/candidates', { params: path(uuid), signal })),
  });
}

/** Any rental by reference / plate / customer (the panel's assign search: delivered or returned rentals). */
export function useRentalSearch(q: string, enabled: boolean) {
  const slug = useSlug();
  return useQuery({
    queryKey: ['tenant', slug, 'tolls', 'rental-search', q],
    enabled: !!slug && enabled && q.trim().length > 0,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const page = await unwrap(
        api.GET('/v1/tenant/rentals', {
          params: {
            header: orgHeader(),
            query: { limit: 10, offset: 0, q: q.trim(), status: 'active,return_check,returned', sort: '-created_at' },
          },
          signal,
        }),
      );
      return page.items;
    },
  });
}

function useSettleToll() {
  const slug = useSlug();
  const qc = useQueryClient();
  return (p: TollPassDetail) => {
    qc.setQueryData(complianceKeys.tollDetail(slug, p.uuid), p);
    void qc.invalidateQueries({ queryKey: complianceKeys.tolls(slug) });
    // The charge moves between rentals.
    void qc.invalidateQueries({ queryKey: ['tenant', slug, 'rentals'] });
  };
}

/** Assign (or reassign) to a rental with a reason (`tenant.tolls.review`). */
export function useAssignToll(uuid: string) {
  const settle = useSettleToll();
  return useMutation({
    mutationFn: (body: { rental_uuid: string; reason: string }) =>
      unwrap(api.POST('/v1/tenant/toll-passes/{uuid}/assign', { params: path(uuid), body })),
    onSuccess: settle,
  });
}

/** Unassign / ignore / rematch with a reason (`tenant.tolls.review`). */
export function useTollDecision(uuid: string, action: TollDecision) {
  const settle = useSettleToll();
  return useMutation({
    mutationFn: (reason: string) => {
      const opts = { params: path(uuid), body: { reason } };
      if (action === 'unassign') return unwrap(api.POST('/v1/tenant/toll-passes/{uuid}/unassign', opts));
      if (action === 'ignore') return unwrap(api.POST('/v1/tenant/toll-passes/{uuid}/ignore', opts));
      return unwrap(api.POST('/v1/tenant/toll-passes/{uuid}/rematch', opts));
    },
    onSuccess: settle,
  });
}
