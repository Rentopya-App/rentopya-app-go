import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pushAction, pushTarget } from './links.ts';

const id = '0b6f3c1e-8a52-4f0e-9a51-6d3f5c2b1a90';

test('panel paths map to the app screens', () => {
  assert.deepEqual(pushTarget(`/t/acme/field/my/${id}`), { slug: 'acme', route: `/field/my/${id}` });
  assert.deepEqual(pushTarget(`/t/acme/fleet/vehicles/${id}`), { slug: 'acme', route: `/vehicle/${id}` });
  assert.deepEqual(pushTarget(`/t/acme/rentals/${id}`), { slug: 'acme', route: `/rentals/${id}` });
  assert.deepEqual(pushTarget(`/t/acme/reservations/${id}`), { slug: 'acme', route: `/reservations/${id}` });
});

test('the organization home and unknown pages open the home tab', () => {
  assert.deepEqual(pushTarget('/t/acme'), { slug: 'acme', route: '/' });
  assert.deepEqual(pushTarget('/t/acme/'), { slug: 'acme', route: '/' });
  assert.deepEqual(pushTarget('/t/acme/invoices/' + id), { slug: 'acme', route: '/' });
  assert.deepEqual(pushTarget('/t/acme/rentals'), { slug: 'acme', route: '/' });
  assert.deepEqual(pushTarget('/t/acme/rentals/not-a-uuid'), { slug: 'acme', route: '/' });
  assert.deepEqual(pushTarget(`/t/acme/rentals/${id}/edit`), { slug: 'acme', route: '/' });
});

test('absolute links, queries and encoded slugs', () => {
  assert.deepEqual(pushTarget(`https://panel.example.com/t/acme/rentals/${id}?tab=payments#x`), {
    slug: 'acme',
    route: `/rentals/${id}`,
  });
  assert.deepEqual(pushTarget(`/t/ac%20me/reservations/${id.toUpperCase()}`), {
    slug: 'ac me',
    route: `/reservations/${id}`,
  });
  assert.equal(pushTarget('/t/%E0%A4%A/rentals'), null);
});

test('anything that is not a company panel link opens nothing', () => {
  assert.equal(pushTarget(undefined), null);
  assert.equal(pushTarget(42), null);
  assert.equal(pushTarget(''), null);
  assert.equal(pushTarget('/t/'), null);
  assert.equal(pushTarget('/platform/exports/x'), null);
  assert.equal(pushTarget('/r/acme'), null);
});

test('a target in another organization switches first, when that membership is usable', () => {
  const orgs = [
    { slug: 'acme', status: 'active', access_ends_at: null },
    { slug: 'beta', status: 'active', access_ends_at: null },
    { slug: 'old', status: 'active', access_ends_at: '2020-01-01T00:00:00Z' },
    { slug: 'off', status: 'suspended', access_ends_at: null },
  ];
  const rental = `/rentals/${id}`;
  assert.deepEqual(pushAction({ slug: 'acme', route: rental }, 'acme', orgs), { kind: 'open', route: rental });
  assert.deepEqual(pushAction({ slug: 'beta', route: rental }, 'acme', orgs), {
    kind: 'switch',
    slug: 'beta',
    route: rental,
  });
  assert.deepEqual(pushAction({ slug: 'beta', route: rental }, null, orgs), { kind: 'switch', slug: 'beta', route: rental });
  assert.deepEqual(pushAction({ slug: 'old', route: rental }, 'acme', orgs), { kind: 'home' });
  assert.deepEqual(pushAction({ slug: 'off', route: rental }, 'acme', orgs), { kind: 'home' });
  assert.deepEqual(pushAction({ slug: 'gone', route: rental }, 'acme', orgs), { kind: 'home' });
  assert.deepEqual(pushAction(null, 'acme', orgs), { kind: 'home' });
});
