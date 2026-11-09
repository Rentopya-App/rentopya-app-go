import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, orgHeader, unwrap } from '@/core/api/client';
import { useSession } from '@/core/auth/session';

import { inspectionKeys } from './api';
import type { RentalCharge, VehicleStatus } from './return-model';

function useSlug() {
  return useSession((s) => s.organization?.slug ?? '');
}

/**
 * The return's own calls: the charge proposal of the form, the review of a
 * disputed / unsigned return, and the rental's charge decisions and return
 * check (the panel's rental detail). Keys carry the inspection or rental uuid.
 */
export function useChargePreview(uuid: string, enabled: boolean, version: string) {
  const slug = useSlug();
  return useQuery({
    queryKey: ['tenant', slug, 'inspections', 'charges', uuid, version],
    enabled: !!slug && enabled,
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/v1/tenant/inspections/{uuid}/charges', { params: { header: orgHeader(), path: { uuid } }, signal }),
      ),
  });
}

export function useReviewInspection(uuid: string) {
  const slug = useSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { note: string; vehicle_status?: VehicleStatus }) =>
      unwrap(api.POST('/v1/tenant/inspections/{uuid}/review', { params: { header: orgHeader(), path: { uuid } }, body })),
    onSuccess: (ins) => {
      qc.setQueryData(inspectionKeys.detail(slug, uuid), ins);
      void qc.invalidateQueries({ queryKey: ['tenant', slug, 'rentals'] });
      void qc.invalidateQueries({ queryKey: ['tenant', slug, 'overview'] });
    },
  });
}

const rentalKey = (slug: string, uuid: string) => ['tenant', slug, 'rentals', 'detail', uuid];

/** The rental after the return (`tenant.rentals.read`): its status and the stored charges. */
export function useReturnRental(uuid: string, enabled: boolean) {
  const slug = useSlug();
  return useQuery({
    queryKey: rentalKey(slug, uuid),
    enabled: !!slug && enabled,
    queryFn: ({ signal }) =>
      unwrap(api.GET('/v1/tenant/rentals/{uuid}', { params: { header: orgHeader(), path: { uuid } }, signal })),
  });
}

export function useDecideCharge(rentalUuid: string) {
  const slug = useSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ charge, decision, note }: { charge: RentalCharge; decision: 'approve' | 'waive'; note: string }) => {
      const params = { header: orgHeader(), path: { uuid: rentalUuid, chargeUuid: charge.uuid } };
      const body = { note: note.trim() || undefined };
      return unwrap(
        decision === 'approve'
          ? api.POST('/v1/tenant/rentals/{uuid}/charges/{chargeUuid}/approve', { params, body })
          : api.POST('/v1/tenant/rentals/{uuid}/charges/{chargeUuid}/waive', { params, body }),
      );
    },
    onSuccess: (rental) => qc.setQueryData(rentalKey(slug, rentalUuid), rental),
  });
}

export function useCompleteReturn(rentalUuid: string) {
  const slug = useSlug();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { vehicle_status?: VehicleStatus; note?: string; deposit_task?: boolean }) =>
      unwrap(
        api.POST('/v1/tenant/rentals/{uuid}/complete-return', {
          params: { header: orgHeader(), path: { uuid: rentalUuid } },
          body,
        }),
      ),
    onSuccess: (rental) => {
      qc.setQueryData(rentalKey(slug, rentalUuid), rental);
      void qc.invalidateQueries({ queryKey: ['tenant', slug, 'overview'] });
    },
  });
}
