import type { components } from '@/core/api/schema';

/**
 * Pure rules of the handover / return wizard, mirrored from the panel
 * (`frontend/src/features/inspections`): steps, field validation, the
 * completion gate (RT-A17) and the request bodies. No React, no I/O, so
 * `node --test` covers it.
 */

type S = components['schemas'];
export type Inspection = S['Inspection'];
export type InspectionKind = Inspection['kind'];
export type InspectionDamage = S['InspectionDamage'];
export type InspectionPhoto = S['InspectionPhoto'];
export type InspectionDraftRequest = S['InspectionDraftRequest'];
export type InspectionDamageRequest = S['InspectionDamageRequest'];
export type InspectionCompleteRequest = S['InspectionCompleteRequest'];
export type InspectionSignatureRequest = S['InspectionSignatureRequest'];
export type DamageType = InspectionDamage['damage_type'];
export type DamageSeverity = InspectionDamage['severity'];
export type VehicleStatusAfter = NonNullable<InspectionDraftRequest['vehicle_status_after']>;

/** Wizard steps in order, as the panel (handover 8, return 8 with the charges review). */
export const HANDOVER_STEPS = [
  'verify',
  'amounts',
  'readings',
  'damages',
  'photos',
  'review',
  'signature',
  'complete',
] as const;

export const RETURN_STEPS = [
  'verify',
  'readings',
  'damages',
  'photos',
  'charges',
  'review',
  'signature',
  'complete',
] as const;

export type WizardStep = (typeof HANDOVER_STEPS)[number] | (typeof RETURN_STEPS)[number];

export function stepsOf(kind: InspectionKind): readonly WizardStep[] {
  return kind === 'handover' ? HANDOVER_STEPS : RETURN_STEPS;
}

/** A remembered step index, bounded to the wizard (a stale or broken value starts over). */
export function boundStep(step: unknown, kind: InspectionKind): number {
  const n = typeof step === 'number' ? step : Number(step);
  if (!Number.isInteger(n) || n < 0) return 0;
  return Math.min(n, stepsOf(kind).length - 1);
}

export const DAMAGE_TYPES: DamageType[] = ['scratch', 'dent', 'crack', 'broken', 'missing', 'stain', 'other'];
export const SEVERITIES: DamageSeverity[] = ['minor', 'moderate', 'major'];
export const VEHICLE_STATUSES_AFTER: VehicleStatusAfter[] = ['cleaning', 'maintenance', 'preparing', 'available'];

// --- readings ---------------------------------------------------------------

/** Digits only (what the km box keeps of a paste or a typo). */
export function kmDigits(text: string) {
  return text.replace(/\D/g, '').slice(0, 9);
}

export type KmCheck = { value: number | null; problem: null | 'invalid' | 'below_handover' };

/**
 * The km box: empty is "not answered yet", a whole number ≥ 0 is a value; a
 * return below the handover km is flagged (the panel shows the same hint and
 * still lets the API decide).
 */
export function checkKm(text: string, baselineKm?: number | null): KmCheck {
  const t = text.trim();
  if (t === '') return { value: null, problem: null };
  if (!/^\d+$/.test(t)) return { value: null, problem: 'invalid' };
  const n = Number(t);
  if (!Number.isSafeInteger(n) || n < 0) return { value: null, problem: 'invalid' };
  if (baselineKm != null && n < baselineKm) return { value: n, problem: 'below_handover' };
  return { value: n, problem: null };
}

/** The panel's fuel slider: 0-100 in steps of 5. */
export const FUEL_STEP = 5;

export function clampFuel(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, Math.round(v / FUEL_STEP) * FUEL_STEP));
}

/** Return − handover (km driven, fuel difference); null without both values. */
export function delta(now: number | null | undefined, before: number | null | undefined) {
  return now == null || before == null ? null : now - before;
}

/** Equipment items the customer had at the handover and has not now (return). */
export function missingNow(
  checklist: { key: string; label: string }[],
  equipment: Record<string, boolean>,
  baseline?: Record<string, boolean> | null,
) {
  return checklist.filter((i) => equipment[i.key] === false && (!baseline || baseline[i.key] === true));
}

/** "Kalanları mevcut işaretle": every unanswered item as present. */
export function restPresent(checklist: { key: string }[], equipment: Record<string, boolean>) {
  const out: Record<string, boolean> = {};
  for (const i of checklist) if (equipment[i.key] === undefined) out[i.key] = true;
  return out;
}

/** Tapping an item: unanswered → present → missing → present … */
export function toggleItem(value: boolean | undefined) {
  return value === undefined ? true : !value;
}

// --- damages ----------------------------------------------------------------

export type DamageDraft = {
  zone: string;
  pos_x: number | null;
  pos_y: number | null;
  damage_type: DamageType;
  severity: DamageSeverity;
  description: string;
  is_new: boolean;
  disputed: boolean;
};

export function newDamageDraft(
  kind: InspectionKind,
  zone: string,
  pos?: { pos_x: number; pos_y: number } | null,
): DamageDraft {
  return {
    zone,
    pos_x: pos?.pos_x ?? null,
    pos_y: pos?.pos_y ?? null,
    damage_type: 'scratch',
    severity: 'minor',
    description: '',
    // A return finding is new by default (the API's default too).
    is_new: kind === 'return',
    disputed: false,
  };
}

/** `POST …/damages` body; is_new / disputed only mean something on a return. */
export function damagePayload(d: DamageDraft, kind: InspectionKind): InspectionDamageRequest {
  const body: InspectionDamageRequest = {
    zone: d.zone,
    damage_type: d.damage_type,
    severity: d.severity,
    description: d.description.trim(),
    is_new: kind === 'return' ? d.is_new : false,
    disputed: kind === 'return' ? d.disputed : false,
  };
  if (d.pos_x != null && d.pos_y != null) {
    body.pos_x = d.pos_x;
    body.pos_y = d.pos_y;
  }
  return body;
}

export function damageDescriptionOk(text: string) {
  return text.trim().length <= 2000;
}

/** Completed photos of a damage. */
export function damagePhotoCount(photos: InspectionPhoto[], damageUuid: string) {
  return photos.filter((p) => p.damage_uuid === damageUuid).length;
}

// --- photos -----------------------------------------------------------------

export type Slot = { key: string; label: string; required: boolean };

/** The template's slots plus the free "extra" slot (the panel's order). */
export function photoSlots(ins: Pick<Inspection, 'template'>, extraLabel: string): Slot[] {
  return [...ins.template.photo_slots, { key: 'extra', label: extraLabel, required: false }];
}

/** Latest completed photo of a slot, if any. */
export function latestCompleted(photos: InspectionPhoto[], slot: string) {
  const done = photos.filter((p) => p.slot === slot && p.status === 'completed');
  return done[done.length - 1] ?? null;
}

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export function photoTooLarge(size: number | null | undefined) {
  return size != null && size > MAX_PHOTO_BYTES;
}

// --- signature --------------------------------------------------------------

/** The panel's pad needs at least 8 points (the API's minimum) and a name of two letters. */
export const MIN_SIGNATURE_POINTS = 8;

export function signatureReady(points: number, signer: string) {
  return points >= MIN_SIGNATURE_POINTS && signer.trim().length >= 2;
}

/** The rental contract still needs the customer's approval (handover only). */
export function needsContract(ins: Pick<Inspection, 'kind' | 'rental'>) {
  const c = ins.rental.contract;
  return ins.kind === 'handover' && c.required && !c.approved;
}

// --- completion (RT-A17) ----------------------------------------------------

export type CompleteInput = {
  /** Jobs of this form still on the device. */
  queuePending: number;
  noSignatureReason: string;
  contractReason: string;
  canWaiveSignature: boolean;
};

export type CompleteGate = {
  slotsOk: boolean;
  uploadsOk: boolean;
  damagesOk: boolean;
  fieldsOk: boolean;
  signed: boolean;
  reasonOk: boolean;
  permOk: boolean;
  contractOk: boolean;
  needsContractWaiver: boolean;
  /** Everything but the device queue (the wizard waits for it on "Tamamla"). */
  readyButQueue: boolean;
  canComplete: boolean;
};

/** The panel's CompleteStep rules, field for field. */
export function completeGate(ins: Inspection, input: CompleteInput): CompleteGate {
  const r = ins.readiness;
  const handover = ins.kind === 'handover';
  const signed = Boolean(ins.signature);
  const fieldsOk = r.missing_fields.every((f) => f === 'signature');
  const reasonOk = signed || input.noSignatureReason.trim().length >= 3;
  const permOk = signed || !handover || input.canWaiveSignature;
  const waiver = needsContract(ins);
  const contractOk = !waiver || Boolean(ins.signature?.contract_approval) || input.contractReason.trim().length >= 3;
  const readyButQueue = r.photos_ready && fieldsOk && reasonOk && permOk && contractOk;
  return {
    slotsOk: r.missing_slots.length === 0,
    uploadsOk: r.incomplete_photos === 0 && input.queuePending === 0,
    damagesOk: r.damages_without_photo.length === 0,
    fieldsOk,
    signed,
    reasonOk,
    permOk,
    contractOk,
    needsContractWaiver: waiver,
    readyButQueue,
    canComplete: readyButQueue && input.queuePending === 0,
  };
}

/** `POST …/complete` body (empty reasons are left out, like the panel). */
export function completePayload(
  ins: Pick<Inspection, 'signature'>,
  noSignatureReason: string,
  contractReason: string,
): InspectionCompleteRequest {
  const body: InspectionCompleteRequest = {};
  if (!ins.signature && noSignatureReason.trim()) body.no_signature_reason = noSignatureReason.trim();
  if (contractReason.trim()) body.contract_waiver_reason = contractReason.trim();
  return body;
}

// --- progress ---------------------------------------------------------------

export type StepState = 'done' | 'todo';

/** Whether a step's own part of the form is answered (the dots of the progress bar). */
export function stepState(step: WizardStep, ins: Inspection): StepState {
  const r = ins.readiness;
  const v = ins.verification;
  switch (step) {
    case 'verify':
      return v.plate_confirmed && v.vehicle_ok && (ins.kind === 'return' || (v.identity_checked && v.licence_checked))
        ? 'done'
        : 'todo';
    case 'readings':
      return ins.km != null &&
        ins.fuel != null &&
        ins.template.checklist.every((i) => !i.required || ins.equipment[i.key] !== undefined)
        ? 'done'
        : 'todo';
    case 'damages':
      return r.damages_without_photo.length === 0 ? 'done' : 'todo';
    case 'photos':
      return r.missing_slots.length === 0 && r.incomplete_photos === 0 ? 'done' : 'todo';
    case 'review':
      return ins.customer_reviewed_at ? 'done' : 'todo';
    case 'signature':
      return ins.signature ? 'done' : 'todo';
    case 'complete':
      return ins.status !== 'draft' ? 'done' : 'todo';
    default:
      return 'done';
  }
}

// --- contract text ----------------------------------------------------------

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  middot: '·',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  copy: '©',
  reg: '®',
  deg: '°',
  euro: '€',
  times: '×',
};

/**
 * The rendered contract (HTML) as plain text for the phone: block tags
 * become line breaks, scripts / styles go, entities are decoded. The text
 * the customer reads is the same version whose hash the signature binds.
 */
export function htmlToText(html: string) {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|table|section|article|header|footer)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/t[dh]>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
