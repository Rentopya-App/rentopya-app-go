/**
 * Pure rules of the finance screens (collections, payment links, unmatched
 * payments, deposits): pill tones, filter values and the request bodies the
 * forms send, with the panel's validation. Free of app imports so it runs
 * under `node --test`.
 */
import type { components } from '@/core/api/schema';

type S = components['schemas'];
export type FinanceCollection = S['FinanceCollection'];
export type SecurityDeposit = S['SecurityDeposit'];
export type PaymentLink = S['PaymentLink'];
export type PaymentWebhookOrphan = S['PaymentWebhookOrphan'];
export type ResolveBody = S['SecurityDepositResolveInput'];
export type RefundBody = S['FinanceCollectionRefundRequest'];

export type Tone = 'neutral' | 'progress' | 'done' | 'problem';

export const COLLECTION_METHODS = ['cash', 'bank_transfer', 'card_pos', 'online', 'other'] as const;
export const COLLECTION_STATUSES = ['recorded', 'partially_refunded', 'refunded', 'void'] as const;
export const DEPOSIT_STATUSES = ['pending', 'held', 'partially_captured', 'released', 'refunded', 'cancelled'] as const;
export const DEPOSIT_METHODS = ['cash', 'pos_preauth', 'online_preauth', 'bank_transfer'] as const;
export const LINK_STATUSES = ['active', 'paid', 'expired', 'cancelled'] as const;
export const ORPHAN_STATUSES = ['unmatched', 'matched'] as const;
export const DEDUCTION_TARGETS = ['charge', 'rent', 'general'] as const;
/** The panel's "held over N days" presets. */
export const HELD_OVER_PRESETS = [3, 7, 14, 30] as const;

export type DeductionTarget = (typeof DEDUCTION_TARGETS)[number];

/** The panel's chip colours on the app's four tones. */
export const COLLECTION_TONE: Record<FinanceCollection['status'], Tone> = {
  recorded: 'done',
  partially_refunded: 'progress',
  refunded: 'neutral',
  void: 'problem',
};

export const ALLOCATION_TONE: Record<FinanceCollection['allocation_status'], Tone> = {
  unallocated: 'progress',
  partially_allocated: 'progress',
  allocated: 'done',
  not_allocatable: 'neutral',
};

export const DEPOSIT_TONE: Record<SecurityDeposit['status'], Tone> = {
  pending: 'progress',
  held: 'neutral',
  partially_captured: 'progress',
  released: 'done',
  refunded: 'done',
  cancelled: 'problem',
};

export const LINK_TONE: Record<PaymentLink['status'], Tone> = {
  active: 'progress',
  paid: 'done',
  expired: 'neutral',
  cancelled: 'problem',
};

export const ORPHAN_TONE: Record<PaymentWebhookOrphan['status'], Tone> = {
  unmatched: 'problem',
  matched: 'done',
};

/** Shared panel catalog keys (`finance`, `deposits`, `payments`, `rentals`). */
export const methodKey = (m: string) => `finance:method.${m}`;
export const collectionStatusKey = (s: string) => `finance:collection_status.${s}`;
export const allocationStatusKey = (s: string) => `finance:allocation_status.${s}`;
export const purposeKey = (p: string) => `finance:purpose.${p}`;
export const itemStatusKey = (s: string) => `finance:item_status.${s}`;
export const refundStatusKey = (s: string) => `finance:refund_status.${s}`;
export const settlementKey = (s: string) => `finance:settlement_status.${s}`;
export const depositStatusKey = (s: string) => `deposits:status.${s}`;
export const depositMethodKey = (m: string) => `deposits:method.${m}`;
export const deductionTargetKey = (t: string) => `deposits:applies_to.${t}`;
export const linkStatusKey = (s: string) => `payments:links.statuses.${s}`;
export const orphanStatusKey = (s: string) => `payments:orphans.statuses.${s}`;
export const chargeKindKey = (k: string) => `rentals:charges.kinds.${k}`;

/** Amount in cents from an API decimal ("1250.50" → 125050); 0 when it is not a number. */
export function cents(amount: string | number | null | undefined) {
  const n = Number(amount ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export const fromCents = (c: number) => (c / 100).toFixed(2);

/** Cash and bank transfer deposits are paid back; pre-authorizations are released. */
export const cashHeld = (method: SecurityDeposit['method']) => method === 'cash' || method === 'bank_transfer';

/** A system cancel reason (`system:*`) as its catalog key, else the text itself. */
export function cancelReasonText(reason: string, t: (k: string) => string) {
  if (reason === 'system:preauth_failed') return t('deposits:cancel_reason.preauth_failed');
  if (reason === 'system:preauth_declined') return t('deposits:cancel_reason.preauth_declined');
  return reason;
}

/** Refund-type reasons the API stores as `system:*`; anything else is shown as typed. */
export function reasonText(reason: string) {
  return reason.startsWith('system:') ? '' : reason;
}

// ---------------------------------------------------------------- collections

export type CollectionFilters = { q: string; method: string | null; status: string | null; branch: string | null };

/** `GET /v1/tenant/finance/collections` query of the list's filters (newest first, like the panel). */
export function collectionQuery(f: CollectionFilters) {
  return {
    sort: '-collection_date',
    ...(f.q.trim() ? { q: f.q.trim() } : {}),
    ...(f.method ? { method: f.method } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.branch ? { branch: f.branch } : {}),
  };
}

export type RefundForm = { amount: string; reason: string; cashAccountUuid: string };
export type RefundBuild =
  | { ok: true; body: RefundBody }
  | { ok: false; error: 'amount' | 'too_much' | 'reason' | 'cash_account' };

/**
 * `POST /v1/tenant/finance/collections/{uuid}/refund`: a positive amount up
 * to what is refundable and a 3-500 character reason. Manual collections name
 * the account the money leaves; online ones are refunded on the provider.
 */
export function refundPayload(
  c: Pick<FinanceCollection, 'refundable' | 'payment_uuid'>,
  f: RefundForm,
  parseAmount: (text: string) => string | null,
): RefundBuild {
  const amount = parseAmount(f.amount);
  if (!amount) return { ok: false, error: 'amount' };
  if (cents(amount) > cents(c.refundable)) return { ok: false, error: 'too_much' };
  const reason = f.reason.trim();
  if (reason.length < 3 || reason.length > 500) return { ok: false, error: 'reason' };
  const online = !!c.payment_uuid;
  if (!online && !f.cashAccountUuid) return { ok: false, error: 'cash_account' };
  return {
    ok: true,
    body: { amount, reason, ...(online ? {} : { cash_account_uuid: f.cashAccountUuid }) },
  };
}

// ---------------------------------------------------------------- payment links

/** A link can be cancelled while the customer can still pay with it. */
export const linkCancellable = (l: Pick<PaymentLink, 'status'>) => l.status === 'active';

// ---------------------------------------------------------------- unmatched payments

export type MatchBuild =
  | { ok: true; body: { reservation_uuid: string; note: string } }
  | { ok: false; error: 'reservation' | 'note' };

/** `POST /v1/tenant/payments/orphans/{uuid}/match`: a reservation and a 3-500 character note. */
export function matchPayload(reservationUuid: string | null, note: string): MatchBuild {
  if (!reservationUuid) return { ok: false, error: 'reservation' };
  const n = note.trim();
  if (n.length < 3 || n.length > 500) return { ok: false, error: 'note' };
  return { ok: true, body: { reservation_uuid: reservationUuid, note: n } };
}

// ---------------------------------------------------------------- deposits

export type DepositFilters = { status: string | null; branch: string | null; heldOver: number | null; rental?: string };

export function depositQuery(f: DepositFilters) {
  return {
    sort: '-created_at',
    ...(f.status ? { status: f.status } : {}),
    ...(f.branch ? { branch: f.branch } : {}),
    ...(f.heldOver ? { held_over_days: f.heldOver } : {}),
    ...(f.rental ? { rental: f.rental } : {}),
  };
}

export type DeductionLine = {
  key: string;
  amount: string;
  appliesTo: DeductionTarget;
  chargeUuid: string;
  reason: string;
};

export type ResolveForm = {
  mode: 'release' | 'deduct';
  lines: DeductionLine[];
  refundAccountUuid: string;
  captureAccountUuid: string;
  note: string;
};

export type LineError = 'amount' | 'reason' | 'charge';
export type ResolveBuild =
  | { ok: true; body: ResolveBody }
  | { ok: false; error: 'no_lines' | 'exceeds' | 'lines'; lines: Record<string, LineError> };

export function emptyLine(key: string): DeductionLine {
  return { key, amount: '', appliesTo: 'charge', chargeUuid: '', reason: '' };
}

/** Deducted total and what goes back (paid back / released) in cents. */
export function resolveTotals(
  deposit: Pick<SecurityDeposit, 'amount'>,
  f: Pick<ResolveForm, 'mode' | 'lines'>,
  parseAmount: (text: string) => string | null,
) {
  const deducted = f.mode === 'deduct' ? f.lines.reduce((sum, l) => sum + cents(parseAmount(l.amount) ?? 0), 0) : 0;
  const total = cents(deposit.amount);
  return { total, deducted, remainder: total - deducted };
}

/**
 * `POST /v1/tenant/finance/deposits/{uuid}/resolve` with the panel's rules:
 * releasing sends no deductions; deducting needs at least one line, each with
 * a positive amount and a 3-500 character reason, a charge when it is booked
 * on a charge, and the lines may not exceed the deposit. The remainder goes
 * back to the till / bank (cash, transfer) or stays released (pre-auth); a
 * POS capture may name the bank it settles to. One idempotency key per form.
 */
export function resolvePayload(
  deposit: Pick<SecurityDeposit, 'amount' | 'method'>,
  f: ResolveForm,
  idempotencyKey: string,
  parseAmount: (text: string) => string | null,
): ResolveBuild {
  const deduct = f.mode === 'deduct';
  const lines: Record<string, LineError> = {};
  if (deduct) {
    if (f.lines.length === 0) return { ok: false, error: 'no_lines', lines };
    for (const l of f.lines) {
      const reason = l.reason.trim();
      if (!parseAmount(l.amount)) lines[l.key] = 'amount';
      else if (l.appliesTo === 'charge' && !l.chargeUuid) lines[l.key] = 'charge';
      else if (reason.length < 3 || reason.length > 500) lines[l.key] = 'reason';
    }
    if (Object.keys(lines).length) return { ok: false, error: 'lines', lines };
    if (resolveTotals(deposit, f, parseAmount).remainder < 0) return { ok: false, error: 'exceeds', lines };
  }
  const note = f.note.trim();
  const body: ResolveBody = {
    idempotency_key: idempotencyKey,
    deductions: deduct
      ? f.lines.map((l) => ({
          amount: parseAmount(l.amount) as string,
          applies_to: l.appliesTo,
          reason: l.reason.trim(),
          ...(l.chargeUuid ? { rental_charge_uuid: l.chargeUuid } : {}),
        }))
      : [],
  };
  if (note) body.note = note;
  if (cashHeld(deposit.method) && f.refundAccountUuid) body.refund_cash_account_uuid = f.refundAccountUuid;
  if (deposit.method === 'pos_preauth' && deduct && f.captureAccountUuid)
    body.capture_cash_account_uuid = f.captureAccountUuid;
  return { ok: true, body };
}

/** Approved, positive, not reversed charges a deduction may be booked on (the panel's filter). */
export function deductibleCharges<
  T extends { status: string; amount: string; reversed?: boolean; reversal_of_uuid?: string | null },
>(charges: T[]) {
  return charges.filter((c) => c.status === 'approved' && !c.reversed && !c.reversal_of_uuid && Number(c.amount) > 0);
}
