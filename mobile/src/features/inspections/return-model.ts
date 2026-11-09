import type { components } from '@/core/api/schema';

import type { Inspection } from './model';

/**
 * Pure rules of the return's charges and its follow-up, mirrored from the
 * panel: the charges step (`charges-step.tsx`), the review of a disputed or
 * unsigned return (`inspection-detail-page.tsx`) and the rental's charge
 * decisions / return check (`rental-detail-page.tsx`, `rental-dialogs.tsx`).
 */

type S = components['schemas'];
export type ChargePreview = S['InspectionChargePreview'];
export type ChargeLine = S['InspectionChargeLine'];
export type ChargeOverride = S['InspectionChargeOverride'];
export type RentalCharge = S['RentalCharge'];
export type VehicleStatus = NonNullable<S['InspectionReviewRequest']['vehicle_status']>;

// --- the charges step -------------------------------------------------------

/** What a line is: `kind:ref` keys point at a damage or an equipment item. */
export type LineSubject =
  | { kind: 'override'; text: string }
  | { kind: 'damage'; zone: string; description: string }
  | { kind: 'equipment'; label: string }
  | { kind: 'policy'; key: 'late_return' | 'mileage' | 'fuel' | 'other' }
  | { kind: 'raw'; text: string };

/** The panel's `lineText`: the staff reason when given, else what the line is. */
export function lineSubject(line: ChargeLine, ins: Pick<Inspection, 'charge_overrides' | 'damages' | 'template'>): LineSubject {
  const override = ins.charge_overrides.find((o) => o.key === line.key);
  if (override?.reason) return { kind: 'override', text: override.reason };
  const [kind, ref] = line.key.split(':');
  if (kind === 'damage') {
    const d = ins.damages.find((x) => x.uuid === ref);
    return d ? { kind: 'damage', zone: d.zone, description: d.description } : { kind: 'raw', text: line.reason };
  }
  if (kind === 'equipment') {
    const item = ins.template.checklist.find((i) => i.key === ref);
    return { kind: 'equipment', label: item?.label ?? ref ?? '' };
  }
  if (kind === 'late_return' || kind === 'mileage' || kind === 'fuel') return { kind: 'policy', key: kind };
  return { kind: 'policy', key: 'other' };
}

/** The panel's amount box: digits with up to two decimals, comma or dot. */
export function amountOk(text: string) {
  return /^\d+([.,]\d{1,2})?$/.test(text.trim());
}

/** Editing a line: computed (policy) lines need `price.override`; a draft only. */
export function canEditLine(line: Pick<ChargeLine, 'source'>, readOnly: boolean, canOverride: boolean) {
  return !readOnly && (line.source !== 'policy' || canOverride);
}

/** Saving an edit: an amount, and a reason of 3+ characters for a computed line. */
export function editReady(line: Pick<ChargeLine, 'source'>, amount: string, reason: string) {
  return amountOk(amount) && (line.source !== 'policy' || reason.trim().length >= 3);
}

/** `charge_overrides` after an edit: the line's entry replaced, the others kept. */
export function overridesWith(list: ChargeOverride[], key: string, amount: string, reason: string): ChargeOverride[] {
  return [...list.filter((o) => o.key !== key), { key, amount: amount.trim().replace(',', '.'), reason: reason.trim() }];
}

/** Total of the lines in kuruş-safe arithmetic (the API's `total` is authoritative; this checks a local edit). */
export function linesTotal(lines: Pick<ChargeLine, 'amount'>[]) {
  const cents = lines.reduce((n, l) => n + Math.round(Number(l.amount) * 100), 0);
  return (cents / 100).toFixed(2);
}

/** The computed amount is shown under a changed one. */
export function showComputed(line: Pick<ChargeLine, 'amount' | 'computed'>) {
  return line.computed != null && Number(line.computed) !== Number(line.amount);
}

/** Return − handover km and fuel of the summary line. */
export function readingsDelta(ins: Pick<Inspection, 'km' | 'fuel' | 'baseline'>) {
  const b = ins.baseline;
  return {
    km: ins.km != null && b?.km != null ? ins.km - b.km : null,
    fuel: ins.fuel != null && b?.fuel != null ? ins.fuel - b.fuel : null,
  };
}

// --- after the return -------------------------------------------------------

/** A return that waits for the review (unsigned or disputed). */
export function reviewPending(ins: Pick<Inspection, 'status' | 'review_status'>) {
  return ins.status === 'finalized' && ins.review_status === 'pending';
}

/** The review dialog: `rentals.close`, a note of 3+, and `signature.waive` for an unsigned return. */
export function reviewGate(
  ins: Pick<Inspection, 'signature_status'>,
  note: string,
  perms: { close: boolean; waive: boolean },
) {
  const unsigned = ins.signature_status !== 'signed';
  return {
    unsigned,
    waiveMissing: unsigned && !perms.waive,
    ok: perms.close && note.trim().length >= 3 && (!unsigned || perms.waive),
  };
}

export function reviewPayload(note: string, vehicleStatus: VehicleStatus): S['InspectionReviewRequest'] {
  return { note: note.trim(), vehicle_status: vehicleStatus };
}

export type ChargePerms = { close: boolean; damage: boolean };

/** The panel's rule: a disputed charge only by the damage approver; otherwise close, or damage for a damage charge. */
export function canApproveCharge(c: Pick<RentalCharge, 'status' | 'disputed' | 'kind'>, p: ChargePerms) {
  if (c.status !== 'proposed') return false;
  return c.disputed ? p.damage : p.close || (c.kind === 'damage' && p.damage);
}

export function canWaiveCharge(c: Pick<RentalCharge, 'status'>, p: ChargePerms) {
  return c.status === 'proposed' && p.close;
}

/** A note is required to waive, and to approve a disputed charge. */
export function decisionNoteRequired(decision: 'approve' | 'waive', c: Pick<RentalCharge, 'disputed'>) {
  return decision === 'waive' || c.disputed;
}

export function decisionReady(decision: 'approve' | 'waive', c: Pick<RentalCharge, 'disputed'>, note: string) {
  return !decisionNoteRequired(decision, c) || note.trim().length >= 3;
}

/** Charges the return check lists (tolls have their own screen in the panel). */
export function returnCharges(charges: RentalCharge[]) {
  return charges.filter((c) => c.source !== 'toll');
}

/** "İade kontrolünü tamamla": the rental waits in return_check and no review is open. */
export function canCompleteReturn(
  rentalStatus: string | undefined,
  ins: Pick<Inspection, 'review_status'>,
  close: boolean,
) {
  return close && rentalStatus === 'return_check' && ins.review_status !== 'pending';
}

export function completeReturnPayload(
  vehicleStatus: VehicleStatus,
  note: string,
  depositTask: boolean,
): S['RentalCompleteReturnRequest'] {
  return { vehicle_status: vehicleStatus, note: note.trim() || undefined, deposit_task: depositTask || undefined };
}
