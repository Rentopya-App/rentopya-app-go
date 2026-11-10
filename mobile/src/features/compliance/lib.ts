/**
 * KABİS notifications and HGS/OGS toll passes: the rules the list, detail
 * and decision screens share, mirroring the panel's `features/kabis` and
 * `features/tolls` (status order and tones, missing-field wording, the
 * problem text of a refused action, which decisions a pass offers). Free
 * of app imports so it runs under `node --test`.
 */
import type { components } from '../../core/api/schema';

type S = components['schemas'];

export type KabisNotification = S['KabisNotification'];
export type KabisDetail = S['KabisNotificationDetail'];
export type KabisStatus = S['KabisNotificationStatus'];
export type KabisEvent = KabisNotification['event'];
export type KabisResolution = 'mark-manual' | 'reconcile';
export type TollPass = S['TollPass'];
export type TollPassDetail = S['TollPassDetail'];
export type TollCandidate = S['TollCandidate'];
export type TollStatus = TollPass['status'];
export type TollDecision = 'unassign' | 'ignore' | 'rematch';

export type Tone = 'neutral' | 'progress' | 'done' | 'problem';

/** A translate function (i18next `t` with the namespace in the key). */
export type T = (key: string, params?: Record<string, string | number>) => string;

// ---------------------------------------------------------------- KABİS

/** Filter order of the panel screen: what needs a person first. */
export const KABIS_STATUSES: KabisStatus[] = [
  'blocked',
  'waiting_dependency',
  'needs_verification',
  'failed',
  'pending',
  'submitted',
  'succeeded',
  'reported_manually',
  'reconciled',
];

/** The only states in which the authority has the record. */
export const KABIS_OFFICIAL: KabisStatus[] = ['succeeded', 'reported_manually', 'reconciled'];

export const KABIS_TONES: Record<KabisStatus, Tone> = {
  blocked: 'problem',
  waiting_dependency: 'progress',
  pending: 'progress',
  processing: 'progress',
  submitted: 'progress',
  needs_verification: 'problem',
  failed: 'problem',
  succeeded: 'done',
  reported_manually: 'done',
  reconciled: 'done',
  ignored: 'neutral',
};

/** A state shown as an error (red alert on the detail). */
export function kabisAlarming(status: KabisStatus) {
  return status === 'blocked' || status === 'failed' || status === 'needs_verification';
}

export type KabisFilter = 'needs_action' | 'all' | KabisStatus;

/** List query of `GET /v1/tenant/kabis-notifications` (newest event first). */
export function kabisListQuery(f: { q: string; filter: KabisFilter; rental?: string | null }) {
  const out: { sort: string; q?: string; status?: string; needs_action?: string; rental?: string } = {
    sort: '-occurred_at',
  };
  const q = f.q.trim();
  if (q) out.q = q;
  if (f.filter === 'needs_action') out.needs_action = 'true';
  else if (f.filter !== 'all') out.status = f.filter;
  if (f.rental) out.rental = f.rental;
  return out;
}

/** "Kiralama başlangıcı", or "Düzeltme #2" for a correction. */
export function kabisEventText(t: T, event: KabisEvent, sequence?: number) {
  const label = t(`kabis:events.${event}`);
  return event === 'correction' && sequence ? `${label} #${sequence}` : label;
}

const FIELD_KEYS = new Set([
  'plate',
  'name',
  'city',
  'first_name',
  'last_name',
  'company_title',
  'identity_number',
  'nationality',
  'licence_number',
  'record',
  'drivers',
]);
const SCOPE_KEYS: Record<string, string> = {
  vehicle: 'kabis:missing_scope.vehicle',
  place: 'kabis:missing_scope.place',
  renter: 'kabis:missing_scope.renter',
};

/** "drivers.0.identity_number" → "1. sürücü: T.C. kimlik / pasaport no" (the panel's `missingFieldText`). */
export function missingFieldText(t: T, path: string) {
  const parts = path.split('.');
  const last = parts[parts.length - 1] ?? path;
  const field = FIELD_KEYS.has(last) ? t(`kabis:missing.${last}`) : last;
  if (parts[0] === 'drivers' && parts.length === 3) {
    return `${t('kabis:missing_scope.driver', { n: Number(parts[1]) + 1 })}: ${field}`;
  }
  if (parts.length === 2 && SCOPE_KEYS[parts[0]]) return `${t(SCOPE_KEYS[parts[0]])}: ${field}`;
  return field;
}

/** Text of the hold reason of a waiting notification ('' when none or unknown). */
export function holdText(t: T, reason: string) {
  return ['no_account', 'adapter_unverified', 'adapter_unavailable'].includes(reason)
    ? t(`kabis:holds.${reason}`)
    : reason;
}

/** The toast after "Yeniden dene": what the server did. */
export function retryToastKey(action: string | undefined) {
  return ['revalidated', 'already_done', 'in_progress', 'resubmitted'].includes(action ?? '')
    ? `kabis:toast.${action}`
    : 'kabis:toast.retried';
}

type ErrorLike = { code?: string; details?: { field?: string; message?: string; code?: string }[]; message?: string };

const KABIS_PROBLEMS: Record<string, string> = {
  KABIS_DEPENDENCY_PENDING: 'kabis:problems.dependency_pending',
  KABIS_UNVERIFIED: 'kabis:problems.unverified',
  KABIS_BUSY: 'kabis:problems.busy',
  KABIS_NOT_RETRYABLE: 'kabis:problems.not_retryable',
  KABIS_NOT_RESOLVABLE: 'kabis:problems.not_resolvable',
};

/** Text of a refused KABİS action (the panel's `kabisProblemText`); null → the generic API error text. */
export function kabisProblemText(t: T, e: ErrorLike | null | undefined): string | null {
  if (!e?.code) return null;
  if (e.code === 'KABIS_DATA_MISSING') {
    const fields = (e.details ?? [])
      .map((d) => (d.field ? missingFieldText(t, d.field) : (d.message ?? '')))
      .join(', ');
    return t('kabis:problems.data_missing', { fields });
  }
  const key = KABIS_PROBLEMS[e.code];
  return key ? t(key) : null;
}

/** Reason 3–500 characters, official reference 1–120 (the panel's resolve form). */
export function resolveValid(reason: string, reference: string) {
  const r = reason.trim().length;
  const ref = reference.trim().length;
  return { reason: r >= 3 && r <= 500, reference: ref >= 1 && ref <= 120 };
}

// ---------------------------------------------------------------- tolls

export const TOLL_STATUSES: TollStatus[] = ['needs_review', 'unmatched', 'charged', 'matched', 'ignored'];

/** The review queue (unmatched + needs review). */
export const REVIEW_STATUSES: TollStatus[] = ['needs_review', 'unmatched'];

export const TOLL_TONES: Record<TollStatus, Tone> = {
  unmatched: 'progress',
  needs_review: 'problem',
  matched: 'done',
  charged: 'done',
  ignored: 'neutral',
};

export type TollFilter = 'all' | TollStatus;

/**
 * List query of `GET /v1/tenant/toll-passes`: the full list newest first,
 * or the review queue (unmatched + needs review) oldest first.
 */
export function tollListQuery(f: { q: string; filter: TollFilter; review: boolean }) {
  const out: { sort: string; q?: string; status?: string } = { sort: f.review ? 'passed_at' : '-passed_at' };
  const q = f.q.trim();
  if (q) out.q = q;
  if (f.filter !== 'all') out.status = f.filter;
  else if (f.review) out.status = REVIEW_STATUSES.join(',');
  return out;
}

/** Station, or "entry → exit" for a motorway route. */
export function stationText(pass: Pick<TollPass, 'station' | 'exit_station'>) {
  return pass.exit_station ? `${pass.station} → ${pass.exit_station}` : pass.station;
}

/**
 * Decisions on a pass for a member with `tenant.tolls.review` (the panel's
 * detail header): assign (or reassign when linked), unassign when linked,
 * ignore unless ignored, rematch always.
 */
export function tollActions(pass: Pick<TollPass, 'status' | 'rental'>, canReview: boolean) {
  if (!canReview) return [] as ('assign' | 'reassign' | TollDecision)[];
  const out: ('assign' | 'reassign' | TollDecision)[] = [pass.rental ? 'reassign' : 'assign'];
  if (pass.rental) out.push('unassign');
  if (pass.status !== 'ignored') out.push('ignore');
  out.push('rematch');
  return out;
}

export function isTollDecision(v: unknown): v is TollDecision {
  return v === 'unassign' || v === 'ignore' || v === 'rematch';
}

/** Text of a refused toll decision (the panel's `tollProblemText`); null → the generic API error text. */
export function tollProblemText(t: T, e: (ErrorLike & { status?: number }) | null | undefined): string | null {
  const d = e?.details?.[0];
  if (!d) return null;
  if (d.code === 'not_found' && d.field === 'rental_uuid') return t('tolls:problems.rental_not_found');
  if (d.code === 'invalid_state' && d.field === 'rental_uuid') return t('tolls:problems.rental_not_started');
  if (d.code === 'already_ignored') return t('tolls:problems.already_ignored');
  return null;
}

/** Candidates that contain the pass first, then by planned pick-up. */
export function sortCandidates(items: TollCandidate[]) {
  return [...items].sort(
    (a, b) =>
      Number(b.contains_pass) - Number(a.contains_pass) || a.planned_pickup_at.localeCompare(b.planned_pickup_at),
  );
}
