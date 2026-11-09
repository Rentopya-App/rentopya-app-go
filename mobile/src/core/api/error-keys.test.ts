import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { errorKeys } from './error-keys.ts';

const here = import.meta.dirname;
const catalogs = (lang: string) => ({
  errors: JSON.parse(fs.readFileSync(path.join(here, `../../../../frontend/src/locales/${lang}/errors.json`), 'utf8')),
  common: JSON.parse(fs.readFileSync(path.join(here, `../i18n/locales/${lang}/common.json`), 'utf8')),
});

function resolve(lang: string, code: string | undefined, status?: number) {
  const c = catalogs(lang) as Record<string, Record<string, string>>;
  for (const k of errorKeys(code, status)) {
    const [ns, key] = k.split(':');
    if (c[ns]?.[key]) return c[ns][key];
  }
  return undefined;
}

test('code first (panel catalog), then the app codes, then the HTTP status', () => {
  assert.deepEqual(errorKeys('MFA_REQUIRED', 403), [
    'errors:codes.MFA_REQUIRED',
    'common:codes.MFA_REQUIRED',
    'errors:http.403',
  ]);
  assert.deepEqual(errorKeys(undefined, 500), ['errors:http.500']);
  assert.deepEqual(errorKeys(undefined, 0), []);
  assert.deepEqual(errorKeys('NETWORK_ERROR', 0), ['errors:codes.NETWORK_ERROR', 'common:codes.NETWORK_ERROR']);
});

test('every code the sign-in and organization flows show is translated in tr and en', () => {
  const codes = [
    'INVALID_CREDENTIALS',
    'MFA_REQUIRED',
    'INVALID_MFA_CODE',
    'RATE_LIMITED',
    'ACCOUNT_DEACTIVATED',
    'INVALID_ID_TOKEN',
    'OAUTH_ACCOUNT_NOT_LINKED',
    'OAUTH_PROVIDER_DISABLED',
    'INVALID_LINK_TICKET',
    'INVALID_EMAIL_CODE',
    'NO_TENANT_MEMBERSHIP',
    'ORGANIZATION_SUSPENDED',
    'ORGANIZATION_ACCESS_EXPIRED',
    'FEATURE_NOT_ENABLED',
    'NETWORK_ERROR',
  ];
  for (const lang of ['tr', 'en']) {
    for (const code of codes) assert.ok(resolve(lang, code), `${lang}: ${code} has no message`);
  }
  assert.notEqual(resolve('tr', 'INVALID_CREDENTIALS'), resolve('en', 'INVALID_CREDENTIALS'));
});

test('an unknown code falls back to the HTTP status text', () => {
  assert.equal(resolve('tr', 'SOMETHING_NEW', 500), catalogs('tr').errors['http.500']);
});
