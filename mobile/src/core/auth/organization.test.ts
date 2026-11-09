import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isUsable, type KV, type MeOrganization, organizationPreference, pickOrganization } from './organization.ts';

const NOW = Date.parse('2026-11-09T12:00:00Z');

function org(slug: string, extra: Partial<MeOrganization> = {}): MeOrganization {
  return {
    uuid: `uuid-${slug}`,
    slug,
    name: slug.toUpperCase(),
    status: 'active',
    role: { key: 'owner', name: 'Owner' },
    permissions: [],
    plan: { code: 'complete', name: 'Komple' },
    features: [],
    ...extra,
  };
}

function memoryKV(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getString: (k) => data.get(k),
    set: (k, v) => void data.set(k, v),
    remove: (k) => void data.delete(k),
  };
}

test('restores the remembered organization while it is still a membership', () => {
  const orgs = [org('acme'), org('beta')];
  assert.equal(pickOrganization(orgs, 'beta', NOW)?.slug, 'beta');
});

test('several memberships and nothing remembered: the picker asks', () => {
  assert.equal(pickOrganization([org('acme'), org('beta')], null, NOW), null);
});

test('one usable membership is picked on its own', () => {
  assert.equal(pickOrganization([org('acme')], null, NOW)?.slug, 'acme');
  assert.equal(pickOrganization([org('acme'), org('beta', { status: 'suspended' })], null, NOW)?.slug, 'acme');
});

test('a removed membership falls back (to the only one left, else the picker)', () => {
  assert.equal(pickOrganization([org('beta')], 'acme', NOW)?.slug, 'beta');
  assert.equal(pickOrganization([org('beta'), org('gamma')], 'acme', NOW), null);
  assert.equal(pickOrganization([], 'acme', NOW), null);
  assert.equal(pickOrganization(undefined, 'acme', NOW), null);
});

test('a suspended or expired organization is never restored', () => {
  const orgs = [org('acme', { status: 'suspended' }), org('beta', { access_ends_at: '2026-11-01T00:00:00Z' })];
  assert.equal(pickOrganization(orgs, 'acme', NOW), null);
  assert.equal(pickOrganization(orgs, 'beta', NOW), null);
  assert.equal(isUsable(org('x', { access_ends_at: '2027-01-01T00:00:00Z' }), NOW), true);
  assert.equal(isUsable(org('x', { access_ends_at: null }), NOW), true);
});

test('the choice persists in the key-value store and can be cleared', () => {
  const kv = memoryKV();
  const pref = organizationPreference(kv);
  assert.equal(pref.get(), null);
  pref.set('acme');
  // A relaunch reads the same store.
  assert.equal(organizationPreference(kv).get(), 'acme');
  assert.equal(pickOrganization([org('acme'), org('beta')], organizationPreference(kv).get(), NOW)?.slug, 'acme');
  pref.clear();
  assert.equal(pref.get(), null);
});
