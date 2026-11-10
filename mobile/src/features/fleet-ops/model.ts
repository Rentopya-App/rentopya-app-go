/**
 * Filters, validation and request bodies of the fleet operations screens
 * (fleet alerts, maintenance, expenses), the same rules as the panel's
 * zod schemas. Errors are i18n keys of the shared panel catalogs.
 * Free of app imports so it runs under `node --test`.
 */
import { parseAmount } from '../../core/money.ts';

export type Errors = Record<string, string>;

// --- fleet alerts ------------------------------------------------------------

export const ALERT_KINDS = ['document', 'maintenance'] as const;
export const ALERT_STATES = ['overdue', 'expiring'] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];
export type AlertState = (typeof ALERT_STATES)[number];

type AlertLike = { kind: string; state: string; vehicle: { plate: string; current_branch: string } };

/** "34 ABC 123", "34-abc-123" and "34abc123" are the same plate. */
export function plateKey(s: string) {
  return s.toUpperCase().replace(/[\s-]/g, '');
}

/**
 * The alerts endpoint has no filters (it answers the member's branch scope
 * in one list); kind, state, plate and the menu's branch filter (by the
 * vehicle's current branch name, the only branch the alert carries) apply
 * on the phone.
 */
export function filterAlerts<T extends AlertLike>(
  items: readonly T[],
  f: { kind?: string | null; state?: string | null; q?: string; branchName?: string | null },
): T[] {
  const q = plateKey(f.q ?? '');
  return items.filter(
    (a) =>
      (!f.kind || a.kind === f.kind) &&
      (!f.state || a.state === f.state) &&
      (!q || plateKey(a.vehicle.plate).includes(q)) &&
      (!f.branchName || a.vehicle.current_branch === f.branchName),
  );
}

export function alertCounts(items: readonly AlertLike[]) {
  let overdue = 0;
  let expiring = 0;
  for (const a of items) {
    if (a.state === 'overdue') overdue++;
    else expiring++;
  }
  return { overdue, expiring };
}

// --- maintenance -------------------------------------------------------------

export const MAINTENANCE_TYPES = ['periodic', 'tire', 'brake', 'oil', 'repair', 'other'] as const;
export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number];
export type MaintenanceKind = 'planned' | 'done';

export type MaintenanceValues = {
  kind: MaintenanceKind;
  maintenance_type: MaintenanceType;
  planned_date: string;
  planned_km: string;
  done_date: string;
  done_km: string;
  service_provider: string;
  cost: string;
  note: string;
};

const MONEY = /^\d{1,12}([.,]\d{1,2})?$/;
const MAX_KM = 5_000_000;

function optionalKm(v: string) {
  const s = v.trim();
  if (s === '') return true;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 && n <= MAX_KM;
}

const kmOrNull = (v: string) => (v.trim() === '' ? null : Number(v.trim()));

export function maintenanceDefaults(kind: MaintenanceKind, today: string): MaintenanceValues {
  return {
    kind,
    maintenance_type: 'periodic',
    planned_date: '',
    planned_km: '',
    done_date: kind === 'done' ? today : '',
    done_km: '',
    service_provider: '',
    cost: '',
    note: '',
  };
}

/** Plan: a date and / or km target. Done: a date that is not in the future. `today` is `YYYY-MM-DD`. */
export function validateMaintenance(v: MaintenanceValues, today: string): Errors {
  const e: Errors = {};
  if (!MAINTENANCE_TYPES.includes(v.maintenance_type)) e.maintenance_type = 'vehicle_records:validation.required';
  if (!optionalKm(v.planned_km)) e.planned_km = 'vehicle_records:validation.km';
  if (!optionalKm(v.done_km)) e.done_km = 'vehicle_records:validation.km';
  if (v.cost.trim() !== '' && !MONEY.test(v.cost.trim())) e.cost = 'vehicle_records:validation.cost';
  if (v.kind === 'planned' && !v.planned_date && !v.planned_km.trim()) {
    e.planned_date = 'vehicle_records:validation.plan_target';
  }
  if (v.kind === 'done') {
    if (!v.done_date) e.done_date = 'vehicle_records:validation.required';
    else if (v.done_date > today) e.done_date = 'vehicle_records:validation.not_future';
  }
  return e;
}

/** `POST /v1/tenant/vehicles/{uuid}/maintenance` body (the panel's dialog sends the same). */
export function maintenanceRequest(v: MaintenanceValues) {
  const common = {
    kind: v.kind,
    maintenance_type: v.maintenance_type,
    service_provider: v.service_provider.trim(),
    cost: v.cost.trim() === '' ? null : v.cost.trim().replace(',', '.'),
    note: v.note.trim(),
    planned_date: v.planned_date || null,
    planned_km: kmOrNull(v.planned_km),
  };
  return v.kind === 'done' ? { ...common, done_date: v.done_date || null, done_km: kmOrNull(v.done_km) } : common;
}

type VehiclePlanLike = {
  next_maintenance_date: string | null;
  next_maintenance_km: number | null;
  odometer_km: number;
};

/** Days and km left to the vehicle's next planned maintenance (negative = overdue), null when there is no target. */
export function maintenanceLeft(v: VehiclePlanLike, today: string) {
  const days =
    v.next_maintenance_date != null
      ? Math.round(
          (Date.parse(`${v.next_maintenance_date.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
            86_400_000,
        )
      : null;
  const km = v.next_maintenance_km != null ? v.next_maintenance_km - v.odometer_km : null;
  return { days, km };
}

// --- expenses ----------------------------------------------------------------

export const VAT_RATES = ['0', '1', '10', '20'] as const;
export const EXPENSE_STATUSES = ['recorded', 'void'] as const;

/** Empty `branch_uuid` = head office, empty `vehicle_uuid` = no vehicle, empty `cash_account_uuid` = not paid yet. */
export type ExpenseValues = {
  category_uuid: string;
  expense_date: string;
  total_amount: string;
  vat_rate: string;
  description: string;
  supplier_name: string;
  document_no: string;
  branch_uuid: string;
  vehicle_uuid: string;
  cash_account_uuid: string;
};

type ExpenseLike = {
  category: { uuid: string };
  expense_date: string;
  total_amount: string;
  vat_rate: string;
  description: string;
  supplier_name: string;
  document_no: string;
  branch: { uuid: string } | null;
  vehicle: { uuid: string } | null;
  cash_account: { uuid: string } | null;
};

export function expenseDefaults(
  today: string,
  init?: { vehicle_uuid?: string; branch_uuid?: string },
  expense?: ExpenseLike | null,
): ExpenseValues {
  if (expense) {
    return {
      category_uuid: expense.category.uuid,
      expense_date: expense.expense_date,
      total_amount: expense.total_amount,
      vat_rate: String(Number(expense.vat_rate)),
      description: expense.description,
      supplier_name: expense.supplier_name,
      document_no: expense.document_no,
      branch_uuid: expense.branch?.uuid ?? '',
      vehicle_uuid: expense.vehicle?.uuid ?? '',
      cash_account_uuid: expense.cash_account?.uuid ?? '',
    };
  }
  return {
    category_uuid: '',
    expense_date: today,
    total_amount: '',
    vat_rate: '20',
    description: '',
    supplier_name: '',
    document_no: '',
    branch_uuid: init?.branch_uuid ?? '',
    vehicle_uuid: init?.vehicle_uuid ?? '',
    cash_account_uuid: '',
  };
}

/** A positive amount with at most two decimals and twelve whole digits ("1.250,50", "300"). */
export function amountValid(text: string) {
  const parsed = parseAmount(text);
  if (!parsed) return false;
  const clean = text.replace(/\s/g, '');
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  return /^\d{1,12}(\.\d{1,2})?$/.test(normalized);
}

/** Amounts, VAT and the paying account are fixed once recorded (`editing`): void and record again. */
export function validateExpense(v: ExpenseValues, editing: boolean): Errors {
  const e: Errors = {};
  if (!v.category_uuid) e.category_uuid = 'finance:validation.required';
  if (!v.expense_date) e.expense_date = 'finance:validation.required';
  if (!editing) {
    if (!amountValid(v.total_amount)) e.total_amount = 'finance:validation.amount';
    if (!(VAT_RATES as readonly string[]).includes(v.vat_rate)) e.vat_rate = 'finance:validation.required';
  }
  return e;
}

/** `POST /v1/tenant/finance/expenses` body: the total with VAT, the rate, optional branch / vehicle / paying account. */
export function expenseCreateRequest(v: ExpenseValues) {
  const opt = (s: string) => s.trim() || undefined;
  return {
    category_uuid: v.category_uuid,
    expense_date: v.expense_date,
    total_amount: parseAmount(v.total_amount) ?? '',
    vat_rate: v.vat_rate,
    description: opt(v.description),
    supplier_name: opt(v.supplier_name),
    document_no: opt(v.document_no),
    branch_uuid: v.branch_uuid || undefined,
    vehicle_uuid: v.vehicle_uuid || undefined,
    cash_account_uuid: v.cash_account_uuid || undefined,
  };
}

/** `PATCH /v1/tenant/finance/expenses/{uuid}` body: an empty branch / vehicle clears it. */
export function expensePatchRequest(v: ExpenseValues) {
  return {
    category_uuid: v.category_uuid,
    expense_date: v.expense_date,
    description: v.description.trim(),
    supplier_name: v.supplier_name.trim(),
    document_no: v.document_no.trim(),
    ...(v.branch_uuid ? { branch_uuid: v.branch_uuid } : { clear_branch: true }),
    ...(v.vehicle_uuid ? { vehicle_uuid: v.vehicle_uuid } : { clear_vehicle: true }),
  };
}

/** Rows generated from a supplier invoice follow the invoice; voided rows are final. */
export function expenseEditable(e: { status: string; supplier_invoice?: unknown }) {
  return e.status === 'recorded' && !e.supplier_invoice;
}

/** List query of `GET /v1/tenant/finance/expenses`, without empty filters. */
export function expenseQuery(f: {
  q: string;
  status: string | null;
  category: string | null;
  branch: string | null;
  from: string;
  to: string;
}) {
  const q = f.q.trim();
  return {
    sort: '-expense_date',
    ...(q ? { q } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.category ? { category: f.category } : {}),
    ...(f.branch ? { branch: f.branch } : {}),
    ...(f.from ? { from: f.from } : {}),
    ...(f.to ? { to: f.to } : {}),
  };
}

// --- receipt photo -----------------------------------------------------------

/** The API's limit (bytes and type are sniffed on the server again). */
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** The picker's type (`null` on some Android galleries, which hand out JPEG). */
export function receiptType(mime: string | null | undefined) {
  const m = (mime ?? 'image/jpeg').toLowerCase();
  return m === 'image/jpg' ? 'image/jpeg' : m;
}

export function checkReceipt(mime: string | null | undefined, size: number | null | undefined) {
  if (!(RECEIPT_TYPES as readonly string[]).includes(receiptType(mime))) return 'bad_type' as const;
  if (size != null && size > RECEIPT_MAX_BYTES) return 'too_large' as const;
  return 'ok' as const;
}

/** File name sent with the upload: `fis-20261109-143005.jpg` (the API keeps it as the attachment name). */
export function receiptName(mime: string | null | undefined, at: Date) {
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[receiptType(mime)] ?? 'jpg';
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}`;
  return `fis-${stamp}.${ext}`;
}
