import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  accessBody,
  activeGrant,
  credentialRows,
  durationKey,
  groupPermissions,
  initialScope,
  invitationActions,
  isEmail,
  localized,
  logoProblem,
  maskHint,
  missingKey,
  panelUrl,
  parseMinutes,
  permissionGroupKey,
  roleKeyFromName,
  roleRequest,
  statusTone,
  toggleGroup,
  togglePermission,
  validateAccess,
  validateRole,
} from './lib.ts';

test('panelUrl builds the settings page of the organization', () => {
  assert.equal(panelUrl('https://panel.example/', 'acme', 'roles'), 'https://panel.example/t/acme/settings/roles');
  assert.equal(panelUrl('https://p', 'acme', 'general'), 'https://p/t/acme/settings');
  assert.equal(panelUrl('https://p', 'acme', 'siteArticles', '/u1'), 'https://p/t/acme/settings/site-articles/u1');
});

test('roleKeyFromName folds Turkish letters like the panel', () => {
  assert.equal(roleKeyFromName('Gece Vardiyası'), 'gece_vardiyasi');
  assert.equal(roleKeyFromName('  Şube Yöneticisi! '), 'sube_yoneticisi');
  assert.equal(roleKeyFromName('Çağrı Ürün'), 'cagri_urun');
});

test('validateRole and roleRequest', () => {
  const d = { name: ' ', key: '1x', description: '', permissions: [] };
  assert.deepEqual(validateRole(d, true), { name: 'required', key: 'invalid' });
  assert.deepEqual(validateRole({ ...d, name: 'Ok' }, false), {});
  assert.equal(validateRole({ ...d, name: 'x'.repeat(101), key: '' }, true).name, 'too_long');
  assert.deepEqual(roleRequest({ name: ' A ', key: 'a_b', description: ' d ', permissions: ['b', 'a', 'b'] }, true), {
    name: 'A',
    description: 'd',
    permissions: ['a', 'b'],
    key: 'a_b',
  });
  assert.equal('key' in roleRequest({ name: 'A', key: 'a_b', description: '', permissions: [] }, false), false);
});

test('permission groups and toggles', () => {
  assert.equal(permissionGroupKey('tenant.fleet.read'), 'tenant_fleet');
  assert.equal(permissionGroupKey('notifications.read'), 'notifications');
  const items = [
    { slug: 'tenant.fleet.read', name: 'r' },
    { slug: 'tenant.members.read', name: 'm' },
    { slug: 'tenant.fleet.write', name: 'w' },
  ];
  const groups = groupPermissions(items);
  assert.deepEqual(
    groups.map((g) => [g.key, g.items.length]),
    [
      ['tenant_fleet', 2],
      ['tenant_members', 1],
    ],
  );
  assert.deepEqual(togglePermission(['a'], 'b', true).sort(), ['a', 'b']);
  assert.deepEqual(togglePermission(['a', 'b'], 'a', false), ['b']);
  const fleet = groups[0].items;
  assert.deepEqual(toggleGroup(['tenant.fleet.read'], fleet).sort(), ['tenant.fleet.read', 'tenant.fleet.write']);
  assert.deepEqual(toggleGroup(['tenant.fleet.read', 'tenant.fleet.write', 'x'], fleet), ['x']);
});

test('member access and invitations', () => {
  assert.deepEqual(validateAccess({ roleUuids: [], scope: 'selected', branchUuids: [] }), {
    roles: 'required',
    branches: 'required',
  });
  assert.deepEqual(validateAccess({ roleUuids: ['r'], scope: 'all', branchUuids: [] }), {});
  assert.deepEqual(accessBody({ roleUuids: ['r'], scope: 'all', branchUuids: ['b'] }), {
    role_uuids: ['r'],
    branch_scope: 'all',
  });
  assert.deepEqual(accessBody({ roleUuids: ['r'], scope: 'selected', branchUuids: ['b'] }).branch_uuids, ['b']);
  assert.equal(initialScope('selected', 'all'), 'selected');
  assert.equal(initialScope('all', undefined), 'all');
  assert.equal(initialScope(undefined, 'selected'), 'selected');
  assert.ok(isEmail(' a@b.co '));
  assert.ok(!isEmail('a@b'));
  assert.deepEqual(invitationActions('pending'), { resend: true, revoke: true });
  assert.deepEqual(invitationActions('expired'), { resend: true, revoke: false });
  assert.deepEqual(invitationActions('accepted'), { resend: false, revoke: false });
});

test('support access', () => {
  assert.equal(durationKey(4), 'durations.h4');
  assert.equal(durationKey(72), 'durations.d3');
  const now = Date.parse('2026-11-10T10:00:00Z');
  const grants = [
    { uuid: 'old', status: 'active', expires_at: '2026-11-10T09:00:00Z' },
    { uuid: 'a', status: 'active', expires_at: '2026-11-10T12:00:00Z' },
    { uuid: 'b', status: 'revoked', expires_at: '2026-11-11T12:00:00Z' },
  ];
  assert.equal(activeGrant(grants, now)?.uuid, 'a');
  assert.equal(activeGrant(grants.slice(0, 1), now), null);
});

test('credential hints never show a raw value', () => {
  assert.deepEqual(credentialRows({ secret_key: 'abcdef123456', api_key: '••••9876', empty: '' }), [
    { key: 'api_key', value: '••••9876' },
    { key: 'secret_key', value: '••••3456' },
  ]);
  assert.equal(maskHint('abc'), '••••');
  assert.deepEqual(credentialRows(null), []);
});

test('status tones, settings helpers, logo checks, localized text', () => {
  assert.equal(statusTone('active'), 'done');
  assert.equal(statusTone('pending'), 'progress');
  assert.equal(statusTone('revoked'), 'problem');
  assert.equal(statusTone('expired'), 'neutral');
  assert.equal(parseMinutes(''), null);
  assert.equal(parseMinutes('15'), 15);
  assert.ok(Number.isNaN(parseMinutes('1.5')));
  assert.equal(missingKey('reservation.approval_mode'), 'approval_mode');
  assert.equal(logoProblem({ mimeType: 'image/gif', size: 1 }), 'type');
  assert.equal(logoProblem({ mimeType: 'image/png', size: 3 * 1024 * 1024 }), 'size');
  assert.equal(logoProblem({ mimeType: 'image/png', size: 100 }), null);
  assert.equal(localized({ tr: 'Merhaba', en: 'Hello' }, 'en'), 'Hello');
  assert.equal(localized({ tr: 'Merhaba' }, 'en'), 'Merhaba');
  assert.equal(localized(undefined, 'tr'), '');
});
