import assert from 'node:assert/strict';
import { test } from 'node:test';

import { intentTarget, plateListHref } from './routes.ts';

const on = { signedIn: true, vehicles: true };

test('nothing opens while signed out', () => {
  assert.equal(intentTarget('openToday', {}, { signedIn: false, vehicles: true }), null);
  assert.equal(intentTarget('findVehicle', { plate: '34 ABC 123' }, { signedIn: false, vehicles: true }), null);
});

test('today opens the home tab', () => {
  assert.deepEqual(intentTarget('openToday', {}, on), { kind: 'route', href: '/' });
});

test('a plate is normalized and looked up', () => {
  assert.deepEqual(intentTarget('findVehicle', { plate: ' 34 abc  123 ' }, on), { kind: 'plate', plate: '34 ABC 123' });
  assert.deepEqual(intentTarget('findVehicle', { plate: '34-ABC-123' }, on), { kind: 'plate', plate: '34-ABC-123' });
});

test('free text searches the list; no text opens it', () => {
  assert.deepEqual(intentTarget('findVehicle', { plate: 'beyaz clio' }, on), {
    kind: 'route',
    href: `/vehicles?q=${encodeURIComponent('beyaz clio')}`,
  });
  assert.deepEqual(intentTarget('findVehicle', {}, on), { kind: 'route', href: '/vehicles' });
  assert.deepEqual(intentTarget('findVehicle', { plate: 42 }, on), { kind: 'route', href: '/vehicles' });
});

test('without vehicle access the vehicle search falls back to Today', () => {
  assert.deepEqual(intentTarget('findVehicle', { plate: '34 ABC 123' }, { signedIn: true, vehicles: false }), {
    kind: 'route',
    href: '/',
  });
});

test('unknown actions open nothing', () => {
  assert.equal(intentTarget('toString', {}, on), null);
  assert.equal(plateListHref('34 ABC 1'), '/vehicles?q=34%20ABC%201');
});
