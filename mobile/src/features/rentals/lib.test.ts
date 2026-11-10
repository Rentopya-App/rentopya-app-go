import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  chargeDecisions,
  decisionNoteRequired,
  decisionNoteValid,
  eventActionKey,
  eventReasonKey,
  extendRequest,
  inspectionListQuery,
  isTaskLate,
  lastKm,
  listedCharges,
  mediaHref,
  mediaMap,
  openCharges,
  photoGroups,
  problemKey,
  rentalActions,
  rentalListQuery,
  swapRequest,
  taskActions,
  taskListQuery,
  timesAround,
  timesWith,
  nextDayOf,
  wallClock,
  type Inspection,
  type RentalCharge,
} from './lib.ts';

const TZ = 'Europe/Istanbul';

test('rentalListQuery maps the quick filter, search, branch and product', () => {
  assert.deepEqual(rentalListQuery({ filter: 'all', sort: '-created_at' }), { sort: '-created_at' });
  assert.deepEqual(rentalListQuery({ filter: 'active', sort: 'planned_return_at', q: ' 34 ABC ', branch: 'b1' }), {
    sort: 'planned_return_at',
    q: '34 ABC',
    status: 'active',
    branch: 'b1',
  });
  assert.deepEqual(rentalListQuery({ filter: 'overdue', sort: '-created_at', product: 'p1', branch: null }), {
    sort: '-created_at',
    overdue: 'true',
    product: 'p1',
  });
});

test('rentalActions follows the panel gates', () => {
  const all = { write: true, close: true };
  assert.deepEqual(rentalActions('preparation', all), {
    handover: true,
    return: false,
    extend: true,
    swap: false,
    cancel: true,
  });
  assert.deepEqual(rentalActions('active', all), {
    handover: false,
    return: true,
    extend: true,
    swap: true,
    cancel: false,
  });
  assert.deepEqual(rentalActions('active', { write: false, close: true }), {
    handover: false,
    return: false,
    extend: false,
    swap: false,
    cancel: false,
  });
  assert.equal(rentalActions('preparation', { write: false, close: true }).cancel, true);
  for (const s of ['return_check', 'returned', 'cancelled'] as const) {
    assert.ok(
      Object.values(rentalActions(s, all)).every((v) => !v),
      s,
    );
  }
});

const charge = (over: Partial<RentalCharge>) =>
  ({ status: 'proposed', kind: 'fuel', disputed: false, source: 'policy', ...over }) as RentalCharge;

test('chargeDecisions: close approves and waives, damage approves damage, disputed needs damage', () => {
  const close = { close: true, damage: false };
  const damage = { close: false, damage: true };
  assert.deepEqual(chargeDecisions(charge({}), close), { approve: true, waive: true });
  assert.deepEqual(chargeDecisions(charge({}), damage), { approve: false, waive: false });
  assert.deepEqual(chargeDecisions(charge({ kind: 'damage' }), damage), { approve: true, waive: false });
  assert.deepEqual(chargeDecisions(charge({ disputed: true }), close), { approve: false, waive: true });
  assert.deepEqual(chargeDecisions(charge({ disputed: true }), damage), { approve: true, waive: false });
  assert.deepEqual(chargeDecisions(charge({ status: 'approved' }), { close: true, damage: true }), {
    approve: false,
    waive: false,
  });
});

test('decision notes: waive and disputed need 3-500 characters', () => {
  assert.equal(decisionNoteRequired('waive', { disputed: false }), true);
  assert.equal(decisionNoteRequired('approve', { disputed: true }), true);
  assert.equal(decisionNoteRequired('approve', { disputed: false }), false);
  assert.equal(decisionNoteValid('  ', false), true);
  assert.equal(decisionNoteValid('ok', true), false);
  assert.equal(decisionNoteValid('fine', true), true);
  assert.equal(decisionNoteValid('x'.repeat(501), true), false);
});

test('listed and open charges leave toll passes out', () => {
  const list = [
    charge({ source: 'toll' }),
    charge({}),
    charge({ status: 'approved' }),
    charge({ source: 'manual', kind: 'damage' }),
  ];
  assert.equal(listedCharges(list).length, 3);
  assert.equal(openCharges(list), 2);
});

test('lastKm reads the latest leg', () => {
  assert.equal(lastKm([]), null);
  assert.equal(
    lastKm([
      { in_km: 1200, out_km: 1000 },
      { in_km: null, out_km: 1300 },
    ]),
    1300,
  );
  assert.equal(lastKm([{ in_km: 1500, out_km: 1000 }]), 1500);
});

test('timeline and problem keys', () => {
  assert.equal(eventActionKey('vehicle_swapped'), 'events.actions.vehicle_swapped');
  assert.equal(eventActionKey('mystery'), null);
  assert.equal(eventReasonKey('handover'), 'events.reasons.handover');
  assert.equal(eventReasonKey('customer asked'), null);
  assert.equal(problemKey('CAPACITY_UNAVAILABLE', []), 'problems.capacity');
  assert.equal(problemKey('CONFLICT', [{ code: 'extension_conflict' }]), 'problems.extension_conflict');
  assert.equal(problemKey('CONFLICT', [{ code: 'other' }]), null);
  assert.equal(problemKey('NOT_FOUND', undefined), null);
});

test('wallClock and timesWith', () => {
  assert.deepEqual(wallClock('2026-10-26T06:30:00Z', TZ), { day: '2026-10-26', time: '09:30' });
  const times = timesWith('10:15');
  assert.equal(times.length, 49);
  assert.ok(times.indexOf('10:15') > times.indexOf('10:00') && times.indexOf('10:15') < times.indexOf('10:30'));
  assert.equal(timesWith('10:00').length, 48);
});

test('extendRequest needs a later end', () => {
  const planned = '2026-10-26T07:00:00Z'; // 10:00 Istanbul
  assert.deepEqual(extendRequest({ day: '2026-10-26', time: '10:00', reason: '' }, planned, TZ), {
    error: 'validation.extend_later',
  });
  assert.deepEqual(extendRequest({ day: '', time: '10:00', reason: '' }, planned, TZ), {
    error: 'validation.required',
  });
  assert.deepEqual(extendRequest({ day: '2026-10-27', time: '10:00', reason: ' bayram ' }, planned, TZ), {
    body: { ends_at: '2026-10-27T07:00:00.000Z', reason: 'bayram' },
  });
  assert.deepEqual(extendRequest({ day: '2026-10-27', time: '10:00', reason: '' }, planned, TZ), {
    body: { ends_at: '2026-10-27T07:00:00.000Z' },
  });
});

test('swapRequest validates like the panel dialog', () => {
  const base = {
    vehicleUuid: 'v2',
    day: '2026-10-26',
    time: '12:00',
    branchUuid: 'b1',
    inKm: '1500',
    inFuel: '50',
    outKm: '300',
    outFuel: '100',
    reason: 'arıza',
  };
  const ok = swapRequest(base, { vehicleUuid: 'v1', minKm: 1400 }, TZ);
  assert.deepEqual(ok.body, {
    vehicle_uuid: 'v2',
    at: '2026-10-26T09:00:00.000Z',
    branch_uuid: 'b1',
    in_km: 1500,
    in_fuel: 50,
    out_km: 300,
    out_fuel: 100,
    reason: 'arıza',
  });
  const bad = swapRequest(
    { ...base, vehicleUuid: 'v1', inKm: '1000', inFuel: '101', outKm: 'x', reason: 'no', branchUuid: '' },
    { vehicleUuid: 'v1', minKm: 1400 },
    TZ,
  );
  assert.equal(bad.body, undefined);
  assert.deepEqual(bad.errors, {
    vehicle: 'validation.same_vehicle',
    branch: 'validation.required',
    in_km: 'validation.km_lower',
    out_km: 'validation.km',
    in_fuel: 'validation.fuel',
    reason: 'validation.reason',
  });
});

test('taskListQuery and taskActions', () => {
  assert.deepEqual(taskListQuery({ filter: 'live', branch: 'b1' }), {
    sort: 'due_at',
    status: 'planned,assigned,en_route,issue_reported',
    branch: 'b1',
  });
  assert.deepEqual(taskListQuery({ filter: 'all', type: 'cleaning', q: 'x', rental: 'r1' }), {
    sort: 'due_at',
    q: 'x',
    task_type: 'cleaning',
    rental: 'r1',
  });
  assert.deepEqual(taskActions({ status: 'planned', task_type: 'cleaning' }, true), {
    start: true,
    assign: true,
    complete: true,
    cancel: true,
  });
  assert.deepEqual(taskActions({ status: 'en_route', task_type: 'handover' }, true), {
    start: false,
    assign: true,
    complete: false,
    cancel: true,
  });
  assert.deepEqual(taskActions({ status: 'completed', task_type: 'cleaning' }, true), {
    start: false,
    assign: false,
    complete: false,
    cancel: false,
  });
  assert.ok(Object.values(taskActions({ status: 'planned', task_type: 'cleaning' }, false)).every((v) => !v));
});

test('isTaskLate only for live tasks past due', () => {
  const now = new Date('2026-10-26T10:00:00Z');
  assert.equal(isTaskLate({ status: 'planned', due_at: '2026-10-26T09:00:00Z' }, now), true);
  assert.equal(isTaskLate({ status: 'completed', due_at: '2026-10-26T09:00:00Z' }, now), false);
  assert.equal(isTaskLate({ status: 'planned', due_at: '2026-10-26T11:00:00Z' }, now), false);
});

test('inspectionListQuery defaults to the review queue', () => {
  assert.deepEqual(inspectionListQuery({ filter: 'review' }), { sort: '-created_at', review_status: 'pending' });
  assert.deepEqual(inspectionListQuery({ filter: 'return', q: '34' }), {
    sort: '-created_at',
    q: '34',
    kind: 'return',
  });
  assert.deepEqual(inspectionListQuery({ filter: 'draft', rental: 'r' }), {
    sort: '-created_at',
    status: 'draft',
    rental: 'r',
  });
  assert.deepEqual(inspectionListQuery({ filter: 'all' }), { sort: '-created_at' });
});

test('media links: only signed API paths or https', () => {
  const api = 'https://api.example.com/';
  assert.equal(
    mediaHref('/v1/public/media/inspections/tok', api),
    'https://api.example.com/v1/public/media/inspections/tok',
  );
  assert.equal(mediaHref('https://cdn.example.com/x.jpg', api), 'https://cdn.example.com/x.jpg');
  assert.equal(mediaHref('http://insecure/x.jpg', api), null);
  assert.equal(mediaHref('tenants/1/inspections/a.jpg', api), null);
  assert.equal(mediaHref('/v1/tenant/inspections/x/photos/y/file', api), null);
  assert.deepEqual(
    mediaMap(
      [
        { uuid: 'a', url: '/v1/public/media/inspections/1' },
        { uuid: 'b', url: 's3://bucket/key' },
      ],
      'http://localhost:8080',
    ),
    { a: 'http://localhost:8080/v1/public/media/inspections/1' },
  );
});

test('photoGroups keeps template order and completed photos only', () => {
  const p = (uuid: string, slot: string, status = 'completed') => ({ uuid, slot, status });
  const ins = {
    template: {
      photo_slots: [
        { key: 'front', label: 'Ön', required: true },
        { key: 'rear', label: 'Arka', required: true },
      ],
    },
    photos: [p('1', 'damage'), p('2', 'rear'), p('3', 'front', 'pending'), p('4', 'front'), p('5', 'rear')],
  } as unknown as Pick<Inspection, 'photos' | 'template'>;
  const groups = photoGroups(ins);
  assert.deepEqual(
    groups.map((g) => [g.slot, g.label, g.photos.map((x) => x.uuid)]),
    [
      ['front', 'Ön', ['4']],
      ['rear', 'Arka', ['2', '5']],
      ['damage', null, ['1']],
    ],
  );
});

test('timesAround starts an hour before the value and keeps every time', () => {
  const t = timesAround('16:25');
  assert.equal(t[0], '15:30');
  assert.equal(t.length, 49);
  assert.equal(t.at(-1), '15:00');
  assert.equal(timesAround('00:00')[0], '00:00');
  assert.equal(timesAround(null)[0], '00:00');
  assert.equal(nextDayOf('2026-12-31'), '2027-01-01');
});
