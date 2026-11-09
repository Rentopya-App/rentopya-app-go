import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  type FieldTask,
  inspectionPath,
  isLate,
  mapsUrl,
  mineQuery,
  personName,
  placeText,
  primaryStep,
  problemKey,
  telUrl,
  typeKey,
} from './lib.ts';

const branch = { uuid: 'b', code: 'MRK', name: 'Merkez' };
const loc = (over: Partial<FieldTask['location']> = {}): FieldTask['location'] => ({
  kind: 'branch',
  point: null,
  address: '',
  district: '',
  city: '',
  latitude: null,
  longitude: null,
  ...over,
});

test('open tasks of today include the late ones; other days are one day in the organization zone', () => {
  const today = mineQuery('2026-11-09', '2026-11-09', 'live', 'Europe/Istanbul');
  assert.equal(today.status, 'planned,assigned,en_route,issue_reported');
  assert.equal(today.due_from, undefined);
  assert.equal(today.due_to, '2026-11-09T21:00:00.000Z');
  assert.equal(today.sort, 'due_at');

  const tomorrow = mineQuery('2026-11-10', '2026-11-09', 'live', 'Europe/Istanbul');
  assert.equal(tomorrow.due_from, '2026-11-09T21:00:00.000Z');
  assert.equal(tomorrow.due_to, '2026-11-10T21:00:00.000Z');

  const done = mineQuery('2026-11-09', '2026-11-09', 'completed', 'Europe/Istanbul');
  assert.equal(done.status, 'completed');
  assert.equal(done.due_from, '2026-11-08T21:00:00.000Z');
  assert.equal(mineQuery('2026-11-09', '2026-11-09', 'all', null).status, undefined);
});

test('late only while the task is still to do', () => {
  const now = new Date('2026-11-09T10:00:00Z');
  assert.equal(isLate({ status: 'assigned', due_at: '2026-11-09T09:00:00Z' }, now), true);
  assert.equal(isLate({ status: 'completed', due_at: '2026-11-09T09:00:00Z' }, now), false);
  assert.equal(isLate({ status: 'planned', due_at: '2026-11-09T11:00:00Z' }, now), false);
});

test('place text: address, point, branch', () => {
  assert.equal(
    placeText({
      branch,
      location: loc({ kind: 'address', address: 'Atatürk Cd. 5', district: 'Muratpaşa', city: 'Antalya' }),
    }),
    'Atatürk Cd. 5, Muratpaşa, Antalya',
  );
  assert.equal(
    placeText({
      branch,
      location: loc({ kind: 'point', point: { uuid: 'p', name: 'AYT Havalimanı', type: 'airport' } }),
    }),
    'AYT Havalimanı · MRK',
  );
  assert.equal(placeText({ branch, location: loc() }), 'MRK · Merkez');
});

test('maps link per platform, coordinates first', () => {
  const withCoords = { branch, location: loc({ kind: 'address', address: 'A 1', latitude: 36.9, longitude: 30.7 }) };
  assert.equal(mapsUrl(withCoords, 'ios'), 'https://maps.apple.com/?ll=36.9,30.7&q=A%201');
  assert.equal(mapsUrl(withCoords, 'android'), 'geo:36.9,30.7?q=36.9,30.7(A%201)');
  assert.equal(mapsUrl(withCoords, 'web'), 'https://www.google.com/maps/search/?api=1&query=36.9,30.7');
  const text = { branch, location: loc({ kind: 'address', address: 'A 1' }) };
  assert.equal(mapsUrl(text, 'ios'), 'https://maps.apple.com/?q=A%201');
  assert.equal(mapsUrl(text, 'android'), 'geo:0,0?q=A%201');
  // A branch task without coordinates has no place to search for.
  assert.equal(mapsUrl({ branch, location: loc() }, 'ios'), null);
});

test('tel link keeps digits and the leading plus', () => {
  assert.equal(telUrl('+90 (532) 111 22 33'), 'tel:+905321112233');
});

test('person name falls back to the e-mail', () => {
  assert.equal(personName({ name: 'Ali', surname: 'Kaya', email: 'a@x' }), 'Ali Kaya');
  assert.equal(personName({ name: '', surname: '', email: 'a@x' }), 'a@x');
  assert.equal(personName(null), '');
});

test('inspection route and the main step', () => {
  const rental = { uuid: 'r1', reference: 'K-1', status: 'active' };
  assert.equal(inspectionPath({ inspection: 'handover', rental }), '/field/handover/r1');
  assert.equal(inspectionPath({ inspection: 'return', rental }), '/field/return/r1');
  assert.equal(inspectionPath({ inspection: 'handover', rental: null }), null);
  assert.equal(inspectionPath({ inspection: '', rental }), null);

  assert.equal(primaryStep({ actions: ['start', 'inspection'], inspection: 'handover', rental }), 'start');
  assert.equal(primaryStep({ actions: ['inspection', 'report_issue'], inspection: 'handover', rental }), 'inspection');
  assert.equal(primaryStep({ actions: ['inspection', 'complete'], inspection: 'handover', rental: null }), 'complete');
  assert.equal(primaryStep({ actions: ['report_issue'], inspection: '', rental: null }), null);
});

test('type label: delivery and collection for handover / return away from the branch', () => {
  assert.equal(typeKey({ task_type: 'handover', delivery: true }), 'types.delivery');
  assert.equal(typeKey({ task_type: 'return', delivery: true }), 'types.collection');
  assert.equal(typeKey({ task_type: 'return', delivery: false }), 'types.return');
  assert.equal(typeKey({ task_type: 'cleaning', delivery: true }), 'types.cleaning');
});

test('problem key of the first known detail code', () => {
  assert.equal(problemKey([{ code: 'x' }, { code: 'record_handover' }]), 'problems.record_handover');
  assert.equal(problemKey([{ code: 'unknown' }]), null);
  assert.equal(problemKey(undefined), null);
});
