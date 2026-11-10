/**
 * Field task rules shared by the list and the detail (the panel's
 * `features/field-tasks/lib`). Free of app imports so it runs under
 * `node --test`.
 */
import type { components } from '../../core/api/schema';
import { zonedIso } from '../../core/zoned.ts';

export type FieldTask = components['schemas']['FieldTask'];
export type FieldTaskEvent = components['schemas']['FieldTaskEvent'];
export type FieldTaskStatus = FieldTask['status'];
export type FieldTaskAction = FieldTask['actions'][number];

/** Statuses still to do (the panel's `FIELD_TASK_LIVE_STATUSES`). */
export const LIVE_STATUSES: readonly FieldTaskStatus[] = ['planned', 'assigned', 'en_route', 'issue_reported'];

/** The list's status filter: open tasks (default), closed ones, or every task. */
export const STATUS_FILTERS = ['live', 'completed', 'cancelled', 'all'] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export function isLive(status: FieldTaskStatus) {
  return LIVE_STATUSES.includes(status);
}

/** Late: still to do and its planned start passed. */
export function isLate(task: Pick<FieldTask, 'status' | 'due_at'>, now = new Date()) {
  return isLive(task.status) && new Date(task.due_at).getTime() < now.getTime();
}

export function canDo(task: Pick<FieldTask, 'actions'>, action: FieldTaskAction) {
  return task.actions.includes(action);
}

/**
 * `GET /v1/tenant/field-tasks/mine` filters for a calendar day (in the
 * organization zone) and a status filter. Open tasks of today include the
 * late ones from earlier days, like the panel's "Görevlerim".
 */
export function mineQuery(day: string, today: string, status: StatusFilter, timeZone: string | null | undefined) {
  const from = zonedIso(day, '00:00', timeZone);
  const to = zonedIso(nextDay(day), '00:00', timeZone);
  const includeLate = status === 'live' && day === today;
  return {
    sort: 'due_at',
    status: status === 'live' ? LIVE_STATUSES.join(',') : status === 'all' ? undefined : status,
    due_from: includeLate ? undefined : from,
    due_to: to,
  };
}

function nextDay(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Where staff go: the address, the service point or the branch. */
export function placeText(task: Pick<FieldTask, 'location' | 'branch'>): string {
  const loc = task.location;
  if (loc.kind === 'address') return [loc.address, loc.district, loc.city].filter(Boolean).join(', ');
  if (loc.kind === 'point' && loc.point) return `${loc.point.name} · ${task.branch.code}`;
  return `${task.branch.code} · ${task.branch.name}`;
}

/**
 * Directions in the phone's own maps app: Apple Maps on iOS, a `geo:` intent
 * on Android (Google Maps or whichever app the user picked), a Google Maps
 * search link elsewhere. Coordinates when the API has them, else the text.
 */
export function mapsUrl(task: Pick<FieldTask, 'location' | 'branch'>, os: string): string | null {
  const loc = task.location;
  const coords = loc.latitude != null && loc.longitude != null ? `${loc.latitude},${loc.longitude}` : null;
  const text = loc.kind === 'address' ? placeText(task) : loc.kind === 'point' && loc.point ? loc.point.name : null;
  if (!coords && !text) return null;
  const label = encodeURIComponent(text ?? '');
  if (os === 'ios') {
    return coords
      ? `https://maps.apple.com/?ll=${coords}${text ? `&q=${label}` : ''}`
      : `https://maps.apple.com/?q=${label}`;
  }
  if (os === 'android') {
    return coords ? `geo:${coords}?q=${coords}${text ? `(${label})` : ''}` : `geo:0,0?q=${label}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${coords ?? label}`;
}

/** `tel:` link of a contact phone (digits and a leading +). */
export function telUrl(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function personName(person: { name: string; surname: string; email: string } | null | undefined) {
  if (!person) return '';
  return `${person.name} ${person.surname}`.trim() || person.email;
}

/** App route of the rental's handover / return form a task continues in, or null. */
export function inspectionPath(task: Pick<FieldTask, 'inspection' | 'rental'>): string | null {
  if (!task.rental || !task.inspection) return null;
  return `/field/${task.inspection}/${task.rental.uuid}`;
}

/** The one main step under the thumb: start (or resume), the inspection form, or complete. */
export function primaryStep(task: Pick<FieldTask, 'actions' | 'inspection' | 'rental'>) {
  if (canDo(task, 'start')) return 'start' as const;
  if (canDo(task, 'inspection') && inspectionPath(task)) return 'inspection' as const;
  if (canDo(task, 'complete')) return 'complete' as const;
  return null;
}

export type StatusTone = 'neutral' | 'progress' | 'done' | 'problem';

export const STATUS_TONES: Record<FieldTaskStatus, StatusTone> = {
  planned: 'neutral',
  assigned: 'neutral',
  en_route: 'progress',
  issue_reported: 'problem',
  completed: 'done',
  cancelled: 'neutral',
};

/** i18n key of the task type; a handover / return at a point or address reads as delivery / collection. */
export function typeKey(task: Pick<FieldTask, 'task_type' | 'delivery'>) {
  if (task.delivery && task.task_type === 'handover') return 'types.delivery';
  if (task.delivery && task.task_type === 'return') return 'types.collection';
  return `types.${task.task_type}`;
}

/** Known 409 / 400 detail codes of the field task API (translated under `problems.*`). */
export const PROBLEM_CODES = [
  'invalid_transition',
  'task_closed',
  'record_handover',
  'record_return',
  'concurrent',
  'transfer_missing',
  'vehicle_not_at_origin',
  'vehicle_busy',
  'transfer_overlap',
  'block_overlap',
] as const;

/** The `problems.*` key of a failed step's first known detail code, else null. */
export function problemKey(details: readonly { code?: string }[] | undefined | null) {
  for (const d of details ?? []) {
    if (d.code && (PROBLEM_CODES as readonly string[]).includes(d.code)) return `problems.${d.code}`;
  }
  return null;
}
