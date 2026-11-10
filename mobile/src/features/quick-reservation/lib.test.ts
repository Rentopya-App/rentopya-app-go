import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Permission } from '../../core/auth/permission-slugs.ts';
import {
  canHold,
  capacityProblem,
  capacityReasonKey,
  createBody,
  createProblem,
  defaultRange,
  discountBlocked,
  holdActions,
  holdMinutesValid,
  modes,
  NO_DISCOUNT,
  pickable,
  quoteBody,
  reachable,
  searchError,
  searchRequest,
  type SearchForm,
} from './lib.ts';

const TZ = 'Europe/Istanbul';
const all = () => true;
const none = () => false;
const only =
  (...slugs: string[]) =>
  (s: string) =>
    slugs.includes(s);

const form: SearchForm = {
  pickup: 'b1',
  ret: '',
  startDay: '2026-11-12',
  startTime: '10:00',
  endDay: '2026-11-14',
  endTime: '10:00',
};

test('defaultRange: +24 h / +72 h, rounded up to the quarter hour in Istanbul', () => {
  // 2026-11-10 08:07 UTC = 11:07 Istanbul
  const r = defaultRange(TZ, Date.UTC(2026, 10, 10, 8, 7));
  assert.deepEqual(r.start, { day: '2026-11-11', time: '11:15' });
  assert.deepEqual(r.end, { day: '2026-11-13', time: '11:15' });
  // 23:50 Istanbul rolls over to the next day
  const late = defaultRange(TZ, Date.UTC(2026, 10, 10, 20, 50));
  assert.deepEqual(late.start, { day: '2026-11-12', time: '00:00' });
});

test('searchRequest: Istanbul wall clock to UTC, return defaults to pick-up, branch channel', () => {
  assert.deepEqual(searchRequest(form, TZ), {
    pickup_branch_uuid: 'b1',
    return_branch_uuid: 'b1',
    starts_at: '2026-11-12T07:00:00.000Z',
    ends_at: '2026-11-14T07:00:00.000Z',
    channel: 'branch',
  });
  assert.equal(searchRequest({ ...form, ret: 'b2' }, TZ)?.return_branch_uuid, 'b2');
});

test('searchError: pick-up required, end after start', () => {
  assert.equal(searchError({ ...form, pickup: '' }, TZ), 'pickup');
  assert.equal(searchError({ ...form, endDay: '2026-11-12' }, TZ), 'ends_after_start');
  assert.equal(searchError(form, TZ), null);
  assert.equal(searchRequest({ ...form, pickup: '' }, TZ), null);
});

test('holdMinutesValid: whole minutes 1 … 1440', () => {
  assert.equal(holdMinutesValid('30'), true);
  assert.equal(holdMinutesValid('1440'), true);
  assert.equal(holdMinutesValid('0'), false);
  assert.equal(holdMinutesValid('1441'), false);
  assert.equal(holdMinutesValid('2.5'), false);
  assert.equal(holdMinutesValid(''), false);
});

test('holds: hold permission and capacity / active status', () => {
  assert.equal(canHold({ sellable: 1 }, only(Permission.TenantAvailabilityHold)), true);
  assert.equal(canHold({ sellable: 0 }, all), false);
  assert.equal(canHold({ sellable: 3 }, none), false);
  assert.deepEqual(holdActions({ status: 'active' }, all), { extend: true, release: true });
  assert.deepEqual(holdActions({ status: 'expired' }, all), { extend: false, release: false });
  assert.deepEqual(holdActions({ status: 'active' }, none), { extend: false, release: false });
});

test('capacityProblem: reason from details, alternatives from data', () => {
  const alt = { products: [], times: [] };
  assert.deepEqual(capacityProblem('CAPACITY_UNAVAILABLE', alt, [{ code: 'channel_rules' }]), {
    reason: 'channel_rules',
    alternatives: alt,
  });
  assert.deepEqual(capacityProblem('CAPACITY_UNAVAILABLE', undefined, []), {
    reason: 'no_vehicle',
    alternatives: null,
  });
  assert.equal(capacityProblem('VALIDATION_ERROR', null), null);
  assert.equal(capacityReasonKey('weird'), 'availability:capacity_reason.no_vehicle');
});

test('reachable: each step needs the earlier choices', () => {
  const s = { search: true, product: false, customer: false, quote: false };
  assert.equal(reachable('product', s), true);
  assert.equal(reachable('customer', s), false);
  assert.equal(reachable('discount', { ...s, product: true, customer: true }), true);
  assert.equal(reachable('summary', s), false);
});

test('pickable: sellable with a price', () => {
  const price = { currency: 'TRY', billing_days: 2, daily_average: '1', total: '2', prepayment: '0' };
  assert.equal(pickable({ sellable: 1, price }), true);
  assert.equal(pickable({ sellable: 0, price }), false);
  assert.equal(pickable({ sellable: 1, price: null }), false);
});

test('quoteBody: coupon wins; manual discount only with discount.apply', () => {
  const search = searchRequest(form, TZ)!;
  const manual = { ...NO_DISCOUNT, value: '10,5', reason: 'loyal customer' };
  const withPerm = quoteBody(search, 'p1', 'c1', manual, only(Permission.TenantDiscountApply));
  assert.deepEqual(withPerm.manual_discount, { kind: 'percent', value: '10.5', reason: 'loyal customer' });
  assert.equal(withPerm.product_uuid, 'p1');
  assert.equal(withPerm.customer_uuid, 'c1');
  assert.equal(quoteBody(search, 'p1', 'c1', manual, none).manual_discount, null);
  const coupon = quoteBody(search, 'p1', 'c1', { ...manual, coupon: ' yaz26 ' }, all);
  assert.equal(coupon.coupon_code, 'YAZ26');
  assert.equal(coupon.manual_discount, null);
});

test('discountBlocked: a manual discount needs a 3+ character reason', () => {
  assert.equal(discountBlocked({ ...NO_DISCOUNT, value: '5', reason: 'ok' }, all), true);
  assert.equal(discountBlocked({ ...NO_DISCOUNT, value: '5', reason: 'okay' }, all), false);
  assert.equal(discountBlocked({ ...NO_DISCOUNT, value: '5', reason: '' }, none), false);
});

test('modes: confirm now needs reservations.confirm', () => {
  assert.deepEqual(modes(none), ['standard', 'request_only']);
  assert.deepEqual(modes(only(Permission.TenantReservationsConfirm)), ['standard', 'request_only', 'confirm_now']);
});

test('createBody: drivers with roles, mode flags, override', () => {
  const body = createBody({
    quoteUuid: 'q1',
    customerUuid: 'c1',
    drivers: { selected: ['d1', 'd2'], primary: 'd2' },
    mode: 'confirm_now',
    note: '  ',
    externalReference: ' X-1 ',
    override: 'manager ok',
  });
  assert.deepEqual(body.drivers, [
    { driver_uuid: 'd1', role: 'additional' },
    { driver_uuid: 'd2', role: 'primary' },
  ]);
  assert.equal(body.confirm_now, true);
  assert.equal(body.request_only, false);
  assert.equal(body.note, undefined);
  assert.equal(body.external_reference, 'X-1');
  assert.deepEqual(body.eligibility_override, { reason: 'manager ok' });
});

test('createProblem: codes to next steps, coupon detail', () => {
  assert.equal(createProblem('QUOTE_EXPIRED', null).kind, 'quote_expired');
  assert.equal(createProblem('CREDIT_LIMIT_EXCEEDED', null).kind, 'credit_limit');
  assert.deepEqual(createProblem('CAPACITY_UNAVAILABLE', null, [{ code: 'no_vehicle' }]), {
    kind: 'capacity',
    reason: 'no_vehicle',
  });
  assert.deepEqual(
    createProblem('VALIDATION_ERROR', null, [{ field: 'coupon_code', code: 'coupon_expired', message: 'expired' }]),
    { kind: 'coupon', message: 'expired' },
  );
  assert.equal(createProblem('SOMETHING', null).kind, 'other');
});
