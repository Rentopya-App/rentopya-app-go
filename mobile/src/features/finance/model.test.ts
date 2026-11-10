import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseAmount } from '../../core/money.ts';
import {
  cancelReasonText,
  cashHeld,
  cents,
  collectionQuery,
  deductibleCharges,
  depositQuery,
  emptyLine,
  linkCancellable,
  matchPayload,
  refundPayload,
  resolvePayload,
  resolveTotals,
  type ResolveForm,
} from './model.ts';

const form = (over: Partial<ResolveForm> = {}): ResolveForm => ({
  mode: 'release',
  lines: [],
  refundAccountUuid: '',
  captureAccountUuid: '',
  note: '',
  ...over,
});

test('cents rounds API decimals', () => {
  assert.equal(cents('1250.50'), 125050);
  assert.equal(cents('0.1'), 10);
  assert.equal(cents(null), 0);
  assert.equal(cents('x'), 0);
});

test('collectionQuery keeps only set filters, newest first', () => {
  assert.deepEqual(collectionQuery({ q: '  ', method: null, status: null, branch: null }), {
    sort: '-collection_date',
  });
  assert.deepEqual(collectionQuery({ q: ' TH-1 ', method: 'cash', status: 'void', branch: 'b1' }), {
    sort: '-collection_date',
    q: 'TH-1',
    method: 'cash',
    status: 'void',
    branch: 'b1',
  });
});

test('depositQuery maps held over days and the rental link', () => {
  assert.deepEqual(depositQuery({ status: 'held', branch: null, heldOver: 7, rental: 'r1' }), {
    sort: '-created_at',
    status: 'held',
    held_over_days: 7,
    rental: 'r1',
  });
});

test('refundPayload: amount within refundable, reason, account for manual', () => {
  const manual = { refundable: '500.00', payment_uuid: null };
  const f = { amount: '200', reason: 'Fazla alındı', cashAccountUuid: 'acc' };
  assert.deepEqual(refundPayload(manual, f, parseAmount), {
    ok: true,
    body: { amount: '200.00', reason: 'Fazla alındı', cash_account_uuid: 'acc' },
  });
  assert.deepEqual(refundPayload(manual, { ...f, amount: '0' }, parseAmount), { ok: false, error: 'amount' });
  assert.deepEqual(refundPayload(manual, { ...f, amount: '500,01' }, parseAmount), { ok: false, error: 'too_much' });
  assert.deepEqual(refundPayload(manual, { ...f, reason: 'ab' }, parseAmount), { ok: false, error: 'reason' });
  assert.deepEqual(refundPayload(manual, { ...f, cashAccountUuid: '' }, parseAmount), {
    ok: false,
    error: 'cash_account',
  });
  // Online: refunded on the provider, no account.
  assert.deepEqual(
    refundPayload({ refundable: '500.00', payment_uuid: 'p' }, { ...f, cashAccountUuid: '' }, parseAmount),
    {
      ok: true,
      body: { amount: '200.00', reason: 'Fazla alındı' },
    },
  );
});

test('matchPayload needs a reservation and a 3-500 character note', () => {
  assert.deepEqual(matchPayload(null, 'not var'), { ok: false, error: 'reservation' });
  assert.deepEqual(matchPayload('r', ' a '), { ok: false, error: 'note' });
  assert.deepEqual(matchPayload('r', ' Yedekten dönüş '), {
    ok: true,
    body: { reservation_uuid: 'r', note: 'Yedekten dönüş' },
  });
});

test('linkCancellable only while active', () => {
  assert.equal(linkCancellable({ status: 'active' }), true);
  assert.equal(linkCancellable({ status: 'paid' }), false);
});

test('resolvePayload: full release sends no deductions and the refund account for cash', () => {
  const out = resolvePayload(
    { amount: '1000.00', method: 'cash' },
    form({ refundAccountUuid: 'till' }),
    'k1',
    parseAmount,
  );
  assert.deepEqual(out, {
    ok: true,
    body: { idempotency_key: 'k1', deductions: [], refund_cash_account_uuid: 'till' },
  });
  // Pre-auth: no refund account even if one is set.
  const pre = resolvePayload(
    { amount: '1000.00', method: 'online_preauth' },
    form({ refundAccountUuid: 'x' }),
    'k',
    parseAmount,
  );
  assert.ok(pre.ok && pre.body.refund_cash_account_uuid === undefined);
});

test('resolvePayload: deduction lines are validated', () => {
  const d = { amount: '1000.00', method: 'pos_preauth' as const };
  assert.deepEqual(resolvePayload(d, form({ mode: 'deduct' }), 'k', parseAmount), {
    ok: false,
    error: 'no_lines',
    lines: {},
  });
  const bad = resolvePayload(
    d,
    form({
      mode: 'deduct',
      lines: [
        { ...emptyLine('a'), amount: '' },
        { ...emptyLine('b'), amount: '10', chargeUuid: '' },
        { ...emptyLine('c'), amount: '10', appliesTo: 'general', reason: 'x' },
      ],
    }),
    'k',
    parseAmount,
  );
  assert.deepEqual(bad, { ok: false, error: 'lines', lines: { a: 'amount', b: 'charge', c: 'reason' } });
  const over = resolvePayload(
    d,
    form({ mode: 'deduct', lines: [{ ...emptyLine('a'), amount: '1000,01', appliesTo: 'rent', reason: 'Kira' }] }),
    'k',
    parseAmount,
  );
  assert.deepEqual(over, { ok: false, error: 'exceeds', lines: {} });
});

test('resolvePayload: a valid deduction with a POS capture account', () => {
  const out = resolvePayload(
    { amount: '1000.00', method: 'pos_preauth' },
    form({
      mode: 'deduct',
      lines: [{ ...emptyLine('a'), amount: '250,5', chargeUuid: 'ch', reason: ' Çizik ' }],
      captureAccountUuid: 'bank',
      note: ' tamam ',
    }),
    'k',
    parseAmount,
  );
  assert.deepEqual(out, {
    ok: true,
    body: {
      idempotency_key: 'k',
      deductions: [{ amount: '250.50', applies_to: 'charge', reason: 'Çizik', rental_charge_uuid: 'ch' }],
      note: 'tamam',
      capture_cash_account_uuid: 'bank',
    },
  });
});

test('resolveTotals: release deducts nothing', () => {
  const lines = [{ ...emptyLine('a'), amount: '300' }];
  assert.deepEqual(resolveTotals({ amount: '1000' }, { mode: 'deduct', lines }, parseAmount), {
    total: 100000,
    deducted: 30000,
    remainder: 70000,
  });
  assert.equal(resolveTotals({ amount: '1000' }, { mode: 'release', lines }, parseAmount).deducted, 0);
});

test('deductibleCharges keeps approved, positive, not reversed charges', () => {
  const list = deductibleCharges([
    { uuid: '1', status: 'approved', amount: '100' },
    { uuid: '2', status: 'proposed', amount: '100' },
    { uuid: '3', status: 'approved', amount: '-100' },
    { uuid: '4', status: 'approved', amount: '100', reversed: true },
    { uuid: '5', status: 'approved', amount: '100', reversal_of_uuid: 'x' },
  ]);
  assert.deepEqual(
    list.map((c) => c.uuid),
    ['1'],
  );
});

test('cashHeld and cancel reasons', () => {
  assert.equal(cashHeld('cash'), true);
  assert.equal(cashHeld('bank_transfer'), true);
  assert.equal(cashHeld('pos_preauth'), false);
  const t = (k: string) => `T(${k})`;
  assert.equal(cancelReasonText('system:preauth_failed', t), 'T(deposits:cancel_reason.preauth_failed)');
  assert.equal(cancelReasonText('Müşteri vazgeçti', t), 'Müşteri vazgeçti');
});
