/**
 * Transfer rules shared by the list, the detail and the forms (the panel's
 * `features/fleet-ops` transfers). Free of app imports so it runs under
 * `node --test`.
 */
import type { components } from '../../core/api/schema';
import { DEFAULT_TIME_ZONE } from '../../core/date-format.ts';
import { zonedIso } from '../../core/zoned.ts';

type S = components['schemas'];
export type Transfer = S['Transfer'];
export type TransferStatus = Transfer['status'];
export type TransferAction = 'start' | 'complete' | 'cancel';
export type TransferCreateRequest = S['TransferCreateRequest'];
export type TransferPatchRequest = S['TransferPatchRequest'];
export type TransferActionRequest = S['TransferActionRequest'];
export type ArrivalStatus = NonNullable<TransferActionRequest['arrival_status']>;

export const TRANSFER_STATUSES: readonly TransferStatus[] = ['planned', 'in_transit', 'completed', 'cancelled'];

/** Transfers still to happen (the list's default). */
export const OPEN_STATUSES: readonly TransferStatus[] = ['planned', 'in_transit'];

/** The list's status chips: open ones (default), every status, or one status. */
export const STATUS_FILTERS = ['open', 'all', ...TRANSFER_STATUSES] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** With a branch picked in the menu: transfers leaving it, arriving at it, or every branch. */
export const DIRECTIONS = ['from', 'to', 'any'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export type StatusTone = 'neutral' | 'progress' | 'done' | 'problem';

export const STATUS_TONES: Record<TransferStatus, StatusTone> = {
  planned: 'neutral',
  in_transit: 'progress',
  completed: 'done',
  cancelled: 'problem',
};

export const ARRIVAL_STATUSES: readonly ArrivalStatus[] = ['preparing', 'available'];

/** `GET /v1/tenant/transfers` query of the list's filters (multi-values comma-joined). */
export function transferQuery(f: { q: string; status: StatusFilter; branch: string | null; direction: Direction }) {
  const q = f.q.trim();
  return {
    sort: '-planned_departure',
    ...(q ? { q } : {}),
    ...(f.status === 'all' ? {} : { status: f.status === 'open' ? OPEN_STATUSES.join(',') : f.status }),
    ...(f.branch && f.direction === 'from' ? { from_branch: f.branch } : {}),
    ...(f.branch && f.direction === 'to' ? { to_branch: f.branch } : {}),
  };
}

/**
 * What the panel's row menu offers: edit unless cancelled (a started one
 * only its cost and note), start a planned one, complete one on the road,
 * cancel either of those.
 */
export function transferActions(t: Pick<Transfer, 'status'>) {
  const out: ('edit' | TransferAction)[] = [];
  if (t.status === 'planned') out.push('start');
  if (t.status === 'in_transit') out.push('complete');
  if (t.status !== 'cancelled') out.push('edit');
  if (t.status === 'planned' || t.status === 'in_transit') out.push('cancel');
  return out;
}

/** Once started, only the cost and the note change (the API answers `409 invalid_state` otherwise). */
export function isStarted(t: Pick<Transfer, 'status'>) {
  return t.status !== 'planned';
}

export function personName(person: { name: string; surname: string; email: string } | null | undefined) {
  if (!person) return '';
  return `${person.name} ${person.surname}`.trim() || person.email;
}

/** A day and a wall-clock time in the organization zone. */
export type Instant = { day: string; time: string };

/** The `{day, time}` of an instant in a zone, the time rounded up to `stepMinutes`. */
export function instantOf(date: Date, timeZone: string | null | undefined, stepMinutes = 30): Instant {
  const step = stepMinutes * 60_000;
  const rounded = new Date(Math.ceil(date.getTime() / step) * step);
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
      .formatToParts(rounded)
      .map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function instantIso(v: Instant | null, timeZone: string | null | undefined) {
  return v ? zonedIso(v.day, v.time, timeZone) : '';
}

/** The plan form (create, or edit of a planned transfer; a started one only edits cost and note). */
export type TransferValues = {
  vehicle_uuid: string;
  /** Empty: where the vehicle is at the planned departure (the API decides). */
  from_branch_uuid: string;
  to_branch_uuid: string;
  /** Empty: nobody responsible. */
  responsible_user_uuid: string;
  /** RFC 3339 instants. */
  planned_departure: string;
  planned_arrival: string;
  cost: string;
  note: string;
};

export type Errors = Record<string, string>;

const MONEY_RE = /^\d{1,12}([.,]\d{1,2})?$/;

/** Client checks of the plan form, the panel's zod schema; values are `transfers:` i18n keys. */
export function validateTransfer(v: TransferValues, started: boolean): Errors {
  const e: Errors = {};
  const cost = v.cost.trim();
  if (cost && !MONEY_RE.test(cost)) e.cost = 'transfers:validation.cost';
  if (started) return e;
  if (!v.vehicle_uuid) e.vehicle_uuid = 'transfers:validation.vehicle';
  if (!v.to_branch_uuid) e.to_branch_uuid = 'transfers:validation.to';
  else if (v.from_branch_uuid && v.from_branch_uuid === v.to_branch_uuid)
    e.to_branch_uuid = 'transfers:validation.same_branch';
  if (!v.planned_departure) e.planned_departure = 'transfers:validation.departure';
  if (!v.planned_arrival) e.planned_arrival = 'transfers:validation.arrival';
  else if (v.planned_departure && new Date(v.planned_arrival) <= new Date(v.planned_departure))
    e.planned_arrival = 'transfers:validation.arrival_after_departure';
  return e;
}

function costValue(cost: string) {
  const c = cost.trim().replace(',', '.');
  return c || null;
}

/** `POST /v1/tenant/transfers` body. */
export function createRequest(v: TransferValues): TransferCreateRequest {
  return {
    vehicle_uuid: v.vehicle_uuid,
    ...(v.from_branch_uuid ? { from_branch_uuid: v.from_branch_uuid } : {}),
    to_branch_uuid: v.to_branch_uuid,
    responsible_user_uuid: v.responsible_user_uuid || null,
    planned_departure: v.planned_departure,
    planned_arrival: v.planned_arrival,
    cost: costValue(v.cost),
    note: v.note.trim(),
  };
}

/** `PATCH /v1/tenant/transfers/{uuid}` body: the plan, or only cost and note once started. */
export function patchRequest(v: TransferValues, started: boolean): TransferPatchRequest {
  if (started) return { cost: costValue(v.cost), note: v.note.trim() };
  const { vehicle_uuid: _vehicle, ...plan } = createRequest(v);
  return plan;
}

/** `POST …/{start|complete|cancel}` body: the time (empty = now), the vehicle status on arrival, a note. */
export function actionRequest(
  action: TransferAction,
  v: { at: string; arrival_status: ArrivalStatus; note: string },
): TransferActionRequest {
  return {
    ...(v.at && action !== 'cancel' ? { at: v.at } : {}),
    ...(action === 'complete' ? { arrival_status: v.arrival_status } : {}),
    note: v.note.trim(),
  };
}
