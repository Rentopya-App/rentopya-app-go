import assert from 'node:assert/strict';
import { test } from 'node:test';

import { inspection } from './fixtures.test-util.ts';
import {
  amountOk,
  canApproveCharge,
  canCompleteReturn,
  canEditLine,
  canWaiveCharge,
  completeReturnPayload,
  decisionNoteRequired,
  decisionReady,
  editReady,
  lineSubject,
  linesTotal,
  overridesWith,
  readingsDelta,
  returnCharges,
  reviewGate,
  reviewPayload,
  reviewPending,
  showComputed,
  type ChargeLine,
  type RentalCharge,
} from './return-model.ts';

const line = (over: Partial<ChargeLine>): ChargeLine => ({
  key: 'mileage',
  kind: 'mileage',
  source: 'policy',
  currency: 'TRY',
  amount: '750.00',
  computed: '750.00',
  overridden: false,
  reason: 'km',
  calculation: {},
  disputed: false,
  ...over,
});

const charge = (over: Partial<RentalCharge>) =>
  ({ uuid: 'c1', kind: 'fuel', source: 'policy', status: 'proposed', disputed: false, ...over }) as RentalCharge;

test('line text: staff reason, damage, equipment, policy', () => {
  const ins = inspection({
    kind: 'return',
    damages: [
      {
        uuid: 'd1',
        zone: 'hood',
        pos_x: null,
        pos_y: null,
        damage_type: 'dent',
        severity: 'major',
        description: 'göçük',
        is_new: true,
        disputed: false,
        created_at: '',
      },
    ],
    charge_overrides: [{ key: 'fuel', amount: '10', reason: 'müşteri doldurdu' }],
  });
  assert.deepEqual(lineSubject(line({ key: 'fuel', kind: 'fuel' }), ins), { kind: 'override', text: 'müşteri doldurdu' });
  assert.deepEqual(lineSubject(line({ key: 'damage:d1', kind: 'damage' }), ins), {
    kind: 'damage',
    zone: 'hood',
    description: 'göçük',
  });
  assert.deepEqual(lineSubject(line({ key: 'damage:gone', kind: 'damage', reason: 'x' }), ins), { kind: 'raw', text: 'x' });
  assert.deepEqual(lineSubject(line({ key: 'equipment:jack', kind: 'equipment' }), ins), {
    kind: 'equipment',
    label: 'Kriko',
  });
  assert.deepEqual(lineSubject(line({ key: 'late_return', kind: 'late_return' }), ins), {
    kind: 'policy',
    key: 'late_return',
  });
  assert.deepEqual(lineSubject(line({ key: 'x', kind: 'other' }), ins), { kind: 'policy', key: 'other' });
});

test('editing a line follows price.override and the reason rule', () => {
  assert.equal(canEditLine(line({}), false, false), false);
  assert.equal(canEditLine(line({}), false, true), true);
  assert.equal(canEditLine(line({ source: 'manual' }), false, false), true);
  assert.equal(canEditLine(line({ source: 'manual' }), true, true), false);
  assert.equal(amountOk('1250,5'), true);
  assert.equal(amountOk('1.250,50'), false);
  assert.equal(amountOk('12.345'), false);
  assert.equal(editReady(line({}), '500', 'ab'), false);
  assert.equal(editReady(line({}), '500', 'abc'), true);
  assert.equal(editReady(line({ source: 'manual' }), '2000', ''), true);
});

test('overrides replace the edited key only', () => {
  const list = [
    { key: 'fuel', amount: '10.00', reason: 'a' },
    { key: 'mileage', amount: '1.00', reason: 'b' },
  ];
  assert.deepEqual(overridesWith(list, 'mileage', ' 500,5 ', ' indirim '), [
    { key: 'fuel', amount: '10.00', reason: 'a' },
    { key: 'mileage', amount: '500.5', reason: 'indirim' },
  ]);
});

test('charge display math', () => {
  assert.equal(linesTotal([{ amount: '0.10' }, { amount: '0.20' }, { amount: '450.00' }]), '450.30');
  assert.equal(linesTotal([]), '0.00');
  assert.equal(showComputed(line({ amount: '750.00', computed: '900.00' })), true);
  assert.equal(showComputed(line({ amount: '750.00', computed: '750' })), false);
  assert.equal(showComputed(line({ computed: null })), false);
  const ins = inspection({ km: 16350, fuel: 60, baseline: { ...({} as never), km: 15230, fuel: 75 } });
  assert.deepEqual(readingsDelta(ins), { km: 1120, fuel: -15 });
  assert.deepEqual(readingsDelta(inspection()), { km: null, fuel: null });
});

test('review gate: close, a note, and waive for an unsigned return', () => {
  const unsigned = { signature_status: 'refused' as const };
  assert.equal(reviewGate(unsigned, 'tamam', { close: true, waive: false }).ok, false);
  assert.equal(reviewGate(unsigned, 'tamam', { close: true, waive: false }).waiveMissing, true);
  assert.equal(reviewGate(unsigned, 'tamam', { close: true, waive: true }).ok, true);
  assert.equal(reviewGate({ signature_status: 'signed' }, 'ok', { close: true, waive: false }).ok, false);
  assert.equal(reviewGate({ signature_status: 'signed' }, 'okay', { close: true, waive: false }).ok, true);
  assert.equal(reviewGate({ signature_status: 'signed' }, 'okay', { close: false, waive: true }).ok, false);
  assert.deepEqual(reviewPayload('  not  ', 'maintenance'), { note: 'not', vehicle_status: 'maintenance' });
  assert.equal(reviewPending({ status: 'finalized', review_status: 'pending' }), true);
  assert.equal(reviewPending({ status: 'draft', review_status: 'pending' }), false);
});

test('approve / waive follow the panel permissions', () => {
  const p = (close: boolean, damage: boolean) => ({ close, damage });
  assert.equal(canApproveCharge(charge({}), p(true, false)), true);
  assert.equal(canApproveCharge(charge({}), p(false, true)), false);
  assert.equal(canApproveCharge(charge({ kind: 'damage' }), p(false, true)), true);
  assert.equal(canApproveCharge(charge({ disputed: true }), p(true, false)), false);
  assert.equal(canApproveCharge(charge({ disputed: true }), p(false, true)), true);
  assert.equal(canApproveCharge(charge({ status: 'approved' }), p(true, true)), false);
  assert.equal(canWaiveCharge(charge({}), p(true, false)), true);
  assert.equal(canWaiveCharge(charge({}), p(false, true)), false);
  assert.equal(decisionNoteRequired('approve', charge({})), false);
  assert.equal(decisionNoteRequired('approve', charge({ disputed: true })), true);
  assert.equal(decisionReady('waive', charge({}), 'ab'), false);
  assert.equal(decisionReady('waive', charge({}), 'abc'), true);
  assert.equal(decisionReady('approve', charge({}), ''), true);
  assert.deepEqual(
    returnCharges([charge({ uuid: 'a' }), charge({ uuid: 'b', source: 'toll' })]).map((c) => c.uuid),
    ['a'],
  );
});

test('return check: rentals.close, return_check and no open review', () => {
  assert.equal(canCompleteReturn('return_check', { review_status: 'resolved' }, true), true);
  assert.equal(canCompleteReturn('return_check', { review_status: 'pending' }, true), false);
  assert.equal(canCompleteReturn('returned', { review_status: 'none' }, true), false);
  assert.equal(canCompleteReturn('return_check', { review_status: 'none' }, false), false);
  assert.deepEqual(completeReturnPayload('cleaning', ' ', false), {
    vehicle_status: 'cleaning',
    note: undefined,
    deposit_task: undefined,
  });
  assert.deepEqual(completeReturnPayload('available', ' temiz ', true), {
    vehicle_status: 'available',
    note: 'temiz',
    deposit_task: true,
  });
});
