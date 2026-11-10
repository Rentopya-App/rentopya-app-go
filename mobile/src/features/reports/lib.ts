/**
 * Pure helpers of the report screens (no React, no native modules), shared
 * with `accounting/` and covered by `lib.test.ts`. Mirrors the panel's
 * `features/profitability/lib/period.ts` and `features/reports/lib/format.ts`.
 */

export const REPORT_TIME_ZONE = 'Europe/Istanbul';

/** Period presets of the panel's report filters (custom days stay on the panel). */
export const PERIODS = ['this_month', 'last_month', 'last_3_months', 'last_12_months', 'this_year'] as const;
export type Period = (typeof PERIODS)[number];

/** Today as `YYYY-MM-DD` on the Istanbul calendar (report days are Istanbul days). */
export function istanbulToday(now: Date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function iso(y: number, m: number, d: number) {
  // Date.UTC normalises month / day overflow (month 0-based).
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
}

/** First and last day of a preset, like the panel's `presetRange`. */
export function periodRange(period: Period, today = istanbulToday()) {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1;
  switch (period) {
    case 'last_month':
      return { from: iso(y, m - 1, 1), to: iso(y, m, 0) };
    case 'last_3_months':
      return { from: iso(y, m - 2, 1), to: today };
    case 'last_12_months':
      return { from: iso(y, m - 11, 1), to: today };
    case 'this_year':
      return { from: iso(y, 0, 1), to: today };
    default:
      return { from: iso(y, m, 1), to: today };
  }
}

/** Query of a report: the period, the branch filter (when one is picked) and the report's own keys. */
export function reportQuery(
  period: Period,
  branch: string | null | undefined,
  extra: Record<string, string | undefined> = {},
  today?: string,
) {
  const q: Record<string, string> = { ...periodRange(period, today) };
  if (branch) q.branch = branch;
  for (const [k, v] of Object.entries(extra)) if (v) q[k] = v;
  return q;
}

/** Report percentages come as 0–100 numbers: "%12,5" (tr) / "12.5%" (en); "—" when there is none. */
export function percentText(v: number | null | undefined, lang: string) {
  if (v == null || !Number.isFinite(v)) return '—';
  const n = new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'tr-TR', { maximumFractionDigits: 1 }).format(v);
  return lang === 'en' ? `${n}%` : `%${n}`;
}

/** "2026-03" → "Mar 26" / "Mar 26" in the app language. */
export function monthLabel(month: string, lang: string) {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'tr-TR', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Decimal API string → number, for sorting and bar widths only (never money maths). */
export function num(v: string | null | undefined) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Share of `part` in `total` as 0–1 for a bar; 0 when the total is not positive. */
export function share(part: string | number, total: string | number) {
  const p = typeof part === 'number' ? part : num(part);
  const t = typeof total === 'number' ? total : num(total);
  if (!(t > 0) || !(p > 0)) return 0;
  return Math.min(1, p / t);
}

export const KNOWN_CHANNELS = ['web', 'widget', 'api', 'branch', 'yolcu360', 'obilet'] as const;

/** i18n key of a sales channel (`reports:channel.*`), or null for a channel added later (show its code). */
export function channelKey(code: string) {
  return (KNOWN_CHANNELS as readonly string[]).includes(code) ? `reports:channel.${code}` : null;
}

const INCOME_CODES = new Set([
  'rent',
  'other',
  'charge.late_return',
  'charge.early_return',
  'charge.damage',
  'charge.fuel',
  'charge.mileage',
  'charge.equipment',
  'charge.toll',
  'charge.toll_fee',
  'charge.other',
]);

/** i18n key of an income category code (`reports:income_category.*`), or null. */
export function incomeCategoryKey(code: string) {
  return INCOME_CODES.has(code) ? `reports:income_category.${code}` : null;
}

export const AGING_BUCKETS = ['current', 'days_1_30', 'days_31_60', 'days_61_90', 'days_90_plus'] as const;

/** Value columns of the finance reports (`/v1/tenant/finance/reports/*`), like the panel. */
export const FINANCE_REPORTS = {
  expenses: {
    groups: ['category', 'branch', 'vehicle', 'month'],
    values: ['net_amount', 'vat_amount', 'total_amount'],
  },
  'cash-flow': {
    groups: ['account', 'branch', 'month'],
    values: ['total_in', 'total_out', 'collections', 'expenses', 'refunds', 'supplier_payments'],
  },
} as const;
export type FinanceReportKind = keyof typeof FINANCE_REPORTS;

/** Rows by a money figure, largest first (stable for equal values). */
export function byAmountDesc<T>(rows: readonly T[], pick: (r: T) => string | number) {
  return rows
    .map((r, i) => ({ r, i, v: num(String(pick(r))) }))
    .sort((a, b) => b.v - a.v || a.i - b.i)
    .map((x) => x.r);
}
