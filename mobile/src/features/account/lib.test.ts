import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  describeUserAgent,
  groupSecret,
  isCodeReady,
  lastOwnerOrganizations,
  normalizeCode,
  parseOtpauth,
} from './lib.ts';

test('parseOtpauth reads the setup URI', () => {
  const o = parseOtpauth(
    'otpauth://totp/Rentopya:ayse%40example.com?secret=jbswy3dpehpk3pxp&issuer=Rentopya&period=30',
  );
  assert.deepEqual(o, {
    type: 'totp',
    account: 'ayse@example.com',
    issuer: 'Rentopya',
    secret: 'JBSWY3DPEHPK3PXP',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
});

test('parseOtpauth takes the issuer from the label and defaults', () => {
  const o = parseOtpauth('otpauth://totp/Acme%3A%20ali?secret=GEZDGNBV&algorithm=sha256&digits=8');
  assert.equal(o?.issuer, 'Acme');
  assert.equal(o?.account, 'ali');
  assert.equal(o?.algorithm, 'SHA256');
  assert.equal(o?.digits, 8);
  assert.equal(o?.period, 30);
});

test('parseOtpauth rejects other strings and bad secrets', () => {
  assert.equal(parseOtpauth(''), null);
  assert.equal(parseOtpauth(null), null);
  assert.equal(parseOtpauth('https://example.com'), null);
  assert.equal(parseOtpauth('otpauth://totp/x?issuer=a'), null);
  assert.equal(parseOtpauth('otpauth://totp/x?secret=not-base32!'), null);
});

test('groupSecret and codes', () => {
  assert.equal(groupSecret('JBSWY3DPEHPK3PXP'), 'JBSW Y3DP EHPK 3PXP');
  assert.equal(groupSecret('ABCDE'), 'ABCD E');
  assert.equal(normalizeCode(' 123 456 '), '123456');
  assert.equal(isCodeReady('123 45'), false);
  assert.equal(isCodeReady('123 456'), true);
  assert.equal(isCodeReady('abcd-efgh'), true);
});

test('describeUserAgent names the app, browsers and unknowns', () => {
  assert.deepEqual(describeUserAgent('RentopyaMobile/0.3.1 (ios)'), { kind: 'app', label: 'Rentopya 0.3.1 · iOS' });
  assert.deepEqual(
    describeUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
    ),
    { kind: 'desktop', label: 'Chrome · Windows' },
  );
  assert.deepEqual(
    describeUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    ),
    { kind: 'mobile', label: 'Safari · iOS' },
  );
  assert.deepEqual(describeUserAgent(''), { kind: 'unknown', label: null });
  assert.deepEqual(describeUserAgent('curl/8.0'), { kind: 'unknown', label: 'curl/8.0' });
});

test('lastOwnerOrganizations lists the organizations of the 409', () => {
  assert.deepEqual(
    lastOwnerOrganizations([
      { field: 'organization', message: 'Acme Rent', code: 'acme' },
      { field: 'organization', message: '', code: 'beta' },
      { field: 'other', message: 'x' },
    ]),
    [
      { name: 'Acme Rent', slug: 'acme' },
      { name: 'beta', slug: 'beta' },
    ],
  );
  assert.deepEqual(lastOwnerOrganizations(undefined), []);
});
