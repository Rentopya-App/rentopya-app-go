/**
 * Quick reservation, availability and holds: the rules of the panel's
 * `/availability` page and `/reservations/create` wizard, free of app
 * imports so they run under `node --test`. Prices, billing days (the
 * 24-hour rule) and capacity always come from the API; nothing here
 * recomputes them.
 */
import type { components } from '../../core/api/schema';
import { Permission, type PermissionSlug } from '../../core/auth/permission-slugs.ts';
import { zonedIso } from '../../core/zoned.ts';

type S = components['schemas'];

export type AvailabilityProduct = S['AvailabilityProduct'];
export type AvailabilityHold = S['AvailabilityHold'];
export type AvailabilityAlternatives = S['AvailabilityAlternatives'];
export type QuoteSearchItem = S['QuoteSearchItem'];
export type QuoteRequest = S['QuoteRequest'];
export type Quote = S['Quote'];
export type ReservationCreateRequest = S['ReservationCreateRequest'];
export type ReservationDriver = S['ReservationDriver'];

/** Panel requests sell through the branch channel (the web's DEFAULT_CHANNEL). */
export const DEFAULT_CHANNEL = 'branch';
export const DEFAULT_HOLD_MINUTES = 30;
export const MAX_HOLD_MINUTES = 1440;

type Has = (slug: PermissionSlug) => boolean;

// ---------------------------------------------------------------- dates

/** Wall-clock day and time of an instant in a zone, rounded up to the next quarter hour. */
function wallQuarter(ms: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  // Round on a UTC clock carrying the wall time so the day rolls over correctly.
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  const rounded = new Date(Math.ceil(wall / 900_000) * 900_000);
  const iso = rounded.toISOString();
  return { day: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/**
 * The form's starting range, the web's `localInputFromNow(24)` /
 * `localInputFromNow(72)`: pick-up in 24 hours, return in 72, on the
 * quarter hour, as wall clock in the organization zone.
 */
export function defaultRange(timeZone: string, now = Date.now()) {
  return { start: wallQuarter(now + 24 * 3_600_000, timeZone), end: wallQuarter(now + 72 * 3_600_000, timeZone) };
}

export type SearchForm = {
  pickup: string;
  /** '' = return to the pick-up branch. */
  ret: string;
  startDay: string;
  startTime: string;
  endDay: string;
  endTime: string;
};

export type SearchRequest = {
  pickup_branch_uuid: string;
  return_branch_uuid: string;
  starts_at: string;
  ends_at: string;
  channel: string;
};

export type SearchError = 'pickup' | 'ends_after_start' | null;

/** The panel's search form validation (pick-up branch, end after start). */
export function searchError(f: SearchForm, timeZone: string): SearchError {
  if (!f.pickup) return 'pickup';
  const start = zonedIso(f.startDay, f.startTime, timeZone);
  const end = zonedIso(f.endDay, f.endTime, timeZone);
  if (new Date(end).getTime() <= new Date(start).getTime()) return 'ends_after_start';
  return null;
}

/** The availability / quote search body; the API resolves the range and its billing days. */
export function searchRequest(f: SearchForm, timeZone: string): SearchRequest | null {
  if (searchError(f, timeZone)) return null;
  return {
    pickup_branch_uuid: f.pickup,
    return_branch_uuid: f.ret || f.pickup,
    starts_at: zonedIso(f.startDay, f.startTime, timeZone),
    ends_at: zonedIso(f.endDay, f.endTime, timeZone),
    channel: DEFAULT_CHANNEL,
  };
}

// ---------------------------------------------------------------- holds

/** 1 … 1440 whole minutes (the panel's `hold_minutes` check). */
export function holdMinutesValid(text: string) {
  const n = Number(text.trim());
  return text.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= MAX_HOLD_MINUTES;
}

/** "Opsiyon koy" on a result row: `tenant.availability.hold` and something left to sell. */
export function canHold(item: Pick<AvailabilityProduct, 'sellable'>, has: Has) {
  return has(Permission.TenantAvailabilityHold) && item.sellable > 0;
}

/** Extend / release on an active hold (`tenant.availability.hold`, the holds table's row actions). */
export function holdActions(hold: Pick<AvailabilityHold, 'status'>, has: Has) {
  const on = hold.status === 'active' && has(Permission.TenantAvailabilityHold);
  return { extend: on, release: on };
}

export type CapacityProblem = { reason: string; alternatives: AvailabilityAlternatives | null };

/** CAPACITY_UNAVAILABLE: the reason (detail code) and the alternatives (error data). */
export function capacityProblem(
  code: string | undefined,
  data: unknown,
  details?: readonly { code?: string }[] | null,
): CapacityProblem | null {
  if (code !== 'CAPACITY_UNAVAILABLE') return null;
  return {
    reason: details?.[0]?.code ?? 'no_vehicle',
    alternatives: (data as AvailabilityAlternatives | null | undefined) ?? null,
  };
}

/** Detail codes with a label in the panel catalog (`availability:capacity_reason.*`). */
export const CAPACITY_REASONS = [
  'no_vehicle',
  'no_eligible_vehicle',
  'one_way_not_allowed',
  'channel_rules',
  'product_not_sellable',
] as const;

export function capacityReasonKey(reason: string) {
  const known = (CAPACITY_REASONS as readonly string[]).includes(reason) ? reason : 'no_vehicle';
  return `availability:capacity_reason.${known}`;
}

// ---------------------------------------------------------------- wizard

export type Step = 'search' | 'product' | 'customer' | 'discount' | 'summary';
export const STEPS: readonly Step[] = ['search', 'product', 'customer', 'discount', 'summary'];

/** Steps open once the earlier choices exist (the panel's `reachable`). */
export function reachable(
  step: Step,
  s: { search: boolean; product: boolean; customer: boolean; quote: boolean },
): boolean {
  switch (step) {
    case 'search':
      return true;
    case 'product':
      return s.search;
    case 'customer':
      return s.product;
    case 'discount':
      return s.product && s.customer;
    case 'summary':
      return s.quote;
  }
}

/** Products the list offers to pick: something to sell and a price the API could make. */
export function pickable(item: Pick<QuoteSearchItem, 'sellable' | 'price'>) {
  return item.sellable > 0 && item.price !== null;
}

export type Discount = { coupon: string; kind: 'percent' | 'amount'; value: string; reason: string };
export const NO_DISCOUNT: Discount = { coupon: '', kind: 'percent', value: '', reason: '' };

/** A manual discount is used only without a coupon, and only with `tenant.discount.apply`. */
function manualDiscount(d: Discount, has: Has) {
  if (!has(Permission.TenantDiscountApply) || d.coupon.trim() !== '' || d.value.trim() === '') return null;
  return { kind: d.kind, value: d.value.trim().replace(',', '.'), reason: d.reason.trim() };
}

/** The panel blocks "Fiyatla" while a manual discount lacks its reason (3+ characters). */
export function discountBlocked(d: Discount, has: Has) {
  const manual = manualDiscount(d, has);
  return !!manual && manual.reason.length < 3;
}

/** `POST /v1/tenant/quotes` body of the wizard's selection. */
export function quoteBody(
  search: SearchRequest,
  productUuid: string,
  customerUuid: string,
  discount: Discount,
  has: Has,
): QuoteRequest {
  const coupon = discount.coupon.trim().toUpperCase();
  return {
    ...search,
    product_uuid: productUuid,
    customer_uuid: customerUuid || null,
    extras: [],
    ...(coupon ? { coupon_code: coupon } : {}),
    manual_discount: manualDiscount(discount, has),
  };
}

export type Mode = 'standard' | 'request_only' | 'confirm_now';

/** "Hemen kesinleştir" only with `tenant.reservations.confirm` (the panel's mode options). */
export function modes(has: Has): Mode[] {
  return has(Permission.TenantReservationsConfirm)
    ? ['standard', 'request_only', 'confirm_now']
    : ['standard', 'request_only'];
}

/** `POST /v1/tenant/reservations` body. */
export function createBody(opts: {
  quoteUuid: string;
  customerUuid: string;
  drivers: { selected: string[]; primary: string };
  mode: Mode;
  note: string;
  externalReference: string;
  override?: string;
}): ReservationCreateRequest {
  return {
    quote_uuid: opts.quoteUuid,
    customer_uuid: opts.customerUuid,
    drivers: opts.drivers.selected.map((id) => ({
      driver_uuid: id,
      role: id === opts.drivers.primary ? ('primary' as const) : ('additional' as const),
    })),
    note: opts.note.trim() || undefined,
    external_reference: opts.externalReference.trim() || undefined,
    request_only: opts.mode === 'request_only',
    confirm_now: opts.mode === 'confirm_now',
    eligibility_override: opts.override ? { reason: opts.override } : null,
  };
}

/** What a quote / create call answered, sorted by what the wizard offers next (the panel's `reservationProblem`). */
export type CreateProblem =
  | { kind: 'price_changed'; replacement: Quote | null }
  | { kind: 'quote_expired' }
  | { kind: 'quote_used' }
  | { kind: 'capacity'; reason: string }
  | { kind: 'drivers'; drivers: ReservationDriver[] }
  | { kind: 'equipment' }
  | { kind: 'credit_limit' }
  | { kind: 'coupon'; message: string }
  | { kind: 'other' };

export function createProblem(
  code: string | undefined,
  data: unknown,
  details?: readonly { code?: string; field?: string; message?: string }[] | null,
): CreateProblem {
  switch (code) {
    case 'QUOTE_PRICE_CHANGED':
      return { kind: 'price_changed', replacement: (data as Quote | null) ?? null };
    case 'QUOTE_EXPIRED':
      return { kind: 'quote_expired' };
    case 'QUOTE_USED':
      return { kind: 'quote_used' };
    case 'CAPACITY_UNAVAILABLE':
      return { kind: 'capacity', reason: details?.[0]?.code ?? 'no_vehicle' };
    case 'DRIVER_NOT_ELIGIBLE':
      return { kind: 'drivers', drivers: Array.isArray(data) ? (data as ReservationDriver[]) : [] };
    case 'EQUIPMENT_UNAVAILABLE':
      return { kind: 'equipment' };
    case 'CREDIT_LIMIT_EXCEEDED':
      return { kind: 'credit_limit' };
    default: {
      const coupon = details?.find((d) => d.field === 'coupon_code');
      if (coupon?.code?.startsWith('coupon_')) return { kind: 'coupon', message: coupon.message ?? coupon.code };
      return { kind: 'other' };
    }
  }
}
