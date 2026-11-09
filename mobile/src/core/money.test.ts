import assert from 'node:assert/strict';
import { test } from 'node:test';

import { amountText, parseAmount } from './money.ts';

test('parseAmount reads Turkish and English decimals', () => {
  assert.equal(parseAmount('1.250,50'), '1250.50');
  assert.equal(parseAmount('1250,5'), '1250.50');
  assert.equal(parseAmount('1250.5'), '1250.50');
  assert.equal(parseAmount(' 40 '), '40.00');
});

test('parseAmount rejects empty, zero and text', () => {
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('0'), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount('-5'), null);
});

test('amountText formats for editing', () => {
  assert.equal(amountText('1250.50', 'tr'), '1250,50');
  assert.equal(amountText('300.00', 'tr'), '300');
  assert.equal(amountText(12.5, 'en'), '12.50');
});
