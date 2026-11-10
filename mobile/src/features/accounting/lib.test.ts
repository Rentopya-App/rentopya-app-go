import assert from 'node:assert/strict';
import { test } from 'node:test';

import { INVOICE_TONES, listQuery, signed } from './lib.ts';

test('listQuery maps search, chip filter and branch', () => {
  assert.deepEqual(listQuery('  ', 'status', 'all'), {});
  assert.deepEqual(listQuery(' ABC ', 'balance_status', 'overdue', 'b1'), {
    q: 'ABC',
    balance_status: 'overdue',
    branch: 'b1',
  });
  assert.deepEqual(listQuery('', 'status', 'needs_action'), { needs_action: 'true' });
});

test('signed and tones', () => {
  assert.equal(signed('100.00', true), '-100.00');
  assert.equal(signed('-100.00', false), '100.00');
  assert.equal(INVOICE_TONES.failed, 'problem');
});
