import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseAmount } from '../../core/money.ts';
import { depositPayload, type DepositForm } from './deposit-model.ts';

const form: DepositForm = { method: 'cash', amount: '5.000,00', cashAccountUuid: 'till-1', posReference: '', note: ' ' };

test('cash needs a till and a positive amount', () => {
  assert.deepEqual(depositPayload('r1', form, parseAmount), {
    ok: true,
    body: {
      rental_uuid: 'r1',
      method: 'cash',
      amount: '5000.00',
      cash_account_uuid: 'till-1',
      pos_reference: undefined,
      note: undefined,
    },
  });
  assert.deepEqual(depositPayload('r1', { ...form, cashAccountUuid: '' }, parseAmount), {
    ok: false,
    error: 'cash_account',
  });
  assert.deepEqual(depositPayload('r1', { ...form, amount: '0' }, parseAmount), { ok: false, error: 'amount' });
});

test('a POS provision needs its slip number and no account', () => {
  const pos = { ...form, method: 'pos_preauth' as const, cashAccountUuid: 'ignored' };
  assert.deepEqual(depositPayload('r1', pos, parseAmount), { ok: false, error: 'pos_reference' });
  const ok = depositPayload('r1', { ...pos, posReference: ' 123456 ', note: 'fiş' }, parseAmount);
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.body.cash_account_uuid, undefined);
    assert.equal(ok.body.pos_reference, '123456');
    assert.equal(ok.body.note, 'fiş');
  }
});
