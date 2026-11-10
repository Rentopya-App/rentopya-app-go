import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, orgHeader, unwrap, unwrapVoid } from '@/core/api/client';
import { ApiError, toApiError } from '@/core/api/errors';
import type { components } from '@/core/api/schema';
import { Permission, useCan } from '@/core/auth/permissions';
import { useSession } from '@/core/auth/session';
import { formPart } from '@/features/uploads/files';
import { nextOffset, PAGE_SIZE } from '@/ui/paged-list';

import type { PickedFile } from './lib';
import { withStepUp } from './step-up';

type S = components['schemas'];
export type Customer = S['Customer'];
export type CustomerRevealed = S['CustomerRevealed'];
export type CustomerContact = S['CustomerContact'];
export type CustomerDriver = S['CustomerDriver'];
export type CustomerDocument = S['CustomerDocument'];
export type CustomerConsent = S['CustomerConsent'];
export type DriverEligibility = S['DriverEligibility'];
export type FleetActivityEntry = S['FleetActivityEntry'];
export type Agreement = S['Agreement'];
export type AgreementListItem = S['AgreementListItem'];
export type AgreementRentalRow = S['AgreementRentalRow'];

const useOrg = () => useSession((s) => s.organization?.slug ?? '');

/** Every cached query of one customer starts with this key. */
const customerKey = (org: string, uuid: string) => ['customer', org, uuid] as const;
const agreementKey = (org: string, uuid: string) => ['agreement', org, uuid] as const;

export type CustomerFilters = { q: string; type: string | null };

/**
 * `GET /v1/tenant/customers`: name / title, masked identity (the full
 * number), phone and e-mail search; type filter. Customers are organization
 * wide, so the branch filter does not apply. Anonymized records stay out,
 * like the panel's default view.
 */
export function useCustomerList(f: CustomerFilters) {
  const org = useOrg();
  return useInfiniteQuery({
    queryKey: ['customers', org, f],
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/v1/tenant/customers', {
          params: {
            header: orgHeader(),
            query: {
              limit: PAGE_SIZE,
              offset: pageParam,
              sort: 'display_name',
              anonymized: false,
              ...(f.q.trim() ? { q: f.q.trim() } : {}),
              ...(f.type ? { customer_type: f.type } : {}),
            },
          },
        }),
      ),
  });
}

export function useCustomer(uuid: string) {
  const org = useOrg();
  return useQuery({
    queryKey: customerKey(org, uuid),
    enabled: !!uuid,
    queryFn: () => unwrap(api.GET('/v1/tenant/customers/{uuid}', { params: { header: orgHeader(), path: { uuid } } })),
  });
}

export function useCustomerContacts(uuid: string, enabled = true) {
  const org = useOrg();
  return useQuery({
    queryKey: [...customerKey(org, uuid), 'contacts'],
    enabled,
    queryFn: () =>
      unwrap(api.GET('/v1/tenant/customers/{uuid}/contacts', { params: { header: orgHeader(), path: { uuid } } })),
  });
}

export function useCustomerDrivers(uuid: string) {
  const org = useOrg();
  return useQuery({
    queryKey: [...customerKey(org, uuid), 'drivers'],
    queryFn: () =>
      unwrap(api.GET('/v1/tenant/customers/{uuid}/drivers', { params: { header: orgHeader(), path: { uuid } } })),
  });
}

export function useCustomerDocuments(uuid: string) {
  const org = useOrg();
  return useQuery({
    queryKey: [...customerKey(org, uuid), 'documents'],
    queryFn: () =>
      unwrap(api.GET('/v1/tenant/customers/{uuid}/documents', { params: { header: orgHeader(), path: { uuid } } })),
  });
}

export function useCustomerConsents(uuid: string) {
  const org = useOrg();
  return useQuery({
    queryKey: [...customerKey(org, uuid), 'consents'],
    queryFn: () =>
      unwrap(api.GET('/v1/tenant/customers/{uuid}/consents', { params: { header: orgHeader(), path: { uuid } } })),
  });
}

/** Activity (audit) of the customer, newest first, paged. */
export function useCustomerActivity(uuid: string, limit = PAGE_SIZE) {
  const org = useOrg();
  return useInfiniteQuery({
    queryKey: [...customerKey(org, uuid), 'activity', limit],
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/v1/tenant/customers/{uuid}/activity', {
          params: { header: orgHeader(), path: { uuid }, query: { limit, offset: pageParam } },
        }),
      ),
  });
}

/** After a change: the customer with its sub-lists, and the lists it appears in. */
function useInvalidateCustomer(uuid?: string) {
  const qc = useQueryClient();
  const org = useOrg();
  return () => {
    void qc.invalidateQueries({ queryKey: ['customers', org] });
    if (uuid) void qc.invalidateQueries({ queryKey: customerKey(org, uuid) });
  };
}

/** Pull-to-refresh on the customer page: the customer and every section under it. */
export function useRefreshCustomer(uuid: string) {
  const qc = useQueryClient();
  const org = useOrg();
  return () => qc.refetchQueries({ queryKey: customerKey(org, uuid), type: 'active' });
}

export function useSaveCustomer(uuid?: string) {
  const done = useInvalidateCustomer(uuid);
  return useMutation({
    mutationFn: (body: S['CustomerCreateRequest']) =>
      uuid
        ? unwrap(api.PATCH('/v1/tenant/customers/{uuid}', { params: { header: orgHeader(), path: { uuid } }, body }))
        : unwrap(api.POST('/v1/tenant/customers', { params: { header: orgHeader() }, body })),
    onSuccess: done,
  });
}

/**
 * `POST /reveal` with a reason (`tenant.customers.reveal`, recorded in the
 * activity). The plaintext is never cached: the caller keeps it in memory
 * for `display_seconds`. A `STEP_UP_REQUIRED` answer asks for the password
 * and repeats the call once, like the panel's step-up interceptor.
 */
export function useRevealCustomer(uuid: string) {
  const qc = useQueryClient();
  const org = useOrg();
  return useMutation({
    mutationFn: (reason: string) =>
      withStepUp(() =>
        unwrap(
          api.POST('/v1/tenant/customers/{uuid}/reveal', {
            params: { header: orgHeader(), path: { uuid } },
            body: { reason },
          }),
        ),
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...customerKey(org, uuid), 'activity'] }),
  });
}

export function useSaveContact(uuid: string) {
  const done = useInvalidateCustomer(uuid);
  return useMutation({
    mutationFn: ({ contactUuid, body }: { contactUuid?: string; body: S['CustomerContactCreateRequest'] }) =>
      contactUuid
        ? unwrap(
            api.PATCH('/v1/tenant/customers/{uuid}/contacts/{contactUuid}', {
              params: { header: orgHeader(), path: { uuid, contactUuid } },
              body,
            }),
          )
        : unwrap(
            api.POST('/v1/tenant/customers/{uuid}/contacts', { params: { header: orgHeader(), path: { uuid } }, body }),
          ),
    onSuccess: done,
  });
}

export function useDeleteContact(uuid: string) {
  const done = useInvalidateCustomer(uuid);
  return useMutation({
    mutationFn: (contactUuid: string) =>
      unwrapVoid(
        api.DELETE('/v1/tenant/customers/{uuid}/contacts/{contactUuid}', {
          params: { header: orgHeader(), path: { uuid, contactUuid } },
        }),
      ),
    onSuccess: done,
  });
}

export function useSaveDriver(uuid: string) {
  const done = useInvalidateCustomer(uuid);
  return useMutation({
    mutationFn: ({ driverUuid, body }: { driverUuid?: string; body: S['CustomerDriverCreateRequest'] }) =>
      driverUuid
        ? unwrap(
            api.PATCH('/v1/tenant/customers/{uuid}/drivers/{driverUuid}', {
              params: { header: orgHeader(), path: { uuid, driverUuid } },
              body,
            }),
          )
        : unwrap(
            api.POST('/v1/tenant/customers/{uuid}/drivers', { params: { header: orgHeader(), path: { uuid } }, body }),
          ),
    onSuccess: done,
  });
}

export function useDeleteDriver(uuid: string) {
  const done = useInvalidateCustomer(uuid);
  return useMutation({
    mutationFn: (driverUuid: string) =>
      unwrapVoid(
        api.DELETE('/v1/tenant/customers/{uuid}/drivers/{driverUuid}', {
          params: { header: orgHeader(), path: { uuid, driverUuid } },
        }),
      ),
    onSuccess: done,
  });
}

/** Rental condition check of one driver (min age / licence years). */
export function useDriverEligibility(uuid: string) {
  return useMutation({
    mutationFn: ({ driverUuid, minAge, minYears }: { driverUuid: string; minAge: number; minYears: number }) =>
      unwrap(
        api.GET('/v1/tenant/customers/{uuid}/drivers/{driverUuid}/eligibility', {
          params: {
            header: orgHeader(),
            path: { uuid, driverUuid },
            query: { min_driver_age: minAge, min_license_years: minYears },
          },
        }),
      ),
  });
}

export function useRecordConsent(uuid: string) {
  const done = useInvalidateCustomer(uuid);
  return useMutation({
    mutationFn: (body: S['CustomerConsentRequest']) =>
      unwrap(
        api.POST('/v1/tenant/customers/{uuid}/consents', { params: { header: orgHeader(), path: { uuid } }, body }),
      ),
    onSuccess: done,
  });
}

/**
 * `PUT /documents/{docUuid}/file` (multipart field `file`), the same call as
 * the panel's uploader. The file goes to the API; the app never sees a
 * storage key.
 */
async function uploadFile(uuid: string, docUuid: string, file: PickedFile) {
  const form = new FormData();
  form.append('file', (await formPart(file.uri, file.name, file.contentType)) as Blob);
  let r;
  try {
    r = await api.PUT('/v1/tenant/customers/{uuid}/documents/{docUuid}/file', {
      params: { header: orgHeader(), path: { uuid, docUuid } },
      body: form as never,
    });
  } catch (e) {
    throw new ApiError(0, { code: 'NETWORK_ERROR', message: e instanceof Error ? e.message : String(e) });
  }
  if (r.error !== undefined || !r.response.ok || !r.data) throw toApiError(r.response.status, r.error);
  return r.data.data;
}

/** New document record, then its file when one was picked (the panel's two calls). */
export function useCreateDocument(uuid: string) {
  const done = useInvalidateCustomer(uuid);
  return useMutation({
    mutationFn: async ({ body, file }: { body: S['CustomerDocumentCreateRequest']; file: PickedFile | null }) => {
      const saved = await unwrap(
        api.POST('/v1/tenant/customers/{uuid}/documents', { params: { header: orgHeader(), path: { uuid } }, body }),
      );
      if (!file) return saved;
      try {
        return await uploadFile(uuid, saved.uuid, file);
      } catch (e) {
        // The record exists without a file; the list shows it so the file can be added again.
        done();
        throw e;
      }
    },
    onSuccess: done,
  });
}

export function useUploadDocumentFile(uuid: string) {
  const done = useInvalidateCustomer(uuid);
  return useMutation({
    mutationFn: ({ docUuid, file }: { docUuid: string; file: PickedFile }) => uploadFile(uuid, docUuid, file),
    onSuccess: done,
  });
}

export function useDeleteDocument(uuid: string) {
  const done = useInvalidateCustomer(uuid);
  return useMutation({
    mutationFn: (docUuid: string) =>
      unwrapVoid(
        api.DELETE('/v1/tenant/customers/{uuid}/documents/{docUuid}', {
          params: { header: orgHeader(), path: { uuid, docUuid } },
        }),
      ),
    onSuccess: done,
  });
}

// ---- Corporate agreements (read) ----

export type AgreementFilters = { q: string; status: string | null; branch: string | null };

/** `GET /v1/tenant/agreements`: code / name / customer search, status, managing branch (the menu's branch filter). */
export function useAgreementList(f: AgreementFilters) {
  const org = useOrg();
  return useInfiniteQuery({
    queryKey: ['agreements', org, f],
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/v1/tenant/agreements', {
          params: {
            header: orgHeader(),
            query: {
              limit: PAGE_SIZE,
              offset: pageParam,
              sort: '-created_at',
              ...(f.q.trim() ? { q: f.q.trim() } : {}),
              ...(f.status ? { status: f.status } : {}),
              ...(f.branch ? { branch: f.branch } : {}),
            },
          },
        }),
      ),
  });
}

/** Agreements of one customer (the customer page's section; `tenant.agreements.read`). */
export function useCustomerAgreements(customerUuid: string) {
  const org = useOrg();
  const can = useCan();
  return useQuery({
    queryKey: [...customerKey(org, customerUuid), 'agreements'],
    enabled: can(Permission.TenantAgreementsRead),
    queryFn: () =>
      unwrap(
        api.GET('/v1/tenant/agreements', {
          params: { header: orgHeader(), query: { customer: customerUuid, limit: 10, offset: 0 } },
        }),
      ),
  });
}

export function useAgreement(uuid: string) {
  const org = useOrg();
  return useQuery({
    queryKey: agreementKey(org, uuid),
    enabled: !!uuid,
    queryFn: () => unwrap(api.GET('/v1/tenant/agreements/{uuid}', { params: { header: orgHeader(), path: { uuid } } })),
  });
}

export function useAgreementRentals(uuid: string) {
  const org = useOrg();
  return useQuery({
    queryKey: [...agreementKey(org, uuid), 'rentals'],
    queryFn: () =>
      unwrap(api.GET('/v1/tenant/agreements/{uuid}/rentals', { params: { header: orgHeader(), path: { uuid } } })),
  });
}

export function useAgreementActivity(uuid: string, limit = 10) {
  const org = useOrg();
  return useQuery({
    queryKey: [...agreementKey(org, uuid), 'activity', limit],
    queryFn: () =>
      unwrap(
        api.GET('/v1/tenant/agreements/{uuid}/activity', {
          params: { header: orgHeader(), path: { uuid }, query: { limit, offset: 0 } },
        }),
      ),
  });
}

export function useRefreshAgreement(uuid: string) {
  const qc = useQueryClient();
  const org = useOrg();
  return () => qc.refetchQueries({ queryKey: agreementKey(org, uuid), type: 'active' });
}
