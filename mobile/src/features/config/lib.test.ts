import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  bandLabel,
  branchQuickRequest,
  channelKey,
  panelUrl,
  SECTION_ROUTES,
  SECTIONS,
  servicePointRequest,
  statusTone,
  stockChanges,
  validateBranchQuick,
  validatePreview,
  validateServicePoint,
  validStock,
  type PreviewValues,
} from './lib.ts';

test('every hub section has a route and a permission', () => {
  for (const s of SECTIONS) {
    assert.ok(SECTION_ROUTES[s.key].startsWith('/config'));
    assert.match(s.perm, /^tenant\./);
  }
});

test('panelUrl opens the section, records only where the panel has a detail page', () => {
  assert.equal(panelUrl('https://p.test/', 'acme', 'matrix'), 'https://p.test/t/acme/pricing/rate-plans/matrix');
  assert.equal(panelUrl('https://p.test', 'acme', 'extras', 'u1'), 'https://p.test/t/acme/pricing/extras/u1');
  assert.equal(panelUrl('https://p.test', 'acme', 'one_way', 'u1'), 'https://p.test/t/acme/fleet/one-way-rules');
});

test('bandLabel and channelKey', () => {
  assert.equal(bandLabel(1, 3), '1–3');
  assert.equal(bandLabel(7, 7), '7');
  assert.equal(bandLabel(30, null), '30+');
  assert.equal(channelKey('web'), 'config_app:channels.web');
  assert.equal(channelKey('unknown'), null);
  assert.equal(channelKey(null), null);
});

test('statusTone', () => {
  assert.equal(statusTone('active'), 'done');
  assert.equal(statusTone('draft'), 'progress');
  assert.equal(statusTone('failing'), 'problem');
  assert.equal(statusTone('inactive'), 'neutral');
});

test('branch quick edit follows the panel schema', () => {
  const ok = { name: ' Merkez ', phone: '0212', email: '', prep_minutes: '60', is_active: true };
  assert.deepEqual(validateBranchQuick(ok), {});
  assert.deepEqual(branchQuickRequest(ok), {
    name: 'Merkez',
    phone: '0212',
    email: '',
    prep_minutes: 60,
    is_active: true,
  });
  const bad = validateBranchQuick({ name: ' ', phone: '', email: 'x@', prep_minutes: '10081', is_active: true });
  assert.equal(bad.name, 'branches:validation.name_required');
  assert.equal(bad.email, 'branches:validation.email');
  assert.equal(bad.prep_minutes, 'branches:validation.prep_minutes');
  assert.equal(validateBranchQuick({ ...ok, prep_minutes: '1.5' }).prep_minutes, 'branches:validation.prep_minutes');
});

test('service point basics', () => {
  const v = {
    name: 'Havalimanı',
    description: '',
    extra_fee: '150,5',
    min_notice_minutes: '',
    online_selectable: true,
    delivery_enabled: false,
    is_active: true,
  };
  assert.deepEqual(validateServicePoint(v), {});
  assert.equal(servicePointRequest(v).extra_fee, '150.5');
  assert.equal(servicePointRequest(v).min_notice_minutes, 0);
  assert.equal(validateServicePoint({ ...v, extra_fee: '1.234' }).extra_fee, 'branches:validation.extra_fee');
  assert.equal(
    validateServicePoint({ ...v, min_notice_minutes: '-1' }).min_notice_minutes,
    'branches:validation.min_notice',
  );
});

test('stock grid keeps only changed rows and flags invalid ones', () => {
  const rows = [
    { branch: { uuid: 'a' }, quantity: 2 },
    { branch: { uuid: 'b' }, quantity: 0 },
    { branch: { uuid: 'c' }, quantity: 5 },
  ];
  const r = stockChanges(rows, { a: '2', b: '4', c: 'x' });
  assert.deepEqual(
    r.items.map((i) => i.branch_uuid),
    ['b', 'c'],
  );
  assert.deepEqual(r.invalid, ['c']);
  assert.ok(validStock('100000'));
  assert.ok(!validStock('100001'));
  assert.ok(!validStock(''));
});

test('preview needs product, branch, channel and a return after pick-up', () => {
  const v: PreviewValues = {
    rental_product_uuid: 'p',
    branch_uuid: 'b',
    channel: 'web',
    start_day: '2026-11-11',
    start_time: '10:00',
    end_day: '2026-11-11',
    end_time: '09:00',
    coupon_code: '',
  };
  assert.equal(validatePreview(v).end_day, 'pricing:validation.end_after_start');
  assert.deepEqual(validatePreview({ ...v, end_day: '2026-11-12' }), {});
  const empty = validatePreview({ ...v, rental_product_uuid: '', branch_uuid: '', channel: '' });
  assert.equal(empty.rental_product_uuid, 'pricing:validation.product');
  assert.equal(empty.branch_uuid, 'pricing:validation.branch');
  assert.equal(empty.channel, 'pricing:validation.channel');
});
