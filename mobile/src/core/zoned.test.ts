import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dayTimes, zonedIso } from './zoned.ts';

test('zonedIso converts Istanbul wall time to UTC', () => {
  assert.equal(zonedIso('2026-10-26', '09:30', 'Europe/Istanbul'), '2026-10-26T06:30:00.000Z');
  assert.equal(zonedIso('2026-01-01', '00:00', 'Europe/Istanbul'), '2025-12-31T21:00:00.000Z');
});

test('zonedIso follows daylight saving', () => {
  assert.equal(zonedIso('2026-07-01', '12:00', 'Europe/Berlin'), '2026-07-01T10:00:00.000Z');
  assert.equal(zonedIso('2026-12-01', '12:00', 'Europe/Berlin'), '2026-12-01T11:00:00.000Z');
});

test('dayTimes steps through the day', () => {
  const times = dayTimes(8, 9, 30);
  assert.deepEqual(times, ['08:00', '08:30', '09:00']);
});
