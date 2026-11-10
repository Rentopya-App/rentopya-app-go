import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Permission } from '../../core/auth/permission-slugs.ts';
import {
  availableActions,
  driversBody,
  endsAfterStart,
  eventKey,
  extendsLater,
  initialDrivers,
  isConfirmOnly,
  isDestructive,
  linkActions,
  listQuery,
  paymentActions,
  primaryAction,
  requestActions,
  reservationProblem,
  resolveNoteValid,
  slaState,
  smsUrl,
  taskActions,
  timeOptions,
  toggleDriver,
  wallClock,
  type ReservationActionFlags,
} from './lib.ts';

const none: ReservationActionFlags = {
  submit: false,
  approve: false,
  reject: false,
  confirm: false,
  cancel: false,
  no_show: false,
  change: false,
  extend: false,
  plate: false,
};
const all =
  (...slugs: string[]) =>
  (s: string) =>
    slugs.includes(s);
const everyone = all(
  Permission.TenantReservationsWrite,
  Permission.TenantReservationsApprove,
  Permission.TenantReservationsConfirm,
  Permission.TenantReservationsCancel,
);

test('a request waiting for staff: accept and reject with approve, cancel with cancel', () => {
  const flags = { ...none, approve: true, reject: true, cancel: true };
  assert.deepEqual(availableActions(flags, everyone), ['approve', 'reject', 'drivers', 'assign', 'cancel']);
  assert.deepEqual(availableActions(flags, all(Permission.TenantReservationsRead)), []);
  assert.deepEqual(availableActions(flags, all(Permission.TenantReservationsCancel)), ['cancel']);
});

test('a confirmed reservation: change, extend, plate, staff, no-show and cancel', () => {
  const flags = { ...none, change: true, extend: true, plate: true, no_show: true, cancel: true };
  assert.deepEqual(availableActions(flags, everyone), [
    'change',
    'extend',
    'plate',
    'drivers',
    'assign',
    'no_show',
    'cancel',
  ]);
  // Write alone: no cancel / no-show (they need `tenant.reservations.cancel`).
  assert.deepEqual(availableActions(flags, all(Permission.TenantReservationsWrite)), [
    'change',
    'extend',
    'plate',
    'drivers',
    'assign',
  ]);
});

test('awaiting payment: confirm needs the confirm permission, submit needs write', () => {
  const flags = { ...none, submit: true, confirm: true };
  assert.deepEqual(availableActions(flags, all(Permission.TenantReservationsConfirm)), ['confirm']);
  assert.deepEqual(availableActions(flags, all(Permission.TenantReservationsWrite)), ['submit', 'drivers', 'assign']);
});

test('primary action and kinds', () => {
  assert.equal(primaryAction(['approve', 'reject', 'confirm']), 'approve');
  assert.equal(primaryAction(['submit', 'confirm']), 'confirm');
  assert.equal(primaryAction(['change', 'cancel']), null);
  assert.ok(isDestructive('cancel') && isDestructive('no_show') && isDestructive('reject'));
  assert.ok(!isDestructive('plate'));
  assert.ok(isConfirmOnly('submit') && isConfirmOnly('confirm') && !isConfirmOnly('approve'));
});

test('payments section mirrors the panel: link while payable, collect while open, both need a balance', () => {
  const perms = all(
    Permission.TenantPaymentsRead,
    Permission.TenantPaymentsCreateLink,
    Permission.TenantPaymentCollect,
  );
  assert.deepEqual(paymentActions({ status: 'awaiting_payment', price: { balance: '500.00' } }, perms), {
    read: true,
    createLink: true,
    collect: true,
  });
  assert.deepEqual(paymentActions({ status: 'awaiting_review', price: { balance: '500.00' } }, perms), {
    read: true,
    createLink: false,
    collect: true,
  });
  assert.deepEqual(paymentActions({ status: 'confirmed', price: { balance: '0.00' } }, perms), {
    read: true,
    createLink: false,
    collect: false,
  });
  assert.deepEqual(paymentActions({ status: 'cancelled', price: { balance: '10.00' } }, perms).collect, false);
  assert.deepEqual(paymentActions({ status: 'confirmed', price: { balance: '10.00' } }, all()), {
    read: false,
    createLink: false,
    collect: false,
  });
});

test('payment links: send while active, cancel needs create_link', () => {
  const link = all(Permission.TenantPaymentsCreateLink);
  assert.deepEqual(linkActions({ status: 'active' }, link), { send: true, cancel: true });
  assert.deepEqual(linkActions({ status: 'active' }, all()), { send: true, cancel: false });
  assert.deepEqual(linkActions({ status: 'paid' }, link), { send: false, cancel: false });
});

test('sms link per platform', () => {
  assert.equal(smsUrl('a b', 'ios'), 'sms:&body=a%20b');
  assert.equal(smsUrl('a b', 'android'), 'sms:?body=a%20b');
});

test('approval SLA', () => {
  const now = Date.parse('2026-11-09T10:00:00Z');
  assert.deepEqual(slaState(null, now), { kind: 'none' });
  assert.deepEqual(slaState('2026-11-09T09:50:00Z', now), { kind: 'overdue', minutes: 10 });
  assert.deepEqual(slaState('2026-11-09T11:30:00Z', now), { kind: 'left', hours: 1, minutes: 30, soon: false });
  assert.deepEqual(slaState('2026-11-09T10:10:00Z', now), { kind: 'left', hours: 0, minutes: 10, soon: true });
});

test('list query leaves empty filters out', () => {
  assert.deepEqual(listQuery({ q: '  ', status: 'all', payment: 'all', sort: '-created_at', branch: null }), {
    sort: '-created_at',
  });
  assert.deepEqual(listQuery({ q: '34ABC', status: 'confirmed', payment: 'unpaid', sort: 'starts_at', branch: 'b1' }), {
    sort: 'starts_at',
    q: '34ABC',
    status: 'confirmed',
    payment_status: 'unpaid',
    branch: 'b1',
  });
});

test('tasks and customer requests act only while open, with write', () => {
  const tw = all(Permission.TenantResolutionTasksWrite);
  assert.deepEqual(taskActions({ status: 'open' }, tw), { replan: true, assign: true, resolve: true });
  assert.deepEqual(taskActions({ status: 'resolved' }, tw), { replan: false, assign: false, resolve: false });
  assert.deepEqual(taskActions({ status: 'open' }, all()), { replan: false, assign: false, resolve: false });
  const rw = all(Permission.TenantReservationsWrite);
  assert.deepEqual(requestActions({ status: 'open' }, rw), { resolve: true, reject: true });
  assert.deepEqual(requestActions({ status: 'rejected' }, rw), { resolve: false, reject: false });
  assert.ok(resolveNoteValid('resolved', ''));
  assert.ok(!resolveNoteValid('rejected', 'no'));
  assert.ok(resolveNoteValid('rejected', 'Uygun araç yok'));
});

test('wall clock and time options in Istanbul', () => {
  assert.deepEqual(wallClock('2026-11-09T07:15:00Z', 'Europe/Istanbul'), { day: '2026-11-09', time: '10:15' });
  assert.deepEqual(wallClock('2026-11-09T22:30:00Z', 'Europe/Istanbul'), { day: '2026-11-10', time: '01:30' });
  const times = timeOptions('10:15');
  assert.ok(times.includes('10:15') && times.includes('00:00') && times.includes('23:30'));
  assert.deepEqual(times, [...times].sort());
  assert.equal(timeOptions('10:00').filter((x) => x === '10:00').length, 1);
});

test('date checks', () => {
  assert.ok(extendsLater('2026-11-12T10:00:00Z', '2026-11-11T10:00:00Z'));
  assert.ok(!extendsLater('2026-11-11T10:00:00Z', '2026-11-11T10:00:00Z'));
  assert.ok(!extendsLater(null, '2026-11-11T10:00:00Z'));
  assert.ok(endsAfterStart('2026-11-11T10:00:00Z', '2026-11-12T10:00:00Z'));
  assert.ok(!endsAfterStart('2026-11-12T10:00:00Z', '2026-11-11T10:00:00Z'));
});

test('drivers pick: initial state, toggle hands primary over, body', () => {
  const pick = initialDrivers([
    { driver_uuid: 'a', role: 'primary' },
    { driver_uuid: 'b', role: 'additional' },
    { driver_uuid: null, role: 'additional' },
  ]);
  assert.deepEqual(pick, { selected: ['a', 'b'], primary: 'a' });
  const removed = toggleDriver(pick, 'a');
  assert.deepEqual(removed, { selected: ['b'], primary: 'b' });
  assert.deepEqual(toggleDriver({ selected: [], primary: '' }, 'c'), { selected: ['c'], primary: 'c' });
  assert.deepEqual(driversBody(pick), {
    drivers: [
      { driver_uuid: 'a', role: 'primary' },
      { driver_uuid: 'b', role: 'additional' },
    ],
    eligibility_override: null,
  });
  assert.deepEqual(driversBody(pick, 'Müdür onayı').eligibility_override, { reason: 'Müdür onayı' });
});

test('problems of a refused call', () => {
  assert.deepEqual(reservationProblem('EXTENSION_CONFLICT', null), { kind: 'extension', alternatives: null });
  assert.deepEqual(reservationProblem('CAPACITY_UNAVAILABLE', null, [{ code: 'blocked' }]), {
    kind: 'capacity',
    reason: 'blocked',
  });
  assert.deepEqual(reservationProblem('DRIVER_NOT_ELIGIBLE', 'x'), { kind: 'drivers', drivers: [] });
  assert.equal(reservationProblem('QUOTE_PRICE_CHANGED', null).kind, 'price_changed');
  assert.equal(reservationProblem('VALIDATION_ERROR', null).kind, 'other');
});

test('timeline labels', () => {
  assert.equal(eventKey('approved'), 'events.approve');
  assert.equal(eventKey('plate_changed'), 'events.plate_changed');
  assert.equal(eventKey('something_new'), null);
});
