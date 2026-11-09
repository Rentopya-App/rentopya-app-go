import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, orgHeader, unwrap } from '@/core/api/client';
import { ApiError, isApiError } from '@/core/api/errors';
import type { components } from '@/core/api/schema';
import { Permission, useCan } from '@/core/auth/permissions';
import { useSession } from '@/core/auth/session';
import { API_URL } from '@/core/config';
import { apiErrorMessage, i18n } from '@/core/i18n';

import type {
  Inspection,
  InspectionCompleteRequest,
  InspectionDamageRequest,
  InspectionDraftRequest,
  InspectionKind,
} from './model';

type S = components['schemas'];

/**
 * Calls of the handover / return wizard, the same endpoints the panel's
 * `inspectionsService` uses. Every key that belongs to a form contains its
 * uuid: the upload queue invalidates those after it sent a photo or the
 * signature.
 */
export const inspectionKeys = {
  start: (slug: string, rental: string, kind: InspectionKind) => ['tenant', slug, 'inspections', 'start', rental, kind],
  detail: (slug: string, uuid: string) => ['tenant', slug, 'inspections', 'detail', uuid],
  media: (slug: string, uuid: string, version: string) => ['tenant', slug, 'inspections', 'media', uuid, version],
};

function useSlug() {
  return useSession((s) => s.organization?.slug ?? '');
}

/** `POST /v1/tenant/inspections`: starts or resumes the live form of the rental (the panel does it on open). */
export function useStartInspection(rentalUuid: string | undefined, kind: InspectionKind) {
  const slug = useSlug();
  const can = useCan();
  return useQuery({
    queryKey: inspectionKeys.start(slug, rentalUuid ?? '', kind),
    enabled: !!slug && !!rentalUuid && can(Permission.TenantRentalsWrite),
    retry: false,
    staleTime: Infinity,
    queryFn: () =>
      unwrap(
        api.POST('/v1/tenant/inspections', {
          params: { header: orgHeader() },
          body: { rental_uuid: rentalUuid!, kind },
        }),
      ),
  });
}

export function useInspection(uuid: string | null | undefined, initial?: Inspection) {
  const slug = useSlug();
  return useQuery({
    queryKey: inspectionKeys.detail(slug, uuid ?? ''),
    enabled: !!slug && !!uuid,
    initialData: initial,
    initialDataUpdatedAt: 0,
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/v1/tenant/inspections/{uuid}', { params: { header: orgHeader(), path: { uuid: uuid! } }, signal }),
      ),
  });
}

/** Puts the server's answer (the whole form) into the cache. */
function useSetInspection() {
  const slug = useSlug();
  const qc = useQueryClient();
  return (ins: Inspection) => qc.setQueryData(inspectionKeys.detail(slug, ins.uuid), ins);
}

/** `PATCH …/{uuid}`: draft fields. */
export function useUpdateDraft(uuid: string) {
  const set = useSetInspection();
  return useMutation({
    mutationFn: (body: InspectionDraftRequest) =>
      unwrap(api.PATCH('/v1/tenant/inspections/{uuid}', { params: { header: orgHeader(), path: { uuid } }, body })),
    onSuccess: set,
  });
}

export function useDamageActions(uuid: string) {
  const set = useSetInspection();
  const add = useMutation({
    mutationFn: (body: InspectionDamageRequest) =>
      unwrap(
        api.POST('/v1/tenant/inspections/{uuid}/damages', { params: { header: orgHeader(), path: { uuid } }, body }),
      ),
    onSuccess: set,
  });
  const remove = useMutation({
    mutationFn: (damageUuid: string) =>
      unwrap(
        api.DELETE('/v1/tenant/inspections/{uuid}/damages/{damageUuid}', {
          params: { header: orgHeader(), path: { uuid, damageUuid } },
        }),
      ),
    onSuccess: set,
  });
  return { add, remove };
}

export function useDeletePhoto(uuid: string) {
  const set = useSetInspection();
  return useMutation({
    mutationFn: (photoUuid: string) =>
      unwrap(
        api.DELETE('/v1/tenant/inspections/{uuid}/photos/{photoUuid}', {
          params: { header: orgHeader(), path: { uuid, photoUuid } },
        }),
      ),
    onSuccess: set,
  });
}

/**
 * Short-lived links (10 min) of a form's completed photos and signature,
 * `uuid → absolute URL`. The API issues `/v1/public/media/inspections/{token}`;
 * the app only puts its origin in front. Refreshed when the evidence changes.
 */
export function useMediaLinks(uuid: string | null | undefined, version: string) {
  const slug = useSlug();
  return useQuery({
    queryKey: inspectionKeys.media(slug, uuid ?? '', version),
    enabled: !!slug && !!uuid && version !== '',
    staleTime: 8 * 60_000,
    refetchInterval: 8 * 60_000,
    queryFn: async () => {
      const out = await unwrap(
        api.POST('/v1/tenant/inspections/{uuid}/media-links', {
          params: { header: orgHeader(), path: { uuid: uuid! } },
          body: {},
        }),
      );
      const map: Record<string, string> = {};
      for (const l of out.items) {
        if (l.url.startsWith('/v1/public/media/')) map[l.uuid] = `${API_URL}${l.url}`;
        else if (/^https:\/\//.test(l.url)) map[l.uuid] = l.url;
      }
      return map;
    },
  });
}

/** Version string of the completed evidence (the media link query refetches when it changes). */
export function evidenceVersion(ins: Pick<Inspection, 'photos' | 'signature'> | null | undefined) {
  if (!ins) return '';
  const ids = ins.photos
    .filter((p) => p.status === 'completed')
    .map((p) => p.uuid)
    .sort();
  if (ins.signature) ids.push(ins.signature.uuid);
  return ids.join(',');
}

/** `POST …/complete`: finalizes the form (the rentals handover / return runs in the same transaction). */
export function useCompleteInspection(uuid: string) {
  const set = useSetInspection();
  const slug = useSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: InspectionCompleteRequest) =>
      unwrap(
        api.POST('/v1/tenant/inspections/{uuid}/complete', { params: { header: orgHeader(), path: { uuid } }, body }),
      ),
    onSuccess: (ins) => {
      set(ins);
      // The rental, the board and the KABİS chip changed with it.
      void qc.invalidateQueries({ queryKey: ['tenant', slug, 'rentals'] });
      void qc.invalidateQueries({ queryKey: ['tenant', slug, 'kabis'] });
      void qc.invalidateQueries({ queryKey: ['tenant', slug, 'overview'] });
    },
  });
}

// --- contract (in-person signature or remote approval) ----------------------

export function useContractDocument(docUuid: string | null | undefined, enabled = true) {
  const slug = useSlug();
  return useQuery({
    queryKey: ['tenant', slug, 'documents', 'detail', docUuid],
    enabled: !!slug && !!docUuid && enabled,
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/v1/tenant/documents/{uuid}', {
          params: { header: orgHeader(), path: { uuid: docUuid! } },
          signal,
        }),
      ),
  });
}

export function useContractVersion(docUuid: string | null | undefined, versionUuid: string | null | undefined) {
  const slug = useSlug();
  return useQuery({
    queryKey: ['tenant', slug, 'documents', 'version', docUuid, versionUuid],
    enabled: !!slug && !!docUuid && !!versionUuid,
    staleTime: Infinity,
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/v1/tenant/documents/{uuid}/versions/{documentVersionUuid}', {
          params: { header: orgHeader(), path: { uuid: docUuid!, documentVersionUuid: versionUuid! } },
          signal,
        }),
      ),
  });
}

export type ApprovalLink = S['DocumentApprovalLink'];

export function useDocumentSigners(docUuid: string | null | undefined, enabled: boolean) {
  const slug = useSlug();
  return useQuery({
    queryKey: ['tenant', slug, 'documents', 'signers', docUuid],
    enabled: !!slug && !!docUuid && enabled,
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/v1/tenant/documents/{uuid}/signers', {
          params: { header: orgHeader(), path: { uuid: docUuid! } },
          signal,
        }),
      ),
  });
}

/** The document's approval links; polled while one is still open so an SMS approval shows up on its own. */
export function useApprovalLinks(docUuid: string | null | undefined, enabled: boolean) {
  const slug = useSlug();
  return useQuery<{ items: ApprovalLink[] }>({
    queryKey: ['tenant', slug, 'documents', 'approval-links', docUuid],
    enabled: !!slug && !!docUuid && enabled,
    refetchInterval: (q) => (q.state.data?.items.some((l) => l.status === 'pending') ? 10_000 : false),
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/v1/tenant/documents/{uuid}/approval-links', {
          params: { header: orgHeader(), path: { uuid: docUuid! } },
          signal,
        }),
      ),
  });
}

export function useApprovalLinkActions(docUuid: string) {
  const slug = useSlug();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['tenant', slug, 'documents'] });
  const create = useMutation({
    mutationFn: (v: { versionUuid: string; body: S['DocumentApprovalLinkCreateRequest'] }) =>
      unwrap(
        api.POST('/v1/tenant/documents/{uuid}/versions/{documentVersionUuid}/approval-links', {
          params: { header: orgHeader(), path: { uuid: docUuid, documentVersionUuid: v.versionUuid } },
          body: v.body,
        }),
      ),
    onSuccess: refresh,
  });
  const send = useMutation({
    mutationFn: (linkUuid: string) =>
      unwrap(
        api.POST('/v1/tenant/documents/{uuid}/approval-links/{linkUuid}/send-sms', {
          params: { header: orgHeader(), path: { uuid: docUuid, linkUuid } },
        }),
      ),
    onSuccess: refresh,
  });
  return { create, send };
}

// --- KABİS chip -------------------------------------------------------------

export type KabisNotification = S['KabisNotification'];

/** The rental's KABİS notifications (`tenant.kabis.read`), like the panel's rental chip. */
export function useRentalKabis(rentalUuid: string | null | undefined) {
  const slug = useSlug();
  const can = useCan();
  return useQuery({
    queryKey: ['tenant', slug, 'kabis', 'rental', rentalUuid],
    enabled: !!slug && !!rentalUuid && can(Permission.TenantKabisRead),
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/v1/tenant/kabis-notifications', {
          params: {
            header: orgHeader(),
            query: { limit: 20, offset: 0, rental: rentalUuid!, sort: 'created_at' },
          },
          signal,
        }),
      ),
  });
}

// --- errors -----------------------------------------------------------------

const PROBLEM_KEYS: Record<string, string> = {
  inspection_incomplete: 'problems.incomplete',
  signature_required: 'problems.signature_required',
  finalized: 'problems.finalized',
  review_first: 'problems.review_first',
  signature_bound: 'problems.signature_bound',
  content_changed: 'problems.content_changed',
  not_uploaded: 'problems.not_uploaded',
  object_missing: 'problems.object_missing',
  size_mismatch: 'problems.object_missing',
  invalid_type: 'photos.invalid_type',
  type_mismatch: 'photos.invalid_type',
  too_large: 'photos.too_large',
  invalid_state: 'problems.invalid_state',
  review_pending: 'problems.review_pending',
  no_review: 'problems.no_review',
};

/** Text of a queue job's last error code (the detail codes first, then the catalog). */
export function codeText(code: string) {
  const key = PROBLEM_KEYS[code.toLowerCase()];
  return key ? i18n.t(`inspections:${key}`) : apiErrorMessage(new ApiError(400, { code }));
}

/** The panel's `inspectionProblemText`: the detail code first, then the API error catalog. */
export function problemText(e: unknown) {
  if (isApiError(e)) {
    if (e.status === 403) return i18n.t('inspections:problems.forbidden');
    const detail = e.details?.[0]?.code;
    const key = detail ? PROBLEM_KEYS[detail] : PROBLEM_KEYS[e.code.toLowerCase()];
    if (key) return i18n.t(`inspections:${key}`);
  }
  return apiErrorMessage(e);
}
