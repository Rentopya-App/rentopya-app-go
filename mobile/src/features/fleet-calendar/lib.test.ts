import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  busyShare,
  calendarWindow,
  intervalKey,
  intervalPath,
  rowEntries,
  segments,
  shiftAnchor,
  weekStart,
  windowDays,
  type FleetCalendarInterval,
} from './lib.ts';

const TZ = 'Europe/Istanbul';

const bar = (
  uuid: string,
  start: string,
  end: string,
  over: Partial<FleetCalendarInterval> = {},
): FleetCalendarInterval => ({
  kind: 'block',
  uuid,
  starts_at: start,
  ends_at: end,
  clip_start: start,
  clip_end: end,
  continues_before: false,
  continues_after: false,
  block: { kind: 'maintenance', reason: '', released_at: null },
  transfer: null,
  allocation: null,
  ...over,
});

test('windows: a day or a Monday-first week, midnights in the organization zone', () => {
  assert.equal(weekStart('2026-11-12'), '2026-11-09');
  assert.equal(weekStart('2026-11-09'), '2026-11-09');
  assert.equal(weekStart('2026-11-15'), '2026-11-09');
  assert.deepEqual(calendarWindow('day', '2026-11-10', TZ), {
    first: '2026-11-10',
    days: 1,
    from: '2026-11-09T21:00:00.000Z',
    to: '2026-11-10T21:00:00.000Z',
  });
  const week = calendarWindow('week', '2026-11-12', TZ);
  assert.equal(week.from, '2026-11-08T21:00:00.000Z');
  assert.equal(week.to, '2026-11-15T21:00:00.000Z');
  assert.equal(windowDays(week).length, 7);
  assert.equal(shiftAnchor('week', '2026-11-12', -1), '2026-11-05');
  assert.equal(shiftAnchor('day', '2026-11-30', 1), '2026-12-01');
});

test('occupancy strip and busy share count overlaps once', () => {
  const w = { from: '2026-11-10T00:00:00.000Z', to: '2026-11-11T00:00:00.000Z' };
  const items = [
    bar('a', '2026-11-10T06:00:00.000Z', '2026-11-10T12:00:00.000Z'),
    bar('b', '2026-11-10T00:00:00.000Z', '2026-11-10T06:00:00.000Z'),
    bar('c', '2026-11-10T09:00:00.000Z', '2026-11-10T18:00:00.000Z'),
  ];
  const s = segments(items, w);
  assert.deepEqual(
    s.map((x) => [x.key, x.start, x.end]),
    [
      ['block-b', 0, 0.25],
      ['block-a', 0.25, 0.5],
      ['block-c', 0.375, 0.75],
    ],
  );
  assert.equal(busyShare(items, w), 0.75);
  assert.equal(busyShare([], w), 0);
});

test('entries in time order with maintenance days; labels and links', () => {
  const transfer = bar('t', '2026-11-10T08:00:00.000Z', '2026-11-10T10:00:00.000Z', {
    kind: 'transfer',
    block: null,
    transfer: {
      status: 'planned',
      planned_departure: '',
      planned_arrival: '',
      actual_departure: null,
      actual_arrival: null,
      from_branch: { uuid: '1', code: 'A', name: 'A' },
      to_branch: { uuid: '2', code: 'B', name: 'B' },
      in_scope: true,
    },
  });
  const block = bar('k', '2026-11-11T08:00:00.000Z', '2026-11-11T10:00:00.000Z');
  const entries = rowEntries({
    intervals: [block, transfer],
    maintenance: [
      {
        uuid: 'm',
        kind: 'planned',
        maintenance_type: 'oil',
        date: '2026-11-10',
        state: 'scheduled',
        planned_km: null,
        done_km: null,
        service_provider: '',
        note: '',
      },
    ],
  });
  assert.deepEqual(
    entries.map((e) => e.key),
    ['m-m', 'transfer-t', 'block-k'],
  );
  assert.equal(intervalKey(block), 'vehicle_blocks:kind.maintenance');
  assert.equal(intervalKey(transfer), 'fleet_calendar:bar.transfer');
  assert.equal(intervalPath(transfer), '/transfers/t');
  assert.equal(intervalPath({ ...transfer, transfer: { ...transfer.transfer!, in_scope: false } }), null);
  assert.equal(intervalPath(block), null);
});
