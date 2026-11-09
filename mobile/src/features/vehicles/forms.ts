/**
 * Validation and request bodies of the vehicle forms, the same rules as the
 * panel's zod schemas (vehicle form, status dialog, maintenance completion,
 * block dialog). Errors are i18n keys of the shared panel catalogs.
 * Free of app imports so it runs under `node --test`.
 */

export const VEHICLE_STATUSES = [
  'available',
  'preparing',
  'rented',
  'return_check',
  'cleaning',
  'maintenance',
  'damaged',
  'in_transfer',
  'out_of_service',
] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const BLOCK_KINDS = ['maintenance', 'damage', 'cleaning', 'out_of_service', 'other'] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];
/** Kinds whose block can also set the vehicle status ("other" cannot). */
export const STATUS_SYNC_KINDS: readonly BlockKind[] = ['maintenance', 'damage', 'cleaning', 'out_of_service'];

export type Errors = Record<string, string>;

const PLATE = /^[A-Za-z0-9][A-Za-z0-9 -]{0,18}[A-Za-z0-9]$/;
const VIN = /^[A-HJ-NPR-Z0-9]{17}$/;
const MONEY = /^\d{1,12}([.,]\d{1,2})?$/;
export const MAX_KM = 5_000_000;

/** Empty, or a whole number in `[min, max]`. */
export function optionalInt(v: string, min: number, max: number) {
  const s = v.trim();
  if (s === '') return true;
  const n = Number(s);
  return Number.isInteger(n) && n >= min && n <= max;
}

const intOrNull = (v: string) => (v.trim() === '' ? null : Number(v.trim()));

// --- status change ---------------------------------------------------------

export type StatusValues = { status: VehicleStatus; odometer_km: string; fuel_level: string; note: string };

export function validateStatus(v: StatusValues): Errors {
  const e: Errors = {};
  if (!optionalInt(v.odometer_km, 0, MAX_KM)) e.odometer_km = 'vehicles:validation.km';
  if (!optionalInt(v.fuel_level, 0, 100)) e.fuel_level = 'vehicles:validation.fuel_level';
  return e;
}

export function statusRequest(v: StatusValues) {
  return {
    status: v.status,
    odometer_km: v.odometer_km.trim() === '' ? undefined : Number(v.odometer_km.trim()),
    fuel_level: intOrNull(v.fuel_level),
    note: v.note.trim(),
  };
}

// --- maintenance completion ------------------------------------------------

export type CompleteValues = {
  done_date: string;
  done_km: string;
  service_provider: string;
  cost: string;
  note: string;
};

/** `today` is the `YYYY-MM-DD` day in the organization zone. */
export function validateComplete(v: CompleteValues, today: string): Errors {
  const e: Errors = {};
  if (!v.done_date) e.done_date = 'vehicle_records:validation.required';
  else if (v.done_date > today) e.done_date = 'vehicle_records:validation.not_future';
  if (!optionalInt(v.done_km, 0, MAX_KM)) e.done_km = 'vehicle_records:validation.km';
  if (v.cost.trim() !== '' && !MONEY.test(v.cost.trim())) e.cost = 'vehicle_records:validation.cost';
  return e;
}

export function completeRequest(v: CompleteValues) {
  return {
    done_date: v.done_date,
    done_km: intOrNull(v.done_km),
    service_provider: v.service_provider.trim(),
    cost: v.cost.trim() === '' ? null : v.cost.trim().replace(',', '.'),
    note: v.note.trim(),
  };
}

// --- blocks ----------------------------------------------------------------

/** `starts_at` / `ends_at` are instants (ISO) or empty: empty start = now, empty end = open-ended. */
export type BlockValues = { kind: BlockKind; starts_at: string; ends_at: string; reason: string; sync_status: boolean };

export function validateBlock(v: BlockValues, now: Date): Errors {
  const e: Errors = {};
  const start = v.starts_at ? new Date(v.starts_at) : now;
  if (v.ends_at && new Date(v.ends_at) <= start) e.ends_at = 'vehicle_blocks:validation.ends_after_start';
  return e;
}

/** The status checkbox only applies to kinds with a vehicle status and a block that covers now. */
export function canSyncStatus(kind: BlockKind, startsAt: string, now: Date) {
  return STATUS_SYNC_KINDS.includes(kind) && (!startsAt || new Date(startsAt) <= now);
}

export function blockRequest(v: BlockValues, now: Date) {
  return {
    kind: v.kind,
    ...(v.starts_at ? { starts_at: v.starts_at } : {}),
    ...(v.ends_at ? { ends_at: v.ends_at } : {}),
    reason: v.reason.trim(),
    sync_status: v.sync_status && canSyncStatus(v.kind, v.starts_at, now),
  };
}

// --- vehicle create / edit -------------------------------------------------

/** The fields the panel requires, plus the readings a field user changes; the rest stays as it is. */
export type VehicleFormValues = {
  plate: string;
  vin: string;
  manual_entry: boolean;
  brand_uuid: string;
  brand_label: string;
  model_uuid: string;
  model_label: string;
  catalog_type_uuid: string;
  type_label: string;
  /** Valid model years of the picked catalog type (empty = any). */
  type_years: number[];
  manual_brand: string;
  manual_model: string;
  manual_type: string;
  model_year: string;
  color: string;
  home_branch_uuid: string;
  current_branch_uuid: string;
  odometer_km: string;
  fuel_level: string;
  status: VehicleStatus;
};

type VehicleLike = {
  plate: string;
  vin: string;
  manual_entry: boolean;
  catalog: {
    brand_uuid: string | null;
    brand_name: string;
    model_uuid: string | null;
    model_name: string;
    type_uuid: string;
    type_name: string;
    years: number[];
  } | null;
  brand: string;
  model: string;
  type_name: string;
  model_year: number;
  color: string;
  home_branch: { uuid: string };
  current_branch: { uuid: string };
  odometer_km: number;
  fuel_level: number | null;
  status: VehicleStatus;
};

export function vehicleFormDefaults(vehicle?: VehicleLike | null): VehicleFormValues {
  const c = vehicle?.catalog ?? null;
  return {
    plate: vehicle?.plate ?? '',
    vin: vehicle?.vin ?? '',
    manual_entry: vehicle?.manual_entry ?? false,
    brand_uuid: c?.brand_uuid ?? '',
    brand_label: c?.brand_name ?? '',
    model_uuid: c?.model_uuid ?? '',
    model_label: c?.model_name ?? '',
    catalog_type_uuid: c?.type_uuid ?? '',
    type_label: c?.type_name ?? '',
    type_years: c?.years ?? [],
    manual_brand: vehicle?.manual_entry ? vehicle.brand : '',
    manual_model: vehicle?.manual_entry ? vehicle.model : '',
    manual_type: vehicle?.manual_entry ? vehicle.type_name : '',
    model_year: vehicle ? String(vehicle.model_year) : '',
    color: vehicle?.color ?? '',
    home_branch_uuid: vehicle?.home_branch.uuid ?? '',
    current_branch_uuid: vehicle?.current_branch.uuid ?? '',
    odometer_km: vehicle ? String(vehicle.odometer_km) : '',
    fuel_level: vehicle?.fuel_level != null ? String(vehicle.fuel_level) : '',
    status: vehicle?.status ?? 'available',
  };
}

export function validateVehicle(v: VehicleFormValues): Errors {
  const e: Errors = {};
  const plate = v.plate.trim();
  if (!plate) e.plate = 'vehicles:validation.plate_required';
  else if (!PLATE.test(plate)) e.plate = 'vehicles:validation.plate_format';
  const vin = v.vin.trim().toUpperCase().replace(/\s/g, '');
  if (vin && !VIN.test(vin)) e.vin = 'vehicles:validation.vin_format';
  if (v.manual_entry) {
    if (!v.manual_brand.trim()) e.manual_brand = 'vehicles:validation.manual_brand_required';
    if (!v.manual_model.trim()) e.manual_model = 'vehicles:validation.manual_model_required';
  } else if (!v.catalog_type_uuid) {
    e.catalog_type_uuid = 'vehicles:validation.catalog_type_required';
  }
  if (!v.model_year) e.model_year = 'vehicles:validation.model_year_required';
  else if (!v.manual_entry && v.type_years.length > 0 && !v.type_years.includes(Number(v.model_year)))
    e.model_year = 'vehicles:validation.model_year_invalid';
  if (!v.home_branch_uuid) e.home_branch_uuid = 'vehicles:validation.home_branch_required';
  if (!optionalInt(v.odometer_km, 0, MAX_KM)) e.odometer_km = 'vehicles:validation.km';
  if (!optionalInt(v.fuel_level, 0, 100)) e.fuel_level = 'vehicles:validation.fuel_level';
  return e;
}

/**
 * Create / patch body with only the fields of this form (a patch leaves the
 * others as they are). `status` only on create: later changes go through the
 * status screen, recorded with km, fuel and a note.
 */
export function vehicleRequest(v: VehicleFormValues, mode: 'create' | 'edit') {
  const body: {
    plate: string;
    vin: string;
    manual_entry: boolean;
    model_year: number;
    color: string;
    home_branch_uuid: string;
    fuel_level: number | null;
    current_branch_uuid?: string;
    odometer_km?: number;
    catalog_type_uuid?: string;
    manual_brand?: string;
    manual_model?: string;
    manual_type?: string;
    status?: VehicleStatus;
  } = {
    plate: v.plate.trim().toUpperCase(),
    vin: v.vin.trim().toUpperCase().replace(/\s/g, ''),
    manual_entry: v.manual_entry,
    model_year: Number(v.model_year),
    color: v.color.trim(),
    home_branch_uuid: v.home_branch_uuid,
    fuel_level: intOrNull(v.fuel_level),
  };
  if (v.current_branch_uuid) body.current_branch_uuid = v.current_branch_uuid;
  if (v.odometer_km.trim() !== '') body.odometer_km = Number(v.odometer_km.trim());
  if (v.manual_entry) {
    body.manual_brand = v.manual_brand.trim();
    body.manual_model = v.manual_model.trim();
    body.manual_type = v.manual_type.trim();
  } else {
    body.catalog_type_uuid = v.catalog_type_uuid;
  }
  if (mode === 'create') body.status = v.status;
  return body;
}

/** Model years offered when the catalog type does not restrict them: next year back to 1990. */
export function fallbackYears(now: Date) {
  const last = now.getFullYear() + 1;
  return Array.from({ length: last - 1989 }, (_, i) => last - i);
}
