import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  countdown,
  countdownText,
  documentTarget,
  hasAnything,
  kpiChips,
  operationTone,
  overviewKey,
  rentalActions,
  rentalTone,
  reservationTone,
  splitOperations,
  type OverviewOperationItem,
  type TenantOverview,
} from './today-model.ts';

const branch = { uuid: 'b1', code: 'MRK', name: 'Merkez' };

function op(uuid: string, task_type: 'handover' | 'return', due_at: string): OverviewOperationItem {
  return {
    uuid,
    task_type,
    status: 'planned',
    due_at,
    completed_at: null,
    branch,
    rental: { uuid: `r-${uuid}`, reference: `KR-${uuid}` },
    reservation_uuid: `res-${uuid}`,
    plate: '34 ABC 01',
    customer_name: 'Ayşe',
  };
}

function overview(over: Partial<TenantOverview> = {}): TenantOverview {
  return {
    generated_at: '2026-11-09T09:00:00Z',
    today: { start: '2026-11-08T21:00:00Z', end: '2026-11-09T21:00:00Z' },
    branch_scope: 'all',
    branch: null,
    branches: [branch],
    kpis: { occupancy: null, active_rentals: null, collections_today: null },
    today_operations: null,
    overdue_returns: null,
    approvals: null,
    awaiting_payment: null,
    availability_problems: null,
    integration_jobs: null,
    documents: null,
    ...over,
  };
}

test('overview key: one per organization and branch filter', () => {
  assert.deepEqual(overviewKey('acme', null), ['tenant', 'acme', 'overview', 'page', 'all']);
  assert.deepEqual(overviewKey('acme', 'b1'), ['tenant', 'acme', 'overview', 'page', 'b1']);
});

test('operations split into handovers and returns, each by due time', () => {
  const s = splitOperations([
    op('1', 'return', '2026-11-09T15:00:00Z'),
    op('2', 'handover', '2026-11-09T12:00:00Z'),
    op('3', 'handover', '2026-11-09T08:00:00Z'),
  ]);
  assert.deepEqual(
    s.handovers.map((i) => i.uuid),
    ['3', '2'],
  );
  assert.deepEqual(
    s.returns.map((i) => i.uuid),
    ['1'],
  );
  assert.deepEqual(splitOperations(undefined), { handovers: [], returns: [] });
});

test('status tones follow the panel', () => {
  assert.equal(operationTone('completed'), 'done');
  assert.equal(operationTone('issue_reported'), 'problem');
  assert.equal(operationTone('planned'), 'progress');
  assert.equal(operationTone('en_route'), 'neutral');
  assert.equal(rentalTone('active'), 'done');
  assert.equal(rentalTone('return_check'), 'progress');
  assert.equal(rentalTone('cancelled'), 'problem');
  assert.equal(reservationTone('awaiting_payment'), 'progress');
  assert.equal(reservationTone('no_show'), 'problem');
  assert.equal(reservationTone('request'), 'neutral');
});

test('field actions: handover in preparation, return while active, both need write', () => {
  assert.deepEqual(rentalActions('preparation', true), { handover: true, return: false });
  assert.deepEqual(rentalActions('active', true), { handover: false, return: true });
  assert.deepEqual(rentalActions('active', false), { handover: false, return: false });
  assert.deepEqual(rentalActions('returned', true), { handover: false, return: false });
  assert.deepEqual(rentalActions(undefined, true), { handover: false, return: false });
});

test('countdown: late, soon and the split units', () => {
  const now = Date.parse('2026-11-09T12:00:00Z');
  assert.equal(countdown(null, now), null);
  assert.equal(countdown('nope', now), null);
  const late = countdown('2026-11-09T10:45:00Z', now)!;
  assert.deepEqual(late, { late: true, soon: false, days: 0, hours: 1, minutes: 15 });
  assert.deepEqual(countdownText(late), { key: 'time.late_hours', params: { hours: 1, minutes: 15 } });
  const soon = countdown('2026-11-09T12:40:00Z', now)!;
  assert.equal(soon.soon, true);
  assert.deepEqual(countdownText(soon), { key: 'time.left_minutes', params: { minutes: 40 } });
  const far = countdown('2026-11-11T15:00:00Z', now)!;
  assert.deepEqual(countdownText(far), { key: 'time.left_days', params: { days: 2, hours: 3 } });
});

test('KPI chips only for what the API computed (permission gated), in panel order', () => {
  assert.deepEqual(kpiChips(overview(), { approvals: null, resolution_tasks: null }), []);
  const chips = kpiChips(
    overview({
      kpis: {
        occupancy: { rented: 3, rentable: 10, rate: 30 },
        active_rentals: { active: 3, overdue: 1 },
        collections_today: { currency: 'TRY', count: 2, amount: '100.00', refunded: '0.00', net: '100.00' },
      },
      integration_jobs: { total: 4, items: [] },
    }),
    { approvals: { pending: 2, overdue: 0 }, resolution_tasks: { open: 1 } },
  );
  assert.deepEqual(
    chips.map((c) => c.key),
    ['occupancy', 'active', 'collections', 'approvals', 'resolution', 'jobs'],
  );
});

test('nothing to show when every section is null', () => {
  assert.equal(hasAnything(overview()), false);
  assert.equal(hasAnything(overview({ overdue_returns: { total: 0, items: [] } })), true);
});

test('document rows open the rental once it exists', () => {
  const reservation = { uuid: 'res', reference: 'RZ-1', starts_at: '2026-11-09T12:00:00Z' };
  const base = { reservation, pickup_branch: branch, customer_name: 'A', document: null };
  assert.deepEqual(documentTarget({ ...base, rental: null }), { kind: 'reservation', uuid: 'res' });
  assert.deepEqual(documentTarget({ ...base, rental: { uuid: 'r', reference: 'KR-1' } }), {
    kind: 'rental',
    uuid: 'r',
  });
});
