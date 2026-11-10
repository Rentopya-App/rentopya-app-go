import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  byAmountDesc,
  channelKey,
  incomeCategoryKey,
  istanbulToday,
  monthLabel,
  percentText,
  periodRange,
  reportQuery,
  share,
} from './lib.ts';

test('istanbulToday uses the Istanbul calendar', () => {
  // 22:30 UTC on 31 Oct is already 1 Nov in Istanbul (UTC+3).
  assert.equal(istanbulToday(new Date('2026-10-31T22:30:00Z')), '2026-11-01');
  assert.equal(istanbulToday(new Date('2026-10-31T20:30:00Z')), '2026-10-31');
});

test('periodRange matches the panel presets', () => {
  const today = '2026-03-15';
  assert.deepEqual(periodRange('this_month', today), { from: '2026-03-01', to: today });
  assert.deepEqual(periodRange('last_month', today), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(periodRange('last_3_months', today), { from: '2026-01-01', to: today });
  assert.deepEqual(periodRange('last_12_months', today), { from: '2025-04-01', to: today });
  assert.deepEqual(periodRange('this_year', today), { from: '2026-01-01', to: today });
  // January: last month is December of the year before.
  assert.deepEqual(periodRange('last_month', '2026-01-10'), { from: '2025-12-01', to: '2025-12-31' });
});

test('reportQuery adds the branch and drops empty keys', () => {
  assert.deepEqual(reportQuery('this_month', null, { group_by: 'branch', party: undefined }, '2026-03-15'), {
    from: '2026-03-01',
    to: '2026-03-15',
    group_by: 'branch',
  });
  assert.equal(reportQuery('this_month', 'b-1', {}, '2026-03-15').branch, 'b-1');
});

test('percentText formats 0-100 values per language', () => {
  assert.equal(percentText(12.5, 'tr'), '%12,5');
  assert.equal(percentText(12.5, 'en'), '12.5%');
  assert.equal(percentText(null, 'tr'), '—');
});

test('monthLabel and labels of known codes', () => {
  assert.equal(monthLabel('bad', 'tr'), 'bad');
  assert.match(monthLabel('2026-03', 'en'), /Mar/);
  assert.equal(channelKey('web'), 'reports:channel.web');
  assert.equal(channelKey('expedia'), null);
  assert.equal(incomeCategoryKey('charge.fuel'), 'reports:income_category.charge.fuel');
  assert.equal(incomeCategoryKey('misc'), null);
});

test('share and byAmountDesc', () => {
  assert.equal(share('50.00', '200.00'), 0.25);
  assert.equal(share('10', '0'), 0);
  assert.equal(share('-5', '10'), 0);
  assert.equal(share('30', '10'), 1);
  const rows = [
    { k: 'a', v: '10.00' },
    { k: 'b', v: '30.00' },
    { k: 'c', v: '10.00' },
  ];
  assert.deepEqual(
    byAmountDesc(rows, (r) => r.v).map((r) => r.k),
    ['b', 'a', 'c'],
  );
});
