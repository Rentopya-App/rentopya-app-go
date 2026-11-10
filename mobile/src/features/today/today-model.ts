/**
 * The "Bugün" board's pure rules: how `/v1/tenant/overview` is split into
 * sections, which KPI chips show, tones of the status pills and which field
 * action a rental offers. Free of app imports so it runs under `node --test`.
 */
import type { components } from '../../core/api/schema';

type S = components['schemas'];

export type TenantOverview = S['TenantOverview'];
export type TenantOverviewBadges = S['TenantOverviewBadges'];
export type OverviewOperationItem = S['OverviewOperationItem'];
export type OverviewOverdueItem = S['OverviewOverdueItem'];
export type OverviewWaitingItem = S['OverviewWaitingItem'];
export type OverviewDocumentItem = S['OverviewDocumentItem'];
export type RentalStatus = S['Rental']['status'];
export type ReservationStatus = S['Reservation']['status'];
export type OperationStatus = OverviewOperationItem['status'];

/** Same tones as `StatusPill` (`src/ui/status-pill.tsx`). */
export type Tone = 'neutral' | 'progress' | 'done' | 'problem';

/** Query key of the board, one per organization and branch filter (like the panel's `overviewKeys.page`). */
export function overviewKey(slug: string | undefined, branch: string | null | undefined) {
  return ['tenant', slug ?? '', 'overview', 'page', branch ?? 'all'] as const;
}

export function badgesKey(slug: string | undefined) {
  return ['tenant', slug ?? '', 'overview', 'badges'] as const;
}

/** Today's handovers ("Teslimler") and returns ("İadeler"), each by due time. */
export function splitOperations(items: readonly OverviewOperationItem[] | undefined) {
  const byDue = (a: OverviewOperationItem, b: OverviewOperationItem) => a.due_at.localeCompare(b.due_at);
  const list = [...(items ?? [])];
  return {
    handovers: list.filter((i) => i.task_type === 'handover').sort(byDue),
    returns: list.filter((i) => i.task_type === 'return').sort(byDue),
  };
}

/** Panel tones of operation tasks (`TASK_STATUS_TONES`): planned warns, an issue is a problem. */
export function operationTone(status: OperationStatus): Tone {
  switch (status) {
    case 'completed':
      return 'done';
    case 'issue_reported':
      return 'problem';
    case 'planned':
      return 'progress';
    default:
      return 'neutral';
  }
}

export function rentalTone(status: RentalStatus): Tone {
  switch (status) {
    case 'active':
      return 'done';
    case 'cancelled':
      return 'problem';
    case 'preparation':
    case 'return_check':
      return 'progress';
    default:
      return 'neutral';
  }
}

export function reservationTone(status: ReservationStatus): Tone {
  switch (status) {
    case 'confirmed':
      return 'done';
    case 'cancelled':
    case 'no_show':
      return 'problem';
    case 'awaiting_review':
    case 'awaiting_payment':
      return 'progress';
    default:
      return 'neutral';
  }
}

/**
 * Field actions of a rental, the panel's rule (rental detail page): hand the
 * car over while in preparation, take it back while active; both need
 * `tenant.rentals.write`.
 */
export function rentalActions(status: RentalStatus | undefined, canWrite: boolean) {
  return {
    handover: canWrite && status === 'preparation',
    return: canWrite && status === 'active',
  };
}

/**
 * A deadline against now, in whole minutes split to days / hours / minutes
 * (the panel's countdown): `late` once it passed, `soon` under an hour left.
 */
export function countdown(deadline: string | null | undefined, now: number) {
  if (!deadline) return null;
  const at = new Date(deadline).getTime();
  if (Number.isNaN(at)) return null;
  const left = Math.round((at - now) / 60_000);
  const minutes = Math.abs(left);
  return {
    late: left < 0,
    soon: left >= 0 && left < 60,
    days: Math.floor(minutes / 1440),
    hours: Math.floor((minutes % 1440) / 60),
    minutes: minutes % 60,
  };
}

/** i18n key + params for a countdown (`today:time.late_hours` …). */
export function countdownText(c: NonNullable<ReturnType<typeof countdown>>) {
  const prefix = c.late ? 'time.late' : 'time.left';
  if (c.days > 0) return { key: `${prefix}_days`, params: { days: c.days, hours: c.hours } };
  if (c.hours > 0) return { key: `${prefix}_hours`, params: { hours: c.hours, minutes: c.minutes } };
  return { key: `${prefix}_minutes`, params: { minutes: c.minutes } };
}

export type KpiChip =
  | { key: 'occupancy'; rate: number; rented: number; rentable: number }
  | { key: 'active'; active: number; overdue: number }
  | { key: 'collections'; net: string; currency: string; count: number }
  | { key: 'approvals'; pending: number; overdue: number }
  | { key: 'resolution'; open: number }
  | { key: 'jobs'; total: number };

/**
 * KPI chips in the panel's order. Each one only when the API computed it:
 * a field is `null` without the permission behind it, so the chip set
 * follows the member's roles exactly like the panel cards.
 */
export function kpiChips(data: TenantOverview | undefined, badges: TenantOverviewBadges | undefined): KpiChip[] {
  const out: KpiChip[] = [];
  const k = data?.kpis;
  if (k?.occupancy) out.push({ key: 'occupancy', ...k.occupancy });
  if (k?.active_rentals) out.push({ key: 'active', ...k.active_rentals });
  if (k?.collections_today) {
    const c = k.collections_today;
    out.push({ key: 'collections', net: c.net, currency: c.currency, count: c.count });
  }
  if (badges?.approvals) out.push({ key: 'approvals', ...badges.approvals });
  if (badges?.resolution_tasks) out.push({ key: 'resolution', open: badges.resolution_tasks.open });
  if (data?.integration_jobs) out.push({ key: 'jobs', total: data.integration_jobs.total });
  return out;
}

/** Whether the member may see any part of the board (else the "nothing for your role" state). */
export function hasAnything(data: TenantOverview) {
  return Boolean(
    data.kpis.occupancy ||
    data.kpis.active_rentals ||
    data.kpis.collections_today ||
    data.today_operations ||
    data.overdue_returns ||
    data.approvals ||
    data.awaiting_payment ||
    data.availability_problems ||
    data.integration_jobs ||
    data.documents,
  );
}

/** Where a document row leads: the rental once it exists, else the reservation. */
export function documentTarget(item: OverviewDocumentItem) {
  return item.rental
    ? ({ kind: 'rental', uuid: item.rental.uuid } as const)
    : ({ kind: 'reservation', uuid: item.reservation.uuid } as const);
}
