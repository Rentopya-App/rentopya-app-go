import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { components } from '../../core/api/schema';

import {
  buildTimeline,
  buildTodaySummary,
  initials,
  MAX_JOBS,
  nextJob,
  serializeSummary,
  signedOutSummary,
  type SummaryInput,
  TIMELINE_STEP_MS,
} from './summary.ts';

type Overview = components['schemas']['TenantOverview'];
type Op = components['schemas']['OverviewOperationItem'];

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}${JSON.stringify(params)}` : key);
const branch = { uuid: 'b1', code: 'MRK', name: 'Merkez' };

function op(uuid: string, task_type: Op['task_type'], due_at: string, extra: Partial<Op> = {}): Op {
  return {
    uuid,
    task_type,
    status: 'planned',
    due_at,
    completed_at: null,
    branch,
    rental: { uuid: `r-${uuid}`, reference: `KR-${uuid}` },
    reservation_uuid: `res-${uuid}`,
    plate: `34 ABC ${uuid}`,
    customer_name: 'Ayşe Yılmaz',
    ...extra,
  };
}

// The organization's day 2026-11-09 (Istanbul, UTC+3): 2026-11-08T21:00Z .. 2026-11-09T21:00Z.
const START = '2026-11-08T21:00:00Z';
const END = '2026-11-09T21:00:00Z';
const NOW = Date.parse('2026-11-09T09:00:00Z');

function overview(items: Op[] | null): Overview {
  return {
    generated_at: '2026-11-09T09:00:00Z',
    today: { start: START, end: END },
    branch_scope: 'all',
    branch: null,
    branches: [],
    kpis: { occupancy: null, active_rentals: null, collections_today: null },
    today_operations: items
      ? {
          total: items.length,
          handovers: { total: 3, done: 1, open: 2 },
          returns: { total: 2, done: 0, open: 2 },
          items,
        }
      : null,
    overdue_returns: null,
    approvals: null,
    awaiting_payment: null,
    availability_problems: null,
    integration_jobs: null,
    documents: null,
  };
}

function input(o: Overview, now = NOW): SummaryInput {
  return {
    overview: o,
    org: 'Mavi Oto',
    branch: null,
    now,
    time: (iso) => new Date(iso).toISOString().slice(11, 16),
    date: (at) => new Date(at.getTime() + 3 * 3600_000).toISOString().slice(0, 10),
    day: (d) => `day ${d}`,
    t,
  };
}

test('initials: first and last word, Turkish upper case, never the full name', () => {
  assert.equal(initials('Ayşe Yılmaz'), 'AY');
  assert.equal(initials('  ali  '), 'A');
  assert.equal(initials('çağrı öz şen'), 'ÇŞ');
  assert.equal(initials('ismail'), 'İ');
  assert.equal(initials('- Ömer 2'), 'Ö');
  assert.equal(initials(''), '');
  assert.equal(initials(null), '');
});

test('summary carries the Today counts and the open jobs by due time', () => {
  const s = buildTodaySummary(
    input(
      overview([
        op('3', 'return', '2026-11-09T14:00:00Z'),
        op('1', 'handover', '2026-11-09T07:00:00Z', { status: 'completed' }),
        op('2', 'handover', '2026-11-09T08:30:00Z', { customer_name: '' }),
      ]),
    ),
  );
  assert.equal(s.v, 1);
  assert.equal(s.state, 'ok');
  assert.equal(s.date, '2026-11-09');
  assert.equal(s.dayEnd, Date.parse(END));
  assert.deepEqual(s.handovers, { total: 3, done: 1 });
  assert.deepEqual(s.returns, { total: 2, done: 0 });
  assert.deepEqual(
    s.jobs.map((j) => [j.id, j.type, j.time, j.initials]),
    [
      ['r-2', 'handover', '08:30', ''],
      ['r-3', 'return', '14:00', 'AY'],
    ],
  );
  assert.match(s.jobs[0].say, /^say\.job_handover_anon/);
  assert.match(s.jobs[1].say, /^say\.job_return\{/);
  assert.equal(nextJob(s)?.id, 'r-2');
  assert.match(s.texts.summary, /"handovers":3,"handoversDone":1,"returns":2,"returnsDone":0/);
  // No full customer name anywhere in what the widget and Siri get.
  assert.ok(!JSON.stringify(s).includes('Yılmaz'));
});

test('jobs are capped', () => {
  const items = Array.from({ length: MAX_JOBS + 4 }, (_, i) =>
    op(String(i).padStart(2, '0'), 'return', `2026-11-09T1${i % 10}:00:00Z`),
  );
  assert.equal(buildTodaySummary(input(overview(items))).jobs.length, MAX_JOBS);
});

test('no today_operations (role cannot see them): noAccess, no jobs', () => {
  const s = buildTodaySummary(input(overview(null)));
  assert.equal(s.state, 'noAccess');
  assert.deepEqual(s.jobs, []);
  assert.equal(nextJob(s), undefined);
});

test('signed out: nothing of the account remains', () => {
  const s = signedOutSummary(t, NOW);
  assert.equal(s.state, 'signedOut');
  assert.equal(s.org, '');
  assert.deepEqual(s.jobs, []);
  assert.equal(nextJob(s), undefined);
});

test('serialize: round trips, and the key ignores the write time', () => {
  const o = overview([op('1', 'handover', '2026-11-09T12:00:00Z')]);
  const a = serializeSummary(buildTodaySummary(input(o, NOW)));
  const b = serializeSummary(buildTodaySummary(input(o, NOW + 60_000)));
  assert.equal(a.key, b.key);
  assert.notEqual(a.json, b.json);
  assert.equal(JSON.parse(a.json).jobs[0].id, 'r-1');
  const c = serializeSummary(buildTodaySummary(input(overview([op('1', 'return', '2026-11-09T12:00:00Z')]), NOW)));
  assert.notEqual(a.key, c.key);
});

test('timeline: now, every 15 minutes and each due time until the day ends, then the day end', () => {
  const s = buildTodaySummary(input(overview([op('1', 'handover', '2026-11-09T12:07:00Z')])));
  const entries = buildTimeline(s, NOW);
  const times = entries.map((e) => e.date.getTime());
  assert.equal(times[0], NOW);
  assert.equal(times.at(-1), Date.parse(END));
  assert.ok(times.includes(Date.parse('2026-11-09T12:07:00Z')));
  assert.ok(times.includes(NOW + TIMELINE_STEP_MS));
  assert.deepEqual(
    times,
    [...times].sort((x, y) => x - y),
  );
  assert.equal(new Set(times).size, times.length);
  // 12 hours left: 48 steps plus the due time (now and the day end included).
  assert.equal(entries.length, 48 + 1 + 1);
});

test('timeline: a signed-out or past day summary is a single entry', () => {
  assert.equal(buildTimeline(signedOutSummary(t, NOW), NOW).length, 1);
  const s = buildTodaySummary(input(overview([])));
  assert.equal(buildTimeline(s, Date.parse(END) + 1).length, 1);
});
