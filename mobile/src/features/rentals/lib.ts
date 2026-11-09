/**
 * Rental, operation task and inspection record rules shared by the lists,
 * the detail and the action screens (the panel's `features/rentals`
 * constants and dialog rules). Free of app imports so it runs under
 * `node --test`.
 */
import type { components } from '../../core/api/schema';
import { zonedIso } from '../../core/zoned.ts';

type Schemas = components['schemas'];

export type Rental = Schemas['Rental'];
export type RentalListItem = Schemas['RentalListItem'];
export type RentalStatus = Rental['status'];
export type RentalCharge = Schemas['RentalCharge'];
export type RentalEvent = Schemas['RentalEvent'];
export type RentalLeg = Schemas['RentalLeg'];
export type RentalPlace = Schemas['RentalPlace'];
export type Actor = Schemas['ReservationActor'];
export type OperationTask = Schemas['OperationTask'];
export type OperationTaskStatus = OperationTask['status'];
export type OperationTaskType = OperationTask['task_type'];
export type InspectionListItem = Schemas['InspectionListItem'];
export type Inspection = Schemas['Inspection'];
export type InspectionPhoto = Schemas['InspectionPhoto'];
export type InspectionMediaLink = Schemas['InspectionMediaLink'];

export type Tone = 'neutral' | 'progress' | 'done' | 'problem';

// ------------------------------------------------------------ rentals

export const RENTAL_STATUSES: readonly RentalStatus[] = [
  'preparation',
  'active',
  'return_check',
  'returned',
  'cancelled',
];

/** The panel's `RENTAL_STATUS_TONES` in the app's pill tones. */
export const RENTAL_TONES: Record<RentalStatus, Tone> = {
  preparation: 'progress',
  active: 'done',
  return_check: 'progress',
  returned: 'neutral',
  cancelled: 'problem',
};

/**
 * The list's quick filter: every rental, one status, or overdue ones only
 * (the panel's status facet and "Yalnızca gecikenler").
 */
export const RENTAL_FILTERS = [
  'all',
  'preparation',
  'active',
  'overdue',
  'return_check',
  'returned',
  'cancelled',
] as const;
export type RentalFilter = (typeof RENTAL_FILTERS)[number];

/** Sort orders the API accepts on `GET /v1/tenant/rentals` (newest first by default, like the panel). */
export const RENTAL_SORTS = ['-created_at', 'planned_pickup_at', 'planned_return_at', '-planned_return_at'] as const;
export type RentalSort = (typeof RENTAL_SORTS)[number];

/** `GET /v1/tenant/rentals` query of the list screen; empty values are left out. */
export function rentalListQuery(input: {
  q?: string;
  filter: RentalFilter;
  sort: RentalSort;
  branch?: string | null;
  product?: string | null;
}) {
  const out: { sort: string; q?: string; status?: string; overdue?: string; branch?: string; product?: string } = {
    sort: input.sort,
  };
  const q = input.q?.trim();
  if (q) out.q = q;
  if (input.filter === 'overdue') out.overdue = 'true';
  else if (input.filter !== 'all') out.status = input.filter;
  if (input.branch) out.branch = input.branch;
  if (input.product) out.product = input.product;
  return out;
}

/** Permissions the detail checks (the panel's `can(...)` on the rental page). */
export type RentalPerms = { write: boolean; close: boolean; damage: boolean };

/**
 * Actions of the rental page in its current state, the same gates as the
 * panel: handover in preparation and return while active (field forms),
 * extend before the return, swap while active (`tenant.rentals.write`),
 * cancel in preparation (`tenant.rentals.close`).
 */
export function rentalActions(status: RentalStatus | undefined, perms: Pick<RentalPerms, 'write' | 'close'>) {
  return {
    handover: perms.write && status === 'preparation',
    return: perms.write && status === 'active',
    extend: perms.write && (status === 'preparation' || status === 'active'),
    swap: perms.write && status === 'active',
    cancel: perms.close && status === 'preparation',
  };
}

/** Charges the "Ücretler" section lists; toll passes have their own panel section. */
export function listedCharges(charges: RentalCharge[]) {
  return charges.filter((c) => c.source !== 'toll');
}

/** Proposed charges waiting for a decision. */
export function openCharges(charges: RentalCharge[]) {
  return listedCharges(charges).filter((c) => c.status === 'proposed').length;
}

/**
 * Who may decide a proposed charge (the panel's charges table): approve
 * with `tenant.rentals.close`, a damage charge also with
 * `tenant.damage.approve`, a disputed one only with `tenant.damage.approve`;
 * waive with `tenant.rentals.close`.
 */
export function chargeDecisions(
  charge: Pick<RentalCharge, 'status' | 'kind' | 'disputed'>,
  perms: Pick<RentalPerms, 'close' | 'damage'>,
) {
  if (charge.status !== 'proposed') return { approve: false, waive: false };
  const approve = charge.disputed ? perms.damage : perms.close || (charge.kind === 'damage' && perms.damage);
  return { approve, waive: perms.close };
}

export type Decision = 'approve' | 'waive';

export function isDecision(v: unknown): v is Decision {
  return v === 'approve' || v === 'waive';
}

/** A waiver, and any decision on a disputed charge, needs a 3-500 character note; otherwise it is optional. */
export function decisionNoteRequired(decision: Decision, charge: Pick<RentalCharge, 'disputed'>) {
  return decision === 'waive' || charge.disputed;
}

export function decisionNoteValid(note: string, required: boolean) {
  const n = note.trim().length;
  return required ? n >= 3 && n <= 500 : n <= 1000;
}

/** Last known odometer of the rental's current vehicle (the latest leg), if any. */
export function lastKm(legs: Pick<RentalLeg, 'in_km' | 'out_km'>[]): number | null {
  const leg = legs[legs.length - 1];
  if (!leg) return null;
  return leg.in_km ?? leg.out_km ?? null;
}

/** "Merkez · 26 Eki 10:00": the point, else the branch. */
export function placeName(place: RentalPlace) {
  return place.point?.name ?? place.branch?.name ?? '';
}

export function personName(actor: Pick<Actor, 'name' | 'surname' | 'email'> | null | undefined) {
  if (!actor) return '';
  return `${actor.name} ${actor.surname}`.trim() || actor.email;
}

/** i18n key (`rentals:` namespace) of a timeline action; unknown actions show the raw code. */
const EVENT_ACTIONS = new Set([
  'created',
  'handed_over',
  'returned',
  'return_checked',
  'cancelled',
  'extended',
  'vehicle_swapped',
  'plate_changed',
  'overdue',
  'overdue_extended',
  'late_return_tasks',
  'charge_proposed',
  'charge_approved',
  'charge_waived',
  'contract_waived',
  'early_return',
  'reservation_changed',
  'drivers_changed',
  'document_prepared',
  'document_approved',
  'reapproval_required',
  'charge_overridden',
  'inspection_finalized',
  'inspection_revised',
  'inspection_reviewed',
  'toll_charged',
  'toll_reversed',
]);

export function eventActionKey(action: string) {
  return EVENT_ACTIONS.has(action) ? `events.actions.${action}` : null;
}

const EVENT_REASONS = new Set([
  'rental_created',
  'handover',
  'return',
  'plate_changed',
  'vehicle_swapped',
  'changed',
  'drivers_changed',
]);

/** System reason codes of timeline rows have a label; free-text reasons pass through. */
export function eventReasonKey(reason: string) {
  return EVENT_REASONS.has(reason) ? `events.reasons.${reason}` : null;
}

/** 409 detail codes the rental API answers (`rentals:problems.*`). */
const PROBLEMS = new Set([
  'contract_not_approved',
  'invalid_transition',
  'allocation_not_active',
  'reservation_not_confirmed',
  'not_ready',
  'rental_underway',
  'already_decided',
  'task_closed',
  'record_handover',
  'record_return',
  'extension_conflict',
]);

/** Key of a failed rental action's text: a known detail code, the capacity answer, else null (shared catalog). */
export function problemKey(code: string | undefined, details: { code?: string }[] | null | undefined) {
  if (code === 'CAPACITY_UNAVAILABLE') return 'problems.capacity';
  const detail = details?.[0]?.code;
  return detail && PROBLEMS.has(detail) ? `problems.${detail}` : null;
}

// ------------------------------------------------------------ date + time fields

/** Wall-clock day and time (`2026-10-26`, `09:30`) of an instant in a time zone. */
export function wallClock(iso: string, timeZone: string) {
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
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** Times of the strip: every half hour of the day, plus `extra` (the current value) in order. */
export function timesWith(extra: string | null | undefined, step = 30) {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += step)
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  if (extra && /^\d{2}:\d{2}$/.test(extra) && !out.includes(extra)) out.push(extra);
  return out.sort();
}

/**
 * The strip's times starting an hour before the chosen one (the strip does
 * not scroll to its value), the earlier times after the evening ones.
 */
export function timesAround(value: string | null | undefined, step = 30) {
  const all = timesWith(value, step);
  const at = value ? all.indexOf(value) : -1;
  const start = Math.max(0, at - Math.round(60 / step));
  return at < 0 ? all : [...all.slice(start), ...all.slice(0, start)];
}

/** Default new end of an extension: one day after the planned return, same wall-clock time. */
export function nextDayOf(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export type ExtendValues = { day: string; time: string; reason: string };

/** Extension form → `RentalExtendRequest`, or the `rentals:` validation key that blocks it. */
export function extendRequest(v: ExtendValues, plannedReturnAt: string, timeZone: string) {
  if (!v.day || !v.time) return { error: 'validation.required' as const };
  const endsAt = zonedIso(v.day, v.time, timeZone);
  if (new Date(endsAt).getTime() <= new Date(plannedReturnAt).getTime())
    return { error: 'validation.extend_later' as const };
  const reason = v.reason.trim();
  if (reason.length > 500) return { error: 'validation.reason' as const };
  return { body: { ends_at: endsAt, ...(reason ? { reason } : {}) } };
}

export type SwapValues = {
  vehicleUuid: string;
  day: string;
  time: string;
  branchUuid: string;
  inKm: string;
  inFuel: string;
  outKm: string;
  outFuel: string;
  reason: string;
};

type SwapField = 'vehicle' | 'at' | 'branch' | 'in_km' | 'in_fuel' | 'out_km' | 'out_fuel' | 'reason';

const WHOLE = /^\d+$/;

/**
 * Swap form → `RentalSwapRequest`, or the `rentals:` validation key per
 * field (the panel's swap dialog rules: a different vehicle, km not below
 * the last reading, fuel 0-100, a 3-500 character reason).
 */
export function swapRequest(v: SwapValues, current: { vehicleUuid: string; minKm: number }, timeZone: string) {
  const errors: Partial<Record<SwapField, string>> = {};
  if (!v.vehicleUuid) errors.vehicle = 'validation.required';
  else if (v.vehicleUuid === current.vehicleUuid) errors.vehicle = 'validation.same_vehicle';
  if (!v.day || !v.time) errors.at = 'validation.required';
  if (!v.branchUuid) errors.branch = 'validation.required';
  for (const [field, value] of [
    ['in_km', v.inKm],
    ['out_km', v.outKm],
  ] as const) {
    if (!WHOLE.test(value.trim())) errors[field] = 'validation.km';
  }
  if (!errors.in_km && Number(v.inKm) < current.minKm) errors.in_km = 'validation.km_lower';
  for (const [field, value] of [
    ['in_fuel', v.inFuel],
    ['out_fuel', v.outFuel],
  ] as const) {
    if (!WHOLE.test(value.trim()) || Number(value) > 100) errors[field] = 'validation.fuel';
  }
  const reason = v.reason.trim();
  if (reason.length < 3 || reason.length > 500) errors.reason = 'validation.reason';
  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    body: {
      vehicle_uuid: v.vehicleUuid,
      at: zonedIso(v.day, v.time, timeZone),
      branch_uuid: v.branchUuid,
      in_km: Number(v.inKm),
      in_fuel: Number(v.inFuel),
      out_km: Number(v.outKm),
      out_fuel: Number(v.outFuel),
      reason,
    },
  };
}

// ------------------------------------------------------------ operation tasks

export const TASK_TYPES: readonly OperationTaskType[] = [
  'preparation',
  'handover',
  'return',
  'cleaning',
  'maintenance',
  'deposit',
  'transfer',
  'other',
];

/** Statuses of a task still to be done (the panel's `TASK_LIVE_STATUSES`). */
export const TASK_LIVE_STATUSES: readonly OperationTaskStatus[] = ['planned', 'assigned', 'en_route', 'issue_reported'];

export const TASK_TONES: Record<OperationTaskStatus, Tone> = {
  planned: 'progress',
  assigned: 'neutral',
  en_route: 'neutral',
  issue_reported: 'problem',
  completed: 'done',
  cancelled: 'neutral',
};

export function isLiveTask(status: OperationTaskStatus) {
  return TASK_LIVE_STATUSES.includes(status);
}

/** Late: still to do and its due time passed (shown in red on the panel). */
export function isTaskLate(task: Pick<OperationTask, 'status' | 'due_at'>, now = new Date()) {
  return isLiveTask(task.status) && new Date(task.due_at).getTime() < now.getTime();
}

export const TASK_FILTERS = ['live', 'completed', 'cancelled', 'all'] as const;
export type TaskFilter = (typeof TASK_FILTERS)[number];

/** `GET /v1/tenant/operation-tasks` query (sorted by due time, like the panel). */
export function taskListQuery(input: {
  q?: string;
  filter: TaskFilter;
  type?: OperationTaskType | null;
  branch?: string | null;
  rental?: string | null;
}) {
  const out: { sort: string; q?: string; status?: string; task_type?: string; branch?: string; rental?: string } = {
    sort: 'due_at',
  };
  const q = input.q?.trim();
  if (q) out.q = q;
  if (input.filter === 'live') out.status = TASK_LIVE_STATUSES.join(',');
  else if (input.filter !== 'all') out.status = input.filter;
  if (input.type) out.task_type = input.type;
  if (input.branch) out.branch = input.branch;
  if (input.rental) out.rental = input.rental;
  return out;
}

/**
 * Actions of an operation task (the panel's row actions, all behind
 * `tenant.rentals.write`): start a planned / assigned one; assign and
 * cancel a live one; complete only preparation and cleaning by hand
 * (handover / return close with the rental action).
 */
export function taskActions(task: Pick<OperationTask, 'status' | 'task_type'>, canWrite: boolean) {
  const live = isLiveTask(task.status);
  const manual = task.task_type === 'preparation' || task.task_type === 'cleaning';
  return {
    start: canWrite && (task.status === 'planned' || task.status === 'assigned'),
    assign: canWrite && live,
    complete: canWrite && live && manual,
    cancel: canWrite && live,
  };
}

// ------------------------------------------------------------ inspections

/** The forms list's quick filter; the default is the review queue, like the panel. */
export const INSPECTION_FILTERS = ['review', 'all', 'handover', 'return', 'draft'] as const;
export type InspectionFilter = (typeof INSPECTION_FILTERS)[number];

export function inspectionListQuery(input: { q?: string; filter: InspectionFilter; rental?: string | null }) {
  const out: { sort: string; q?: string; kind?: string; status?: string; review_status?: string; rental?: string } = {
    sort: '-created_at',
  };
  const q = input.q?.trim();
  if (q) out.q = q;
  if (input.filter === 'review') out.review_status = 'pending';
  else if (input.filter === 'handover' || input.filter === 'return') out.kind = input.filter;
  else if (input.filter === 'draft') out.status = 'draft';
  if (input.rental) out.rental = input.rental;
  return out;
}

export const INSPECTION_STATUS_TONES: Record<Inspection['status'], Tone> = {
  draft: 'progress',
  finalized: 'done',
  superseded: 'neutral',
};

export const REVIEW_TONES: Record<Inspection['review_status'], Tone> = {
  none: 'neutral',
  pending: 'problem',
  resolved: 'done',
};

/**
 * A media link the API issued, made absolute: only the API's signed
 * `/v1/public/media/` paths or an https URL. Anything else is refused
 * (never assemble storage keys in the app).
 */
export function mediaHref(url: string | null | undefined, apiUrl: string) {
  const u = url?.trim();
  if (!u) return null;
  if (u.startsWith('/v1/public/media/')) return `${apiUrl.replace(/\/$/, '')}${u}`;
  if (/^https:\/\//.test(u)) return u;
  return null;
}

/** Link map (uuid → absolute URL) of `POST …/media-links`. */
export function mediaMap(items: Pick<InspectionMediaLink, 'uuid' | 'url'>[], apiUrl: string) {
  const out: Record<string, string> = {};
  for (const l of items) {
    const href = mediaHref(l.url, apiUrl);
    if (href) out[l.uuid] = href;
  }
  return out;
}

/** Completed photos grouped by slot in template order, the damage and extra photos last. */
export function photoGroups(ins: Pick<Inspection, 'photos' | 'template'>) {
  const done = ins.photos.filter((p) => p.status === 'completed');
  const order = ins.template.photo_slots.map((s) => s.key);
  const labels = new Map(ins.template.photo_slots.map((s) => [s.key, s.label]));
  const slots = [...new Set(done.map((p) => p.slot))].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib);
  });
  return slots.map((slot) => ({
    slot,
    label: labels.get(slot) ?? null,
    photos: done.filter((p) => p.slot === slot),
  }));
}
