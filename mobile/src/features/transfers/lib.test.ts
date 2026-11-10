import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  actionRequest,
  createRequest,
  instantIso,
  instantOf,
  patchRequest,
  transferActions,
  transferQuery,
  validateTransfer,
  type TransferValues,
} from './lib.ts';

const TZ = 'Europe/Istanbul';

const plan = (over: Partial<TransferValues> = {}): TransferValues => ({
  vehicle_uuid: 'v1',
  from_branch_uuid: '',
  to_branch_uuid: 'b2',
  responsible_user_uuid: '',
  planned_departure: '2026-11-10T07:00:00.000Z',
  planned_arrival: '2026-11-10T10:00:00.000Z',
  cost: '',
  note: '',
  ...over,
});

test('list query: open by default, one status, every status, branch direction', () => {
  assert.deepEqual(transferQuery({ q: '  34 ABC ', status: 'open', branch: null, direction: 'from' }), {
    sort: '-planned_departure',
    q: '34 ABC',
    status: 'planned,in_transit',
  });
  assert.deepEqual(transferQuery({ q: '', status: 'all', branch: 'b1', direction: 'to' }), {
    sort: '-planned_departure',
    to_branch: 'b1',
  });
  assert.deepEqual(transferQuery({ q: '', status: 'completed', branch: 'b1', direction: 'from' }), {
    sort: '-planned_departure',
    status: 'completed',
    from_branch: 'b1',
  });
  assert.deepEqual(transferQuery({ q: '', status: 'all', branch: 'b1', direction: 'any' }), {
    sort: '-planned_departure',
  });
});

test('actions follow the panel row menu', () => {
  assert.deepEqual(transferActions({ status: 'planned' }), ['start', 'edit', 'cancel']);
  assert.deepEqual(transferActions({ status: 'in_transit' }), ['complete', 'edit', 'cancel']);
  assert.deepEqual(transferActions({ status: 'completed' }), ['edit']);
  assert.deepEqual(transferActions({ status: 'cancelled' }), []);
});

test('validation mirrors the panel schema; a started transfer only checks the cost', () => {
  assert.deepEqual(validateTransfer(plan(), false), {});
  assert.deepEqual(validateTransfer(plan({ vehicle_uuid: '', to_branch_uuid: '' }), false), {
    vehicle_uuid: 'transfers:validation.vehicle',
    to_branch_uuid: 'transfers:validation.to',
  });
  assert.equal(
    validateTransfer(plan({ from_branch_uuid: 'b2' }), false).to_branch_uuid,
    'transfers:validation.same_branch',
  );
  assert.equal(
    validateTransfer(plan({ planned_arrival: '2026-11-10T07:00:00.000Z' }), false).planned_arrival,
    'transfers:validation.arrival_after_departure',
  );
  assert.equal(validateTransfer(plan({ cost: '12,345' }), false).cost, 'transfers:validation.cost');
  assert.deepEqual(validateTransfer(plan({ cost: '1250,5' }), false), {});
  assert.deepEqual(validateTransfer(plan({ vehicle_uuid: '', to_branch_uuid: '' }), true), {});
});

test('requests: auto origin left out, comma cost, started patch only cost and note', () => {
  const body = createRequest(plan({ cost: '1250,50', note: '  yol ', responsible_user_uuid: 'u1' }));
  assert.equal('from_branch_uuid' in body, false);
  assert.equal(body.cost, '1250.50');
  assert.equal(body.note, 'yol');
  assert.equal(body.responsible_user_uuid, 'u1');
  assert.equal(createRequest(plan()).responsible_user_uuid, null);
  assert.deepEqual(patchRequest(plan({ cost: '', note: 'x' }), true), { cost: null, note: 'x' });
  const replan = patchRequest(plan({ from_branch_uuid: 'b1' }), false);
  assert.equal('vehicle_uuid' in replan, false);
  assert.equal(replan.from_branch_uuid, 'b1');
});

test('action bodies: time only when given, arrival status on complete, cancel has no time', () => {
  const v = { at: '2026-11-10T08:00:00.000Z', arrival_status: 'available' as const, note: ' ok ' };
  assert.deepEqual(actionRequest('start', v), { at: v.at, note: 'ok' });
  assert.deepEqual(actionRequest('complete', { ...v, at: '' }), { arrival_status: 'available', note: 'ok' });
  assert.deepEqual(actionRequest('cancel', v), { note: 'ok' });
});

test('instants round up to the half hour in the organization zone and back', () => {
  const i = instantOf(new Date('2026-11-09T21:10:00Z'), TZ);
  assert.deepEqual(i, { day: '2026-11-10', time: '00:30' });
  assert.equal(instantIso(i, TZ), '2026-11-09T21:30:00.000Z');
  assert.equal(instantIso(null, TZ), '');
});
