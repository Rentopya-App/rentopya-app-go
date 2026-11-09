import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatDateTime, localizeInstants } from './date-format.ts';

const ymd: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };

test('formatDateTime formats in the given zone', () => {
  assert.equal(formatDateTime('en-CA', { ...ymd, timeZone: 'Europe/Istanbul' }, '2026-10-26T22:30:00Z'), '2026-10-27');
  assert.equal(formatDateTime('en-CA', { ...ymd, timeZone: 'UTC' }, '2026-10-26T22:30:00Z'), '2026-10-26');
});

test('formatDateTime renders missing or invalid timestamps as empty', () => {
  for (const v of [null, undefined, '', 'not-a-date']) assert.equal(formatDateTime('tr-TR', ymd, v), '');
});

test('formatDateTime falls back to the organization zone for a null or unknown zone', () => {
  const at = '2026-10-26T22:30:00Z';
  const tz = (timeZone: unknown) => ({ ...ymd, timeZone }) as Intl.DateTimeFormatOptions;
  assert.equal(formatDateTime('en-CA', tz(null), at), '2026-10-27');
  assert.equal(formatDateTime('en-CA', tz(''), at), '2026-10-27');
  assert.equal(formatDateTime('en-CA', tz('Mars/Olympus'), at), '2026-10-27');
});

test('localizeInstants rewrites RFC 3339 instants inside text', () => {
  const short = (iso: string) =>
    formatDateTime(
      'en-GB',
      {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: 'Europe/Istanbul',
      },
      iso,
    );
  assert.equal(localizeInstants('2026-10-27T08:45:00Z', short), '27 Oct, 11:45');
  assert.equal(localizeInstants('until 2026-10-27T08:45:00.123+03:00 · ok', short), 'until 27 Oct, 08:45 · ok');
  assert.equal(localizeInstants('2026-10-27 plain date', short), '2026-10-27 plain date');
});
