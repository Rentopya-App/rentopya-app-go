/**
 * Reservation rules shared by the list, the detail and the action screens,
 * mirroring the panel's `features/reservations` (detail page actions,
 * approval queue SLA, payments section, resolution tasks, customer
 * requests). Free of app imports so it runs under `node --test`.
 */
import type { components } from '../../core/api/schema';
import { Permission } from '../../core/auth/permission-slugs.ts';
import { DEFAULT_TIME_ZONE } from '../../core/date-format.ts';
import { dayTimes, zonedIso } from '../../core/zoned.ts';

type S = components['schemas'];

export type Reservation = S['Reservation'];
export type ReservationListItem = S['ReservationListItem'];
export type ReservationEvent = S['ReservationEvent'];
export type ReservationActionFlags = S['ReservationActions'];
export type ReservationStatus = Reservation['status'];
export type PaymentStatus = Reservation['payment_status'];
export type ReservationActor = S['ReservationActor'];
export type ReservationVehicleRef = S['ReservationVehicleRef'];
export type Quote = S['Quote'];
export type QuoteListItem = S['QuoteListItem'];
export type ResolutionTask = S['ResolutionTask'];
export type CustomerRequest = S['StaffCustomerRequest'];
export type PaymentLink = S['PaymentLink'];
export type Payment = S['Payment'];
export type CustomerDriver = S['CustomerDriver'];
export type ExtensionAlternatives = S['ReservationExtensionAlternatives'];
export type ReservationDriver = S['ReservationDriver'];

export type Tone = 'neutral' | 'progress' | 'done' | 'problem';

export const RESERVATION_STATUSES: readonly ReservationStatus[] = [
  'request',
  'awaiting_review',
  'awaiting_payment',
  'confirmed',
  'cancelled',
  'expired',
  'no_show',
];

export const PAYMENT_STATUSES: readonly PaymentStatus[] = ['unpaid', 'partially_paid', 'paid', 'refunded'];

/** The panel's STATUS_TONES (default / warning / success / danger) as pill tones. */
export const STATUS_TONES: Record<ReservationStatus, Tone> = {
  request: 'neutral',
  awaiting_review: 'progress',
  awaiting_payment: 'progress',
  confirmed: 'done',
  cancelled: 'problem',
  expired: 'neutral',
  no_show: 'problem',
};

export const PAYMENT_TONES: Record<PaymentStatus, Tone> = {
  unpaid: 'progress',
  partially_paid: 'progress',
  paid: 'done',
  refunded: 'neutral',
};

// ---------------------------------------------------------------- actions

/** Detail actions, in the panel's order (header buttons, then the "more" menu). */
export const ACTION_ORDER = [
  'submit',
  'approve',
  'reject',
  'confirm',
  'change',
  'extend',
  'plate',
  'drivers',
  'assign',
  'no_show',
  'cancel',
] as const;
export type ReservationAction = (typeof ACTION_ORDER)[number];

type Has = (slug: string) => boolean;

/**
 * The actions the detail offers: the API's `actions` flags (state machine)
 * AND the same permission the panel checks for each button
 * (`ReservationDetailPage`). Drivers and staff have no state flag there:
 * write is enough.
 */
export function availableActions(flags: ReservationActionFlags, has: Has): ReservationAction[] {
  const write = has(Permission.TenantReservationsWrite);
  const approve = has(Permission.TenantReservationsApprove);
  const confirm = has(Permission.TenantReservationsConfirm);
  const cancel = has(Permission.TenantReservationsCancel);
  const on: Record<ReservationAction, boolean> = {
    submit: flags.submit && write,
    approve: flags.approve && approve,
    reject: flags.reject && approve,
    confirm: flags.confirm && confirm,
    change: flags.change && write,
    extend: flags.extend && write,
    plate: flags.plate && write,
    drivers: write,
    assign: write,
    no_show: flags.no_show && cancel,
    cancel: flags.cancel && cancel,
  };
  return ACTION_ORDER.filter((a) => on[a]);
}

/** The one filled button: approve, else confirm, else submit (the panel's primary header buttons). */
export function primaryAction(actions: readonly ReservationAction[]): ReservationAction | null {
  for (const a of ['approve', 'confirm', 'submit'] as const) if (actions.includes(a)) return a;
  return null;
}

/** Actions that destroy the booking (red, asked with a reason). */
export function isDestructive(action: ReservationAction) {
  return action === 'cancel' || action === 'no_show' || action === 'reject';
}

/** Actions that run after a plain confirmation (no form). */
export function isConfirmOnly(action: ReservationAction) {
  return action === 'submit' || action === 'confirm';
}

// ---------------------------------------------------------------- payments

type Money = Pick<Reservation, 'status'> & { price: Pick<Reservation['price'], 'balance'> };

/** Payments section buttons (the panel's `ReservationPayments`). */
export function paymentActions(r: Money, has: Has) {
  const open = Number(r.price.balance) > 0;
  const payableByLink = r.status === 'awaiting_payment' || r.status === 'confirmed';
  const collectable = !['request', 'cancelled', 'expired', 'no_show'].includes(r.status);
  return {
    read: has(Permission.TenantPaymentsRead),
    createLink: has(Permission.TenantPaymentsCreateLink) && payableByLink && open,
    collect: has(Permission.TenantPaymentCollect) && collectable && open,
  };
}

/** What a link row offers: send it while active; cancel needs `tenant.payments.create_link`. */
export function linkActions(link: Pick<PaymentLink, 'status'>, has: Has) {
  const active = link.status === 'active';
  return { send: active, cancel: active && has(Permission.TenantPaymentsCreateLink) };
}

export const LINK_TONES: Record<PaymentLink['status'], Tone> = {
  active: 'progress',
  paid: 'done',
  expired: 'neutral',
  cancelled: 'neutral',
};

export const PAYMENT_ROW_TONES: Record<Payment['status'], Tone> = {
  pending: 'progress',
  succeeded: 'done',
  partially_refunded: 'progress',
  refunded: 'neutral',
  failed: 'problem',
  cancelled: 'neutral',
};

export const COLLECT_METHODS = ['cash', 'card_pos', 'bank_transfer'] as const;
export type CollectMethod = (typeof COLLECT_METHODS)[number];

/**
 * The phone's messages app with the text ready (no recipient: the
 * customer's number is masked in the panel API). iOS takes `&body=`,
 * Android `?body=`.
 */
export function smsUrl(body: string, os: string) {
  return `sms:${os === 'ios' ? '&' : '?'}body=${encodeURIComponent(body)}`;
}

// ---------------------------------------------------------------- approval queue

/** Statuses waiting for staff (the panel's `QUEUE_STATUSES`). */
export const QUEUE_STATUSES: readonly ReservationStatus[] = ['request', 'awaiting_review'];

export type Sla =
  | { kind: 'none' }
  | { kind: 'overdue'; minutes: number }
  | { kind: 'left'; hours: number; minutes: number; soon: boolean };

/** Remaining review time of the queue's SLA column (minutes rounded like the panel). */
export function slaState(deadline: string | null | undefined, now = Date.now()): Sla {
  if (!deadline) return { kind: 'none' };
  const left = Math.round((new Date(deadline).getTime() - now) / 60_000);
  if (left <= 0) return { kind: 'overdue', minutes: Math.abs(left) };
  return { kind: 'left', hours: Math.floor(left / 60), minutes: left % 60, soon: left <= 15 };
}

// ---------------------------------------------------------------- list

export const LIST_SORTS = ['-created_at', 'starts_at'] as const;
export type ListSort = (typeof LIST_SORTS)[number];

export type ListFilters = {
  q: string;
  status: ReservationStatus | 'all';
  payment: PaymentStatus | 'all';
  sort: ListSort;
  branch: string | null;
};

/** `GET /v1/tenant/reservations` query of the list filters (empty ones left out). */
export function listQuery(f: ListFilters) {
  const q = f.q.trim();
  return {
    sort: f.sort,
    ...(q ? { q } : {}),
    ...(f.status !== 'all' ? { status: f.status } : {}),
    ...(f.payment !== 'all' ? { payment_status: f.payment } : {}),
    ...(f.branch ? { branch: f.branch } : {}),
  };
}

// ---------------------------------------------------------------- tasks / requests

export const TASK_TONES: Record<ResolutionTask['status'], Tone> = { open: 'progress', resolved: 'done' };

/** Open tasks: replan, assign, resolve (`tenant.resolution_tasks.write`), like the panel's row actions. */
export function taskActions(task: Pick<ResolutionTask, 'status'>, has: Has) {
  const on = task.status === 'open' && has(Permission.TenantResolutionTasksWrite);
  return { replan: on, assign: on, resolve: on };
}

export const REQUEST_TONES: Record<CustomerRequest['status'], Tone> = {
  open: 'progress',
  resolved: 'done',
  rejected: 'problem',
};

/** Open requests: resolve / reject (`tenant.reservations.write`). */
export function requestActions(req: Pick<CustomerRequest, 'status'>, has: Has) {
  const on = req.status === 'open' && has(Permission.TenantReservationsWrite);
  return { resolve: on, reject: on };
}

/** A rejection needs a note the customer reads; a resolution may go without one. */
export function resolveNoteValid(status: 'resolved' | 'rejected', note: string) {
  const n = note.trim().length;
  return status === 'rejected' ? n >= 3 && n <= 2000 : n <= 2000;
}

export const QUOTE_TONES: Record<QuoteListItem['status'], Tone> = {
  open: 'done',
  used: 'neutral',
  superseded: 'neutral',
};

// ---------------------------------------------------------------- dates

/** Wall-clock day (`YYYY-MM-DD`) and time (`HH:MM`) of an instant in the organization zone. */
export function wallClock(iso: string, timeZone?: string | null) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || DEFAULT_TIME_ZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** Half-hour times of the whole day, plus the current one when it is off the grid (10:15). */
export function timeOptions(current?: string | null) {
  const times = dayTimes(0, 23.5, 30).concat(['23:59']);
  if (current && !times.includes(current)) times.push(current);
  return times.sort();
}

/** The instant of a picked day and time; null while either is missing. */
export function pickedIso(day: string | null | undefined, time: string | null | undefined, timeZone?: string | null) {
  if (!day || !time) return null;
  return zonedIso(day, time, timeZone);
}

/** An extension must end after the current return (the panel's `extend_later` check). */
export function extendsLater(newEnd: string | null, currentEnd: string) {
  return !!newEnd && new Date(newEnd).getTime() > new Date(currentEnd).getTime();
}

/** The panel's `ends_after_start` check. */
export function endsAfterStart(start: string | null, end: string | null) {
  return !!start && !!end && new Date(end).getTime() > new Date(start).getTime();
}

// ---------------------------------------------------------------- drivers

export type DriverPick = { selected: string[]; primary: string };

/** The drivers already on the reservation as a pick (the panel's `DriversDialog` initial state). */
export function initialDrivers(drivers: readonly Pick<ReservationDriver, 'driver_uuid' | 'role'>[]): DriverPick {
  const selected: string[] = [];
  let primary = '';
  for (const d of drivers) {
    if (!d.driver_uuid) continue;
    selected.push(d.driver_uuid);
    if (d.role === 'primary') primary = d.driver_uuid;
  }
  return { selected, primary };
}

/** Toggles a driver; the first one picked becomes primary, and a removed primary hands over to the next. */
export function toggleDriver(pick: DriverPick, uuid: string): DriverPick {
  if (pick.selected.includes(uuid)) {
    const selected = pick.selected.filter((id) => id !== uuid);
    return { selected, primary: pick.primary === uuid ? (selected[0] ?? '') : pick.primary };
  }
  const selected = [...pick.selected, uuid];
  return { selected, primary: pick.primary || uuid };
}

/** `PUT …/drivers` body. */
export function driversBody(pick: DriverPick, overrideReason?: string) {
  return {
    drivers: pick.selected.map((id) => ({
      driver_uuid: id,
      role: id === pick.primary ? ('primary' as const) : ('additional' as const),
    })),
    eligibility_override: overrideReason ? { reason: overrideReason } : null,
  };
}

// ---------------------------------------------------------------- problems

/**
 * What a change / extension / accept / drivers call answered, sorted by
 * what the screen offers next (the panel's `reservationProblem`).
 */
export type ReservationProblem =
  | { kind: 'price_changed'; replacement: Quote | null }
  | { kind: 'quote_expired' }
  | { kind: 'quote_used' }
  | { kind: 'capacity'; reason: string }
  | { kind: 'drivers'; drivers: ReservationDriver[] }
  | { kind: 'extension'; alternatives: ExtensionAlternatives | null }
  | { kind: 'other' };

export function reservationProblem(
  code: string | undefined,
  data: unknown,
  details?: readonly { code?: string }[] | null,
): ReservationProblem {
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
    case 'EXTENSION_CONFLICT':
      return { kind: 'extension', alternatives: (data as ExtensionAlternatives | null) ?? null };
    default:
      return { kind: 'other' };
  }
}

// ---------------------------------------------------------------- text

/** Timeline actions with a label in the panel catalog (`reservations:events.*`). */
export const EVENT_ACTIONS = [
  'created',
  'submit',
  'approve',
  'confirm',
  'cancel',
  'expire',
  'no_show',
  'changed',
  'extended',
  'upgraded',
  'plate_changed',
  'plan_moved',
  'replanned',
  'plan_broken',
  'drivers_changed',
  'assigned',
  'payment_recorded',
  'equipment_warning',
  'coupon_warning',
  'task_resolved',
  'reject',
  'reinstate',
  'late_payment',
  'payment_link_created',
  'payment_link_cancelled',
  'payment_refunded',
  'customer_request',
  'customer_request_resolved',
  'customer_request_rejected',
] as const;

/** `events.*` key of a timeline action (`approved` reads as `approve`); null for an unknown one. */
export function eventKey(action: string) {
  const a = action === 'approved' ? 'approve' : action;
  return (EVENT_ACTIONS as readonly string[]).includes(a) ? `events.${a}` : null;
}

export function personName(p: Pick<ReservationActor, 'name' | 'surname' | 'email'> | null | undefined) {
  if (!p) return '';
  return `${p.name} ${p.surname}`.trim() || p.email;
}

export function vehicleText(v: Pick<ReservationVehicleRef, 'plate' | 'label'> | null | undefined) {
  return v ? [v.plate, v.label].filter(Boolean).join(' · ') : '';
}

/** Branch (and point) of a pick-up or return: "IST · İstanbul (Havalimanı)". */
export function placeText(branch: { code: string; name: string }, point?: { name: string } | null) {
  return `${branch.code} · ${branch.name}${point ? ` (${point.name})` : ''}`;
}
