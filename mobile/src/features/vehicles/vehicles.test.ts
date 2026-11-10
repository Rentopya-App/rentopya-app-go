import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  blockRequest,
  canSyncStatus,
  completeRequest,
  fallbackYears,
  statusRequest,
  validateBlock,
  validateComplete,
  validateStatus,
  validateVehicle,
  vehicleFormDefaults,
  vehicleRequest,
  VEHICLE_STATUSES,
  BLOCK_KINDS,
  type VehicleFormValues,
} from './forms.ts';
import { STATUS_TONE } from './labels.ts';
import { looksLikePlate, normalizePlate, parseScan, vehicleLink } from './scan.ts';

const UUID = '3f2b9c1e-8a4d-4f6b-9c2e-1a2b3c4d5e6f';

test('parseScan: the QR label link opens the vehicle', () => {
  assert.deepEqual(parseScan(vehicleLink(UUID)), { kind: 'vehicle', uuid: UUID });
  assert.deepEqual(parseScan(`  rentopya://vehicle/${UUID.toUpperCase()}/ `), { kind: 'vehicle', uuid: UUID });
  assert.deepEqual(parseScan(`rentopya:///vehicle/${UUID}?src=label`), { kind: 'vehicle', uuid: UUID });
  assert.deepEqual(parseScan(`RENTOPYA://vehicle/${UUID}#x`), { kind: 'vehicle', uuid: UUID });
});

test('parseScan: a link with a bad id or another path is unknown', () => {
  assert.deepEqual(parseScan('rentopya://vehicle/not-a-uuid'), { kind: 'unknown' });
  assert.deepEqual(parseScan(`rentopya://customer/${UUID}`), { kind: 'unknown' });
  assert.deepEqual(parseScan(`https://example.com/vehicle/${UUID}`), { kind: 'unknown' });
  assert.deepEqual(parseScan('mailto:a@b.c'), { kind: 'unknown' });
});

test('parseScan: plate text is searched', () => {
  assert.deepEqual(parseScan('34 abc 123'), { kind: 'plate', plate: '34 ABC 123' });
  assert.deepEqual(parseScan('34-ABC-123'), { kind: 'plate', plate: '34-ABC-123' });
  assert.deepEqual(parseScan('06  XY   42'), { kind: 'plate', plate: '06 XY 42' });
});

test('parseScan: product barcodes, words and empty input are unknown', () => {
  assert.deepEqual(parseScan('8690000000001'), { kind: 'unknown' });
  assert.deepEqual(parseScan('HELLO'), { kind: 'unknown' });
  assert.deepEqual(parseScan(''), { kind: 'unknown' });
  assert.deepEqual(parseScan(null), { kind: 'unknown' });
  assert.deepEqual(parseScan('A'.repeat(10) + '1'.repeat(15)), { kind: 'unknown' });
});

test('looksLikePlate / normalizePlate', () => {
  assert.equal(looksLikePlate('34ABC123'), true);
  assert.equal(looksLikePlate('-34ABC'), false);
  assert.equal(normalizePlate(' 34 abc  123 '), '34 ABC 123');
});

test('status form: km and fuel limits, empty readings are left out', () => {
  const base = { status: 'maintenance' as const, odometer_km: '', fuel_level: '', note: '  ' };
  assert.deepEqual(validateStatus(base), {});
  assert.deepEqual(validateStatus({ ...base, odometer_km: '-1', fuel_level: '101' }), {
    odometer_km: 'vehicles:validation.km',
    fuel_level: 'vehicles:validation.fuel_level',
  });
  assert.deepEqual(validateStatus({ ...base, odometer_km: '12.5' }), { odometer_km: 'vehicles:validation.km' });
  assert.deepEqual(statusRequest(base), { status: 'maintenance', odometer_km: undefined, fuel_level: null, note: '' });
  assert.deepEqual(statusRequest({ ...base, odometer_km: '45200', fuel_level: '50', note: ' ok ' }), {
    status: 'maintenance',
    odometer_km: 45200,
    fuel_level: 50,
    note: 'ok',
  });
});

test('maintenance completion: date required and not in the future, km and money format', () => {
  const v = { done_date: '2026-11-09', done_km: '', service_provider: ' Servis ', cost: '', note: '' };
  assert.deepEqual(validateComplete(v, '2026-11-09'), {});
  assert.deepEqual(validateComplete({ ...v, done_date: '' }, '2026-11-09'), {
    done_date: 'vehicle_records:validation.required',
  });
  assert.deepEqual(validateComplete({ ...v, done_date: '2026-11-10', done_km: 'x', cost: '12.345' }, '2026-11-09'), {
    done_date: 'vehicle_records:validation.not_future',
    done_km: 'vehicle_records:validation.km',
    cost: 'vehicle_records:validation.cost',
  });
  assert.deepEqual(completeRequest({ ...v, done_km: '1200', cost: '2450,5' }), {
    done_date: '2026-11-09',
    done_km: 1200,
    service_provider: 'Servis',
    cost: '2450.5',
    note: '',
  });
});

test('blocks: end after start, status sync only for status kinds that cover now', () => {
  const now = new Date('2026-11-09T10:00:00Z');
  const v = { kind: 'maintenance' as const, starts_at: '', ends_at: '', reason: ' fren ', sync_status: true };
  assert.deepEqual(validateBlock(v, now), {});
  assert.deepEqual(validateBlock({ ...v, ends_at: '2026-11-09T09:00:00Z' }, now), {
    ends_at: 'vehicle_blocks:validation.ends_after_start',
  });
  assert.deepEqual(blockRequest(v, now), { kind: 'maintenance', reason: 'fren', sync_status: true });
  assert.equal(canSyncStatus('other', '', now), false);
  assert.equal(canSyncStatus('damage', '2026-11-10T00:00:00Z', now), false);
  assert.deepEqual(blockRequest({ ...v, starts_at: '2026-11-10T00:00:00Z' }, now), {
    kind: 'maintenance',
    starts_at: '2026-11-10T00:00:00Z',
    reason: 'fren',
    sync_status: false,
  });
});

function form(over: Partial<VehicleFormValues> = {}): VehicleFormValues {
  return { ...vehicleFormDefaults(), plate: '34 abc 123', model_year: '2024', home_branch_uuid: UUID, ...over };
}

test('vehicle form: the panel required fields', () => {
  assert.deepEqual(validateVehicle(vehicleFormDefaults()), {
    plate: 'vehicles:validation.plate_required',
    catalog_type_uuid: 'vehicles:validation.catalog_type_required',
    model_year: 'vehicles:validation.model_year_required',
    home_branch_uuid: 'vehicles:validation.home_branch_required',
  });
  assert.deepEqual(validateVehicle(form({ catalog_type_uuid: UUID })), {});
  assert.deepEqual(validateVehicle(form({ manual_entry: true })), {
    manual_brand: 'vehicles:validation.manual_brand_required',
    manual_model: 'vehicles:validation.manual_model_required',
  });
  assert.deepEqual(validateVehicle(form({ catalog_type_uuid: UUID, type_years: [2020, 2021] })), {
    model_year: 'vehicles:validation.model_year_invalid',
  });
  assert.deepEqual(validateVehicle(form({ catalog_type_uuid: UUID, plate: '#', vin: 'ABC' })), {
    plate: 'vehicles:validation.plate_format',
    vin: 'vehicles:validation.vin_format',
  });
});

test('vehicle form: request bodies', () => {
  const create = vehicleRequest(
    form({ catalog_type_uuid: UUID, odometer_km: '100', vin: 'wf0x xxgcdx 1234567' }),
    'create',
  );
  assert.deepEqual(create, {
    plate: '34 ABC 123',
    vin: 'WF0XXXGCDX1234567',
    manual_entry: false,
    model_year: 2024,
    color: '',
    home_branch_uuid: UUID,
    fuel_level: null,
    odometer_km: 100,
    catalog_type_uuid: UUID,
    status: 'available',
  });
  const edit = vehicleRequest(
    form({ manual_entry: true, manual_brand: ' Fiat ', manual_model: 'Egea', current_branch_uuid: UUID }),
    'edit',
  );
  assert.equal(edit.status, undefined);
  assert.equal(edit.catalog_type_uuid, undefined);
  assert.equal(edit.manual_brand, 'Fiat');
  assert.equal(edit.current_branch_uuid, UUID);
});

test('fallback years run from next year back to 1990', () => {
  const years = fallbackYears(new Date('2026-06-01T00:00:00Z'));
  assert.equal(years[0], 2027);
  assert.equal(years.at(-1), 1990);
});

test('every status and block kind has a label in the shared panel catalogs', () => {
  const dir = path.join(import.meta.dirname, '../../../../frontend/src/locales');
  for (const lang of ['tr', 'en']) {
    const vehicles = JSON.parse(fs.readFileSync(path.join(dir, lang, 'vehicles.json'), 'utf8'));
    const blocks = JSON.parse(fs.readFileSync(path.join(dir, lang, 'vehicle_blocks.json'), 'utf8'));
    for (const s of VEHICLE_STATUSES) {
      assert.ok(vehicles[`status.${s}`], `${lang} vehicles status.${s}`);
      assert.ok(STATUS_TONE[s]);
    }
    for (const k of BLOCK_KINDS) assert.ok(blocks[`kind.${k}`], `${lang} vehicle_blocks kind.${k}`);
  }
});
