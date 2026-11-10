/**
 * Pure helpers of the accounting screens (cari, invoices, cash, suppliers):
 * status tones and list filters, mirroring the panel's finance / invoices /
 * suppliers constants. Covered by `lib.test.ts`.
 */
import type { StatusTone } from '../../ui/status-pill';

export const BALANCE_TONES: Record<string, StatusTone> = {
  overdue: 'problem',
  due_soon: 'progress',
  receivable: 'neutral',
  payable: 'neutral',
  closed: 'done',
};

export const INVOICE_TONES: Record<string, StatusTone> = {
  draft: 'neutral',
  queued: 'progress',
  sent: 'progress',
  awaiting_result: 'progress',
  succeeded: 'done',
  failed: 'problem',
  cancelled: 'neutral',
};

export const SUPPLIER_DUE_TONES: Record<string, StatusTone> = {
  overdue: 'problem',
  due_soon: 'progress',
  open: 'neutral',
  later: 'neutral',
  settled: 'done',
};

export const SUPPLIER_INVOICE_TONES: Record<string, StatusTone> = {
  open: 'neutral',
  partially_paid: 'progress',
  paid: 'done',
  void: 'neutral',
};

/** Chip filters of the lists; `all` sends no filter. */
export const ACCOUNT_FILTERS = ['all', 'overdue', 'due_soon', 'receivable', 'payable'] as const;
export const PARTY_FILTERS = ['customer', 'supplier'] as const;
export const INVOICE_FILTERS = ['all', 'needs_action', 'draft', 'succeeded', 'failed', 'cancelled'] as const;
export const SUPPLIER_FILTERS = ['all', 'overdue', 'due_soon', 'open', 'settled'] as const;
export const SUPPLIER_INVOICE_FILTERS = ['all', 'overdue', 'due_soon', 'later', 'settled'] as const;
export const DIRECTION_FILTERS = ['all', 'in', 'out'] as const;

/** Query of a list: search, one chip filter under `key` (none for `all`) and the branch when the endpoint takes one. */
export function listQuery(q: string, key: string, filter: string, branch?: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  const s = q.trim();
  if (s) out.q = s;
  if (filter && filter !== 'all') {
    if (filter === 'needs_action') out.needs_action = 'true';
    else out[key] = filter;
  }
  if (branch) out.branch = branch;
  return out;
}

/** Signed text of a decimal for a direction ("+1250.00" in, "-1250.00" out / credit). */
export function signed(amount: string, negative: boolean) {
  const clean = amount.replace(/^-/, '');
  return negative ? `-${clean}` : clean;
}
