import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  consentRequest,
  contactRequest,
  customerFormDefaults,
  customerRequest,
  dayText,
  documentContentType,
  documentFileName,
  driverFormDefaults,
  driverRequest,
  fileTooLarge,
  identityError,
  isValidEmail,
  isValidPhone,
  isValidTCKN,
  isValidVKN,
  NO_IDENTITY,
  parseDay,
  secondsLeft,
  splitTags,
  validateConsent,
  validateContact,
  validateCustomer,
  validateDriver,
  validateEligibility,
  validReason,
  type CustomerFormValues,
  type StoredCustomer,
} from './lib.ts';

const TCKN = '10000000146';
const VKN = '1234567890';

test('TCKN / VKN checksums mirror the API', () => {
  assert.equal(isValidTCKN(TCKN), true);
  assert.equal(isValidTCKN('10000000147'), false);
  assert.equal(isValidTCKN('00000000146'), false);
  assert.equal(isValidVKN(VKN), true);
  assert.equal(isValidVKN('1234567891'), false);
});

test('identityError: length, checksum and passport shape', () => {
  assert.equal(identityError('tckn', '123'), 'customers:validation.tckn_length');
  assert.equal(identityError('tckn', '10000000147'), 'customers:validation.tckn_checksum');
  assert.equal(identityError('tckn', '100 000 001 46'), null);
  assert.equal(identityError('vkn', '12345'), 'customers:validation.vkn_length');
  assert.equal(identityError('vkn', VKN), null);
  assert.equal(identityError('passport', 'U12'), 'customers:validation.passport');
  assert.equal(identityError('passport', 'U 1234-567'), null);
});

test('isValidPhone: national, +90 and international numbers', () => {
  for (const ok of [
    '',
    '0532 123 45 67',
    '532 123 45 67',
    '+90 532 123 45 67',
    '905321234567',
    '+49 30 1234567',
    '0049 30 1234567',
  ])
    assert.equal(isValidPhone(ok), true, ok);
  for (const bad of ['0532 123', '+90 532 123', 'abc', '05321234567890']) assert.equal(isValidPhone(bad), false, bad);
});

test('isValidEmail and splitTags', () => {
  assert.equal(isValidEmail(''), true);
  assert.equal(isValidEmail('a@b.co'), true);
  assert.equal(isValidEmail('a@b'), false);
  assert.deepEqual(splitTags('VIP, filo; Filo ,  ,Kara liste'), ['VIP', 'filo', 'Kara liste']);
});

test('parseDay / dayText: typed days to ISO and back', () => {
  assert.equal(parseDay(''), '');
  assert.equal(parseDay('15.04.1990'), '1990-04-15');
  assert.equal(parseDay('5/4/1990'), '1990-04-05');
  assert.equal(parseDay('1990-04-15'), '1990-04-15');
  assert.equal(parseDay('31.02.1990'), null);
  assert.equal(parseDay('29.02.2024'), '2024-02-29');
  assert.equal(parseDay('15.13.1990'), null);
  assert.equal(parseDay('1990'), null);
  assert.equal(dayText('1990-04-15'), '15.04.1990');
  assert.equal(dayText(null), '');
});

const stored: StoredCustomer = {
  customer_type: 'individual',
  first_name: 'Ayşe',
  last_name: 'Yılmaz',
  company_title: '',
  identity_type: 'tckn',
  nationality: 'TR',
  tax_office: '',
  billing: {
    address: 'Adres',
    city: 'İzmir',
    district: 'Konak',
    postal_code: '35000',
    country: 'TR',
    e_invoice: false,
  },
  tags: ['VIP'],
  note: 'not',
};

test('validateCustomer: required names / title, identity rules, contact checks', () => {
  const v = customerFormDefaults();
  assert.equal(v.identity_type, 'tckn');
  assert.equal(v.nationality, 'TR');
  const e = validateCustomer(v, 'create', false);
  assert.equal(e.first_name, 'customers:validation.required');
  assert.equal(e.last_name, 'customers:validation.required');
  assert.equal(e.identity_number, 'customers:validation.required');

  const corp: CustomerFormValues = {
    ...v,
    customer_type: 'corporate',
    identity_type: 'passport',
    identity_number: 'U1234567',
  };
  const ce = validateCustomer(corp, 'create', false);
  assert.equal(ce.company_title, 'customers:validation.required');
  assert.equal(ce.identity_type, 'customers:validation.identity_type');

  const passport: CustomerFormValues = {
    ...v,
    first_name: 'A',
    last_name: 'B',
    identity_type: 'passport',
    identity_number: 'U1234567',
    nationality: '',
    phone: '123',
    email: 'x',
    tags: 'a'.repeat(41),
  };
  const pe = validateCustomer(passport, 'create', false);
  assert.equal(pe.nationality, 'customers:validation.nationality_passport');
  assert.equal(pe.phone, 'customers:validation.phone');
  assert.equal(pe.email, 'customers:validation.email');
  assert.equal(pe.tags, 'customers:validation.tag_length');

  // On edit an empty number keeps the stored one.
  const edit = customerFormDefaults(stored);
  assert.deepEqual(validateCustomer(edit, 'edit', true), {});
});

test('customerRequest: write-only values only when typed', () => {
  const edit = customerFormDefaults(stored);
  const body = customerRequest(edit, 'edit', stored);
  assert.equal('identity_number' in body, false);
  assert.equal('phone' in body, false);
  assert.equal('email' in body, false);
  assert.deepEqual(body.tags, ['VIP']);

  const cleared = customerRequest({ ...edit, identity_type: NO_IDENTITY }, 'edit', stored);
  assert.equal(cleared.identity_number, '');

  const typed = customerRequest({ ...edit, identity_number: ` ${TCKN} `, phone: '0532 123 45 67' }, 'edit', stored);
  assert.equal(typed.identity_type, 'tckn');
  assert.equal(typed.identity_number, TCKN);
  assert.equal(typed.phone, '0532 123 45 67');

  const corp = customerRequest(
    { ...customerFormDefaults(), customer_type: 'corporate', company_title: ' ACME ', first_name: 'x' },
    'create',
  );
  assert.equal(corp.company_title, 'ACME');
  assert.equal(corp.first_name, '');
  assert.equal(corp.phone, '');
  assert.equal(corp.email, '');
});

test('contacts: name required, phone / e-mail kept on edit when empty', () => {
  const v = { full_name: ' ', title: '', phone: '1', email: 'x', is_primary: false, note: '' };
  assert.deepEqual(Object.keys(validateContact(v)).sort(), ['email', 'full_name', 'phone']);
  const ok = { ...v, full_name: 'Ali Veli', phone: '', email: '' };
  assert.equal('phone' in contactRequest(ok, true), false);
  assert.equal(contactRequest(ok, false).phone, '');
});

test('drivers: licence and date rules, self copy and keep-on-edit body', () => {
  const v = driverFormDefaults(null, false);
  assert.equal(v.licence_class, 'B');
  const e = validateDriver({
    ...v,
    birth_date: '01.01.2000',
    licence_issued_on: '01.01.1999',
    licence_expires_on: '01.01.1998',
    licence_number: 'AB1',
  });
  assert.equal(e.first_name, 'customers:validation.required');
  assert.equal(e.licence_number, 'customers:validation.licence');
  assert.equal(e.licence_expires_on, 'customers:validation.licence_dates');
  assert.equal(e.licence_issued_on, 'customers:validation.licence_before_birth');
  assert.equal(validateDriver({ ...v, birth_date: '32.01.2000' }).birth_date, 'customers_app:validation.day');

  const self = driverFormDefaults(null, true);
  assert.equal(self.copy_from_customer, true);
  assert.deepEqual(validateDriver(self), {});
  const selfBody = driverRequest({ ...self, birth_date: '15.04.1990', licence_number: 'TR 123456' }, null);
  assert.equal(selfBody.copy_from_customer, true);
  assert.equal(selfBody.birth_date, '1990-04-15');
  assert.equal(selfBody.licence_number, 'TR 123456');
  assert.equal('first_name' in selfBody, false);

  const stored = {
    first_name: 'Ali',
    last_name: 'Veli',
    birth_date: '1990-04-15',
    identity_type: 'tckn' as const,
    nationality: 'TR',
    licence_class: 'B',
    licence_issued_on: '2010-01-01',
    licence_expires_on: null,
    licence_country: 'TR',
    note: '',
  };
  const edit = driverFormDefaults(stored, false);
  assert.equal(edit.birth_date, '15.04.1990');
  const body = driverRequest(edit, stored);
  assert.equal('phone' in body, false);
  assert.equal('licence_number' in body, false);
  assert.equal('identity_number' in body, false);
  assert.equal(body.licence_issued_on, '2010-01-01');
  assert.equal(body.licence_expires_on, null);
  assert.equal(driverRequest({ ...edit, identity_type: 'none' }, stored).identity_number, '');
});

test('eligibility thresholds, consent rule and body', () => {
  assert.deepEqual(validateEligibility('21', '1'), {});
  assert.deepEqual(Object.keys(validateEligibility('x', '1000')).sort(), ['min_driver_age', 'min_license_years']);
  const v = { source: 'counter' as const, text_version: ' ', date: '', note: '' };
  assert.equal(validateConsent(v, true).text_version, 'customers:validation.required');
  assert.deepEqual(validateConsent(v, false), {});
  assert.equal(consentRequest('sms', 'grant', { ...v, date: '2026-01-05' }).at, '2026-01-05T12:00:00+03:00');
  assert.equal(consentRequest('sms', 'withdraw', v).at, null);
});

test('document files: accepted types, name and size', () => {
  assert.equal(documentContentType('image/jpeg', 'x'), 'image/jpeg');
  assert.equal(documentContentType('image/jpg', 'x'), 'image/jpeg');
  assert.equal(documentContentType(null, 'photo.PNG'), 'image/png');
  assert.equal(documentContentType('', 'scan.pdf'), 'application/pdf');
  assert.equal(documentContentType('image/heic', 'IMG_1.heic'), null);
  assert.equal(documentContentType('video/mp4', 'a.jpg'), null);
  assert.equal(documentFileName('driving_licence', 'image/jpeg', 1_700_000_000_000), 'driving_licence-1700000000.jpg');
  assert.equal(documentFileName('Kimlik kartı', 'image/png', 1000), 'kimlik-karti-1.png');
  assert.equal(fileTooLarge(10 * 1024 * 1024), false);
  assert.equal(fileTooLarge(10 * 1024 * 1024 + 1), true);
  assert.equal(fileTooLarge(null), false);
});

test('reveal window and reason', () => {
  assert.equal(secondsLeft(10_500, 10_000), 1);
  assert.equal(secondsLeft(70_000, 10_000), 60);
  assert.equal(secondsLeft(5_000, 10_000), 0);
  assert.equal(validReason('ab'), false);
  assert.equal(validReason('  kimlik kontrolü '), true);
  assert.equal(validReason('x'.repeat(501)), false);
});

test('every i18n key the rules return exists in the catalogs', () => {
  const root = path.join(import.meta.dirname, '../../..');
  const read = (p: string) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8')) as Record<string, string>;
  const catalogs: Record<string, Record<string, string>> = {
    customers: read('../frontend/src/locales/tr/customers.json'),
    customers_app: read('src/core/i18n/locales/tr/customers_app.json'),
  };
  const src = fs.readFileSync(path.join(import.meta.dirname, 'lib.ts'), 'utf8');
  const keys = [...src.matchAll(/'(customers(?:_app)?):([a-z_.]+)'/g)];
  assert.ok(keys.length > 10);
  for (const [, ns, key] of keys) assert.ok(key in catalogs[ns], `${ns}:${key}`);
});
