import assert from 'node:assert/strict';
import { test } from 'node:test';

import { can, canAll, scopedPermissions } from './can.ts';

test('can: any of the slugs', () => {
  const granted = ['tenant.vehicles.read', 'tenant.reservations.read'];
  assert.equal(can(granted, 'tenant.vehicles.read'), true);
  assert.equal(can(granted, 'tenant.vehicles.write', 'tenant.reservations.read'), true);
  assert.equal(can(granted, 'tenant.vehicles.write'), false);
  assert.equal(can([], 'tenant.vehicles.read'), false);
  assert.equal(can(undefined, 'tenant.vehicles.read'), false);
  assert.equal(can(granted), true, 'nothing asked, nothing to refuse');
});

test('canAll: every slug', () => {
  const granted = ['tenant.vehicles.read', 'tenant.vehicles.write'];
  assert.equal(canAll(granted, 'tenant.vehicles.read', 'tenant.vehicles.write'), true);
  assert.equal(canAll(granted, 'tenant.vehicles.read', 'tenant.vehicles.delete'), false);
  assert.equal(canAll(undefined, 'tenant.vehicles.read'), false);
});

test('organization slugs plus account-level ones; platform slugs never apply inside an organization', () => {
  const scoped = scopedPermissions(
    ['tenant.vehicles.read'],
    ['platform.users.read', 'auth.session', 'notifications.read', 'tenant.vehicles.read'],
  );
  assert.deepEqual(scoped.sort(), ['auth.session', 'notifications.read', 'tenant.vehicles.read']);
  assert.equal(can(scoped, 'platform.users.read'), false);
  assert.deepEqual(scopedPermissions(undefined, undefined), []);
});
