import assert from 'node:assert/strict';
import { test } from 'node:test';

import { groupHits, searchable, specKey, type SearchHit, type SearchSpec } from './lib.ts';

const hit = (spec: string, id: string): SearchHit => ({ spec, id, title: id, href: `/t/a/${spec}/${id}` });
const spec = (id: string): SearchSpec => ({ id, label_key: `search.specs_${id}`, icon: id });

test('groupHits follows the spec order and keeps ranking', () => {
  const groups = groupHits(
    [hit('customers', 'c1'), hit('vehicles', 'v1'), hit('zzz', 'z1'), hit('customers', 'c2'), hit('vehicles', 'v2')],
    [spec('vehicles'), spec('customers')],
  );
  assert.deepEqual(
    groups.map((g) => [g.spec, g.labelKey, g.hits.map((h) => h.id)]),
    [
      ['vehicles', 'search.specs_vehicles', ['v1', 'v2']],
      ['customers', 'search.specs_customers', ['c1', 'c2']],
      ['zzz', null, ['z1']],
    ],
  );
  assert.deepEqual(groupHits([], undefined), []);
});

test('specKey and searchable', () => {
  assert.equal(specKey('search.specs_vehicles', 'vehicles'), 'specs_vehicles');
  assert.equal(specKey(null, 'branches'), 'specs_branches');
  assert.equal(searchable(' a '), false);
  assert.equal(searchable('ab'), true);
});
