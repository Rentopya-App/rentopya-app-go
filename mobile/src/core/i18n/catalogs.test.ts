import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

/** The same rule as `npm run i18n:check`: Turkish first, English complete, key for key. */
const dir = path.join(import.meta.dirname, 'locales');
const read = (lang: string, ns: string): Record<string, string> =>
  JSON.parse(fs.readFileSync(path.join(dir, lang, `${ns}.json`), 'utf8'));
const params = (s: string) =>
  [...s.matchAll(/{{\s*(\w+)\s*}}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');
const namespaces = (lang: string) =>
  fs
    .readdirSync(path.join(dir, lang))
    .filter((f) => f.endsWith('.json'))
    .sort();

test('tr and en ship the same namespaces', () => {
  assert.deepEqual(namespaces('tr'), namespaces('en'));
});

for (const file of namespaces('en')) {
  const ns = file.replace(/\.json$/, '');
  test(`${ns}: tr and en have the same keys, params and no empty values`, () => {
    const tr = read('tr', ns);
    const en = read('en', ns);
    assert.deepEqual(Object.keys(tr).sort(), Object.keys(en).sort());
    for (const k of Object.keys(en)) {
      assert.ok(String(tr[k]).trim() && String(en[k]).trim(), `empty value for ${k}`);
      assert.equal(params(tr[k]), params(en[k]), `{{params}} differ for ${k}`);
    }
  });
}
