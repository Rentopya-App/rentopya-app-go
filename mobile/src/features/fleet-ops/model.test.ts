import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  alertCounts,
  amountValid,
  checkReceipt,
  expenseCreateRequest,
  expenseDefaults,
  expenseEditable,
  expensePatchRequest,
  expenseQuery,
  filterAlerts,
  maintenanceDefaults,
  maintenanceLeft,
  maintenanceRequest,
  receiptName,
  receiptType,
  RECEIPT_MAX_BYTES,
  validateExpense,
  validateMaintenance,
} from './model.ts';

const TODAY = '2026-11-09';

const alert = (o: Partial<{ kind: string; state: string; plate: string; branch: string }>) => ({
  kind: o.kind ?? 'document',
  state: o.state ?? 'expiring',
  vehicle: { plate: o.plate ?? '34 ABC 123', current_branch: o.branch ?? 'Merkez' },
});

test('filterAlerts: kind, state, plate (spaces / dashes ignored) and branch name', () => {
  const items = [
    alert({ kind: 'document', state: 'overdue', plate: '34 ABC 123' }),
    alert({ kind: 'maintenance', state: 'expiring', plate: '07 XYZ 45', branch: 'Havalimanı' }),
    alert({ kind: 'maintenance', state: 'overdue', plate: '06 DEF 9' }),
  ];
  assert.equal(filterAlerts(items, {}).length, 3);
  assert.equal(filterAlerts(items, { kind: 'maintenance' }).length, 2);
  assert.equal(filterAlerts(items, { kind: 'maintenance', state: 'overdue' }).length, 1);
  assert.deepEqual(
    filterAlerts(items, { q: '34-abc' }).map((a) => a.vehicle.plate),
    ['34 ABC 123'],
  );
  assert.deepEqual(
    filterAlerts(items, { branchName: 'Havalimanı' }).map((a) => a.vehicle.plate),
    ['07 XYZ 45'],
  );
  assert.deepEqual(alertCounts(items), { overdue: 2, expiring: 1 });
});

test('validateMaintenance: a plan needs a date or a km target', () => {
  const plan = maintenanceDefaults('planned', TODAY);
  assert.equal(validateMaintenance(plan, TODAY).planned_date, 'vehicle_records:validation.plan_target');
  assert.deepEqual(validateMaintenance({ ...plan, planned_km: '50000' }, TODAY), {});
  assert.deepEqual(validateMaintenance({ ...plan, planned_date: '2026-12-01' }, TODAY), {});
  assert.equal(validateMaintenance({ ...plan, planned_km: '-1' }, TODAY).planned_km, 'vehicle_records:validation.km');
  assert.equal(
    validateMaintenance({ ...plan, planned_km: '6000000' }, TODAY).planned_km,
    'vehicle_records:validation.km',
  );
  assert.equal(
    validateMaintenance({ ...plan, planned_km: '1', cost: '12,345' }, TODAY).cost,
    'vehicle_records:validation.cost',
  );
});

test('validateMaintenance: a done record needs a date that is not in the future', () => {
  const done = maintenanceDefaults('done', TODAY);
  assert.equal(done.done_date, TODAY);
  assert.deepEqual(validateMaintenance(done, TODAY), {});
  assert.equal(validateMaintenance({ ...done, done_date: '' }, TODAY).done_date, 'vehicle_records:validation.required');
  assert.equal(
    validateMaintenance({ ...done, done_date: '2026-11-10' }, TODAY).done_date,
    'vehicle_records:validation.not_future',
  );
});

test('maintenanceRequest: the panel dialog body (done fields only for a done record)', () => {
  const plan = {
    ...maintenanceDefaults('planned', TODAY),
    planned_km: ' 50000 ',
    service_provider: ' Servis ',
    cost: '2450,5',
  };
  assert.deepEqual(maintenanceRequest(plan), {
    kind: 'planned',
    maintenance_type: 'periodic',
    service_provider: 'Servis',
    cost: '2450.5',
    note: '',
    planned_date: null,
    planned_km: 50000,
  });
  const done = { ...maintenanceDefaults('done', TODAY), done_km: '41000', maintenance_type: 'tire' as const };
  assert.deepEqual(maintenanceRequest(done), {
    kind: 'done',
    maintenance_type: 'tire',
    service_provider: '',
    cost: null,
    note: '',
    planned_date: null,
    planned_km: null,
    done_date: TODAY,
    done_km: 41000,
  });
});

test('maintenanceLeft: days and km to the next plan, negative when overdue', () => {
  assert.deepEqual(
    maintenanceLeft({ next_maintenance_date: '2026-11-19', next_maintenance_km: 50000, odometer_km: 45210 }, TODAY),
    { days: 10, km: 4790 },
  );
  assert.deepEqual(
    maintenanceLeft({ next_maintenance_date: '2026-11-06', next_maintenance_km: null, odometer_km: 1 }, TODAY),
    { days: -3, km: null },
  );
  assert.deepEqual(maintenanceLeft({ next_maintenance_date: null, next_maintenance_km: null, odometer_km: 1 }, TODAY), {
    days: null,
    km: null,
  });
});

test('amountValid: positive, two decimals, Turkish and plain formats', () => {
  for (const ok of ['300', '1.250,50', '1250,5', '1250.50', '0,01']) assert.equal(amountValid(ok), true, ok);
  for (const bad of ['', '0', '-5', 'abc', '12,345', '1.2.3', '1234567890123'])
    assert.equal(amountValid(bad), false, bad);
});

test('validateExpense: category, date and amount; amounts are fixed when editing', () => {
  const v = expenseDefaults(TODAY);
  assert.deepEqual(validateExpense(v, false), {
    category_uuid: 'finance:validation.required',
    total_amount: 'finance:validation.amount',
  });
  assert.deepEqual(validateExpense({ ...v, category_uuid: 'c1', total_amount: '850' }, false), {});
  assert.deepEqual(validateExpense({ ...v, category_uuid: 'c1' }, true), {});
  assert.equal(
    validateExpense({ ...v, category_uuid: 'c1', total_amount: '1', vat_rate: '18' }, false).vat_rate,
    'finance:validation.required',
  );
});

test('expenseCreateRequest: normalised total, empty optionals left out', () => {
  const v = {
    ...expenseDefaults(TODAY, { vehicle_uuid: 'v1', branch_uuid: 'b1' }),
    category_uuid: 'c1',
    total_amount: '1.250,50',
    supplier_name: '  Opet  ',
  };
  assert.deepEqual(expenseCreateRequest(v), {
    category_uuid: 'c1',
    expense_date: TODAY,
    total_amount: '1250.50',
    vat_rate: '20',
    description: undefined,
    supplier_name: 'Opet',
    document_no: undefined,
    branch_uuid: 'b1',
    vehicle_uuid: 'v1',
    cash_account_uuid: undefined,
  });
});

test('expensePatchRequest: an empty branch / vehicle clears it, amounts are not sent', () => {
  const expense = {
    category: { uuid: 'c1' },
    expense_date: '2026-11-01',
    total_amount: '100.00',
    vat_rate: '20.00',
    description: 'Yakıt',
    supplier_name: '',
    document_no: 'F-1',
    branch: { uuid: 'b1' },
    vehicle: null,
    cash_account: { uuid: 'k1' },
  };
  const v = expenseDefaults(TODAY, undefined, expense);
  assert.equal(v.vat_rate, '20');
  assert.equal(v.cash_account_uuid, 'k1');
  assert.deepEqual(expensePatchRequest(v), {
    category_uuid: 'c1',
    expense_date: '2026-11-01',
    description: 'Yakıt',
    supplier_name: '',
    document_no: 'F-1',
    branch_uuid: 'b1',
    clear_vehicle: true,
  });
  assert.equal('clear_branch' in expensePatchRequest({ ...v, branch_uuid: '' }), true);
});

test('expenseEditable: voided rows and supplier-invoice rows are read-only', () => {
  assert.equal(expenseEditable({ status: 'recorded', supplier_invoice: null }), true);
  assert.equal(expenseEditable({ status: 'void', supplier_invoice: null }), false);
  assert.equal(expenseEditable({ status: 'recorded', supplier_invoice: { uuid: 'i' } }), false);
});

test('expenseQuery: only the filters that are set, newest first', () => {
  assert.deepEqual(expenseQuery({ q: ' ', status: null, category: null, branch: null, from: '', to: '' }), {
    sort: '-expense_date',
  });
  assert.deepEqual(
    expenseQuery({ q: 'opet', status: 'recorded', category: 'c1', branch: 'b1', from: '2026-11-01', to: '2026-11-09' }),
    {
      sort: '-expense_date',
      q: 'opet',
      status: 'recorded',
      category: 'c1',
      branch: 'b1',
      from: '2026-11-01',
      to: '2026-11-09',
    },
  );
});

test('receipt: JPEG / PNG / WEBP up to 10 MB, a dated file name', () => {
  assert.equal(receiptType(null), 'image/jpeg');
  assert.equal(receiptType('image/jpg'), 'image/jpeg');
  assert.equal(checkReceipt('image/jpeg', 1000), 'ok');
  assert.equal(checkReceipt(null, null), 'ok');
  assert.equal(checkReceipt('image/heic', 1000), 'bad_type');
  assert.equal(checkReceipt('image/png', RECEIPT_MAX_BYTES + 1), 'too_large');
  assert.equal(receiptName('image/png', new Date(2026, 10, 9, 14, 30, 5)), 'fis-20261109-143005.png');
  assert.equal(receiptName(null, new Date(2026, 0, 2, 3, 4, 5)), 'fis-20260102-030405.jpg');
});
