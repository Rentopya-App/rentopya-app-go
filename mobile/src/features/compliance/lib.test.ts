import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isTollDecision,
  kabisAlarming,
  kabisEventText,
  kabisListQuery,
  kabisProblemText,
  missingFieldText,
  resolveValid,
  retryToastKey,
  sortCandidates,
  stationText,
  tollActions,
  tollListQuery,
  tollProblemText,
  type TollCandidate,
} from './lib.ts';

const t = (key: string, params?: Record<string, string | number>) =>
  params
    ? `${key}(${Object.entries(params)
        .map(([k, v]) => `${k}=${v}`)
        .join(',')})`
    : key;

test('kabis list query: needs action, status, search', () => {
  assert.deepEqual(kabisListQuery({ q: '  ', filter: 'all' }), { sort: '-occurred_at' });
  assert.deepEqual(kabisListQuery({ q: ' R-1 ', filter: 'needs_action' }), {
    sort: '-occurred_at',
    q: 'R-1',
    needs_action: 'true',
  });
  assert.deepEqual(kabisListQuery({ q: '', filter: 'failed', rental: 'r1' }), {
    sort: '-occurred_at',
    status: 'failed',
    rental: 'r1',
  });
});

test('kabis event text numbers corrections only', () => {
  assert.equal(kabisEventText(t, 'rental_start', 1), 'kabis:events.rental_start');
  assert.equal(kabisEventText(t, 'correction', 2), 'kabis:events.correction #2');
});

test('missing field paths read like the panel', () => {
  assert.equal(
    missingFieldText(t, 'drivers.0.identity_number'),
    'kabis:missing_scope.driver(n=1): kabis:missing.identity_number',
  );
  assert.equal(missingFieldText(t, 'vehicle.plate'), 'kabis:missing_scope.vehicle: kabis:missing.plate');
  assert.equal(missingFieldText(t, 'drivers'), 'kabis:missing.drivers');
  assert.equal(missingFieldText(t, 'unknown.thing'), 'thing');
});

test('kabis problems map codes, data missing lists the fields', () => {
  assert.equal(kabisProblemText(t, { code: 'KABIS_BUSY' }), 'kabis:problems.busy');
  assert.equal(
    kabisProblemText(t, { code: 'KABIS_DATA_MISSING', details: [{ field: 'vehicle.plate' }, { message: 'x' }] }),
    'kabis:problems.data_missing(fields=kabis:missing_scope.vehicle: kabis:missing.plate, x)',
  );
  assert.equal(kabisProblemText(t, { code: 'VALIDATION_ERROR' }), null);
  assert.equal(kabisProblemText(t, null), null);
});

test('retry toast and alarming states', () => {
  assert.equal(retryToastKey('resubmitted'), 'kabis:toast.resubmitted');
  assert.equal(retryToastKey(undefined), 'kabis:toast.retried');
  assert.equal(kabisAlarming('needs_verification'), true);
  assert.equal(kabisAlarming('submitted'), false);
});

test('resolve form needs a reason (3-500) and a reference (1-120)', () => {
  assert.deepEqual(resolveValid('ok', ''), { reason: false, reference: false });
  assert.deepEqual(resolveValid('  fine ', 'ABC-1'), { reason: true, reference: true });
  assert.deepEqual(resolveValid('x'.repeat(501), 'r'.repeat(121)), { reason: false, reference: false });
});

test('toll list query: full list newest first, review queue oldest first', () => {
  assert.deepEqual(tollListQuery({ q: '', filter: 'all', review: false }), { sort: '-passed_at' });
  assert.deepEqual(tollListQuery({ q: '34', filter: 'all', review: true }), {
    sort: 'passed_at',
    q: '34',
    status: 'needs_review,unmatched',
  });
  assert.deepEqual(tollListQuery({ q: '', filter: 'unmatched', review: true }), {
    sort: 'passed_at',
    status: 'unmatched',
  });
});

test('toll actions follow the panel detail header', () => {
  const rental = { uuid: 'r', reference: 'R-1', status: 'active' };
  assert.deepEqual(tollActions({ status: 'needs_review', rental: null }, false), []);
  assert.deepEqual(tollActions({ status: 'needs_review', rental: null }, true), ['assign', 'ignore', 'rematch']);
  assert.deepEqual(tollActions({ status: 'charged', rental }, true), ['reassign', 'unassign', 'ignore', 'rematch']);
  assert.deepEqual(tollActions({ status: 'ignored', rental: null }, true), ['assign', 'rematch']);
  assert.equal(isTollDecision('ignore'), true);
  assert.equal(isTollDecision('assign'), false);
});

test('toll problems and station text', () => {
  assert.equal(
    tollProblemText(t, { details: [{ code: 'not_found', field: 'rental_uuid' }] }),
    'tolls:problems.rental_not_found',
  );
  assert.equal(tollProblemText(t, { details: [{ code: 'already_ignored' }] }), 'tolls:problems.already_ignored');
  assert.equal(tollProblemText(t, { details: [] }), null);
  assert.equal(stationText({ station: 'A', exit_station: '' }), 'A');
  assert.equal(stationText({ station: 'A', exit_station: 'B' }), 'A → B');
});

test('candidates containing the pass come first', () => {
  const c = (uuid: string, contains: boolean, at: string) =>
    ({ uuid, contains_pass: contains, planned_pickup_at: at }) as TollCandidate;
  const out = sortCandidates([c('a', false, '2026-01-01'), c('b', true, '2026-01-03'), c('c', false, '2025-12-01')]);
  assert.deepEqual(
    out.map((x) => x.uuid),
    ['b', 'c', 'a'],
  );
});
