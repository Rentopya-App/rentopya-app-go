import assert from 'node:assert/strict';
import { test } from 'node:test';

import { badgeLabel, dayGroup, dayKey, groupNotifications } from './grouping.ts';
import { linkAction, panelTarget } from './links.ts';

const TZ = 'Europe/Istanbul';
const U = '6F1C2D3E-0000-4000-8000-000000000001';
const u = U.toLowerCase();

test('dayKey uses the Istanbul calendar day', () => {
  assert.equal(dayKey('2026-11-08T21:30:00Z', TZ), '2026-11-09');
  assert.equal(dayKey('2026-11-08T20:30:00Z', TZ), '2026-11-08');
});

test('dayGroup', () => {
  const now = Date.parse('2026-11-09T09:00:00Z');
  assert.equal(dayGroup('2026-11-09T08:00:00Z', now, TZ), 'today');
  assert.equal(dayGroup('2026-11-08T21:10:00Z', now, TZ), 'today');
  assert.equal(dayGroup('2026-11-08T10:00:00Z', now, TZ), 'yesterday');
  assert.equal(dayGroup('2026-11-04T10:00:00Z', now, TZ), 'week');
  assert.equal(dayGroup('2026-11-02T10:00:00Z', now, TZ), 'older');
  // A clock slightly ahead of the server still reads as today.
  assert.equal(dayGroup('2026-11-09T09:00:05Z', now, TZ), 'today');
});

test('groupNotifications keeps order and drops empty sections', () => {
  const now = Date.parse('2026-11-09T09:00:00Z');
  const items = [
    { id: 1, created_at: '2026-11-09T08:00:00Z' },
    { id: 2, created_at: '2026-11-09T07:00:00Z' },
    { id: 3, created_at: '2026-10-01T07:00:00Z' },
    { id: 4, created_at: '2026-11-08T07:00:00Z' },
  ];
  assert.deepEqual(
    groupNotifications(items, now, TZ).map((s) => [s.group, s.data.map((d) => d.id)]),
    [
      ['today', [1, 2]],
      ['yesterday', [4]],
      ['older', [3]],
    ],
  );
  assert.deepEqual(groupNotifications([], now, TZ), []);
});

test('badgeLabel', () => {
  assert.equal(badgeLabel(0), null);
  assert.equal(badgeLabel(undefined), null);
  assert.equal(badgeLabel(7), '7');
  assert.equal(badgeLabel(140), '99+');
});

test('panelTarget maps the screens the app has', () => {
  assert.deepEqual(panelTarget(`/t/acme/rentals/${U}`), {
    slug: 'acme',
    route: `/rentals/${u}`,
    path: `/t/acme/rentals/${U}`,
  });
  assert.deepEqual(panelTarget(`https://app.x.com/t/acme/reservations/${u}?tab=pay`), {
    slug: 'acme',
    route: `/reservations/${u}`,
    path: `/t/acme/reservations/${u}?tab=pay`,
  });
  assert.equal(panelTarget(`/t/acme/field/my/${u}`)?.route, `/field/my/${u}`);
  assert.equal(panelTarget(`/t/acme/fleet/vehicles/${U}?tab=docs`)?.route, `/vehicle/${u}`);
  assert.equal(panelTarget(`/t/acme/customers/${u}`)?.route, null);
  assert.equal(panelTarget('/t/acme/rentals/not-a-uuid')?.route, null);
  assert.equal(panelTarget('/platform/users'), null);
  assert.equal(panelTarget(42), null);
});

test('linkAction opens, switches or falls back to the panel', () => {
  const web = 'https://panel.x.com/';
  const members = [
    { slug: 'acme', status: 'active' },
    { slug: 'beta', status: 'active' },
    { slug: 'gone', status: 'active', access_ends_at: '2020-01-01T00:00:00Z' },
  ];
  assert.deepEqual(linkAction(`/t/acme/rentals/${u}`, 'acme', members, web), { kind: 'open', route: `/rentals/${u}` });
  assert.deepEqual(linkAction(`/t/beta/rentals/${u}`, 'acme', members, web), {
    kind: 'switch',
    slug: 'beta',
    route: `/rentals/${u}`,
  });
  assert.deepEqual(linkAction(`/t/gone/rentals/${u}`, 'acme', members, web), {
    kind: 'web',
    url: `https://panel.x.com/t/gone/rentals/${u}`,
  });
  assert.deepEqual(linkAction(`/t/acme/customers/${u}`, 'acme', members, web), {
    kind: 'web',
    url: `https://panel.x.com/t/acme/customers/${u}`,
  });
  assert.deepEqual(linkAction('https://docs.example.com/a', 'acme', members, web), {
    kind: 'web',
    url: 'https://docs.example.com/a',
  });
  assert.deepEqual(linkAction('/v1/platform/exports/x/download', 'acme', members, web), { kind: 'none' });
  assert.deepEqual(linkAction('', 'acme', members, web), { kind: 'none' });
  assert.deepEqual(linkAction(undefined, 'acme', members, web), { kind: 'none' });
});
