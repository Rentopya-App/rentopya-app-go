import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clientLabel, isQrSessionId, locationLabel, parseQrLogin, qrProblem, secondsLeft } from './lib.ts';

const ID = 'Zm9vYmFyYmF6cXV4Zm9vYmFyYmF6cXV4Zm9vYmFyYmF';

test('session id format', () => {
  assert.equal(ID.length, 43);
  assert.equal(isQrSessionId(ID), true);
  assert.equal(isQrSessionId(ID.slice(1)), false);
  assert.equal(isQrSessionId(`${ID.slice(1)}+`), false);
});

test('parseQrLogin reads panel links, the app scheme and bare ids', () => {
  assert.equal(parseQrLogin(`https://app.rentopya.com/login/qr/${ID}`), ID);
  assert.equal(parseQrLogin(`https://app.rentopya.com/login/qr/${ID}/`), ID);
  assert.equal(parseQrLogin(`https://app.rentopya.com/login/qr/${ID}?utm=x#y`), ID);
  assert.equal(parseQrLogin(`http://localhost:3000/panel/login/qr/${ID}`), ID);
  assert.equal(parseQrLogin(`rentopya://login/qr/${ID}`), ID);
  assert.equal(parseQrLogin(`  ${ID}  `), ID);
  assert.equal(parseQrLogin(`/login/qr/${ID}`), ID);
});

test('parseQrLogin rejects other codes', () => {
  assert.equal(parseQrLogin(''), null);
  assert.equal(parseQrLogin(null), null);
  assert.equal(parseQrLogin('rentopya://vehicle/6f1c2d3e-0000-4000-8000-000000000001'), null);
  assert.equal(parseQrLogin(`https://app.rentopya.com/login/qr/${ID}/extra`), null);
  assert.equal(parseQrLogin('https://app.rentopya.com/login/qr/short'), null);
  assert.equal(parseQrLogin('34 ABC 123'), null);
});

test('labels', () => {
  assert.equal(
    clientLabel({ browser: 'Chrome', browser_version: '128', os: 'Windows', device_type: 'desktop', user_agent: 'x' }),
    'Chrome 128 · Windows',
  );
  assert.equal(
    clientLabel({ browser: '', browser_version: '', os: '', device_type: 'desktop', user_agent: 'ua' }),
    'ua',
  );
  assert.equal(locationLabel(null), null);
  assert.equal(
    locationLabel({ city: 'Kadıköy', region: 'İstanbul', country: 'Turkey', country_code: 'TR' }),
    'Kadıköy, İstanbul, Turkey',
  );
  assert.equal(locationLabel({ country_code: 'TR' }), 'TR');
  assert.equal(locationLabel({ city: 'Istanbul', region: 'Istanbul' }), 'Istanbul');
  assert.equal(locationLabel({}), null);
});

test('secondsLeft and problems', () => {
  const now = Date.parse('2026-11-09T10:00:00Z');
  assert.equal(secondsLeft('2026-11-09T10:01:30Z', now), 90);
  assert.equal(secondsLeft('2026-11-09T09:59:00Z', now), 0);
  assert.equal(secondsLeft('nope', now), 0);
  assert.equal(qrProblem('QR_SESSION_NOT_FOUND'), 'expired');
  assert.equal(qrProblem('QR_SESSION_CLAIMED'), 'claimed');
  assert.equal(qrProblem('QR_SESSION_RESOLVED'), 'resolved');
  assert.equal(qrProblem('ACCOUNT_DEACTIVATED'), 'forbidden');
  assert.equal(qrProblem(undefined, 404), 'expired');
  assert.equal(qrProblem('RATE_LIMITED'), 'rate_limited');
  assert.equal(qrProblem('INTERNAL_ERROR', 500), 'other');
});
