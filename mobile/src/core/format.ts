import { getCalendars, getLocales } from 'expo-localization';

import { DEFAULT_TIME_ZONE, formatDateTime, localizeInstants } from '@/core/date-format';
import { i18n } from '@/core/i18n';
import { storage } from '@/core/storage';

export { DEFAULT_TIME_ZONE };

const ZONE_KEY = 'pref.organization_tz';

/** The device's first calendar (zone, 12/24-hour clock); undefined where the native module is missing. */
function deviceCalendar() {
  try {
    return getCalendars()[0];
  } catch {
    return undefined;
  }
}

let localeCache: { lang: string; tag: string } | null = null;

/**
 * BCP 47 tag for `Intl`: the app language with the device's region when the
 * device speaks that language (`en-US` writes "Oct 27", `en-GB` "27 Oct"),
 * else `tr-TR` / `en-GB`.
 */
export function appLocale() {
  const lang = i18n.language === 'en' ? 'en' : 'tr';
  if (localeCache?.lang === lang) return localeCache.tag;
  let tag = lang === 'en' ? 'en-GB' : 'tr-TR';
  try {
    const device = getLocales().find((l) => l.languageCode === lang && l.regionCode);
    if (device) {
      const candidate = `${lang}-${device.regionCode}`;
      if (Intl.DateTimeFormat.supportedLocalesOf([candidate]).length) tag = candidate;
    }
  } catch {
    // Keep the default tag.
  }
  localeCache = { lang, tag };
  return tag;
}

/** `h23` / `h12` from the device setting, so times follow the user's clock choice. */
function hourCycle(): Intl.DateTimeFormatOptions['hourCycle'] {
  const uses24 = deviceCalendar()?.uses24hourClock;
  return uses24 == null ? undefined : uses24 ? 'h23' : 'h12';
}

let organizationZone: string | null = storage.getString(ZONE_KEY) ?? null;

/**
 * The active organization's zone. Panel times (rentals, history, cash days) are
 * shown in it wherever the device is; set by the organization layout.
 */
export function setOrganizationTimeZone(timeZone: string | null | undefined) {
  organizationZone = timeZone || null;
  if (organizationZone) storage.set(ZONE_KEY, organizationZone);
  else storage.remove(ZONE_KEY);
}

/** Zone for times without their own: the organization's, else the device's, else Istanbul. */
export function displayTimeZone() {
  return organizationZone ?? deviceCalendar()?.timeZone ?? DEFAULT_TIME_ZONE;
}

function format(
  options: Intl.DateTimeFormatOptions,
  value: Date | string | null | undefined,
  timeZone?: string | null,
) {
  const withClock = options.hour ? { hourCycle: hourCycle(), ...options } : options;
  return formatDateTime(appLocale(), { ...withClock, timeZone: timeZone || displayTimeZone() }, value);
}

/** Decimal string from the API (`"1250.00"`) in the record's currency. */
export function formatMoney(amount: string | number | null | undefined, currency = 'TRY') {
  const n = typeof amount === 'number' ? amount : Number(amount ?? 0);
  const value = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat(appLocale(), { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    // Unknown currency code: the number with the code after it.
    return `${formatNumber(value, 2)} ${currency}`;
  }
}

/** A plain number with grouping in the app language ("1.250", "4,5"). */
export function formatNumber(
  value: number | string | null | undefined,
  maximumFractionDigits = 0,
  minimumFractionDigits = 0,
) {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  return new Intl.NumberFormat(appLocale(), { maximumFractionDigits, minimumFractionDigits }).format(
    Number.isFinite(n) ? n : 0,
  );
}

/** A share (`0.25` → "%25" in Turkish, "25%" in English). */
export function formatPercent(ratio: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat(appLocale(), { style: 'percent', maximumFractionDigits }).format(
    Number.isFinite(ratio) ? ratio : 0,
  );
}

export function formatTime(iso: string, timeZone?: string | null) {
  return format({ hour: '2-digit', minute: '2-digit' }, iso, timeZone);
}

export function formatDate(iso: string, timeZone?: string | null) {
  return format({ day: 'numeric', month: 'long', weekday: 'short' }, iso, timeZone);
}

/** `2026-10-26` for a calendar date in the organization zone (calendar / summary `date` params). */
export function localDate(date: Date, timeZone?: string | null) {
  return formatDateTime(
    'en-CA',
    { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: timeZone || displayTimeZone() },
    date,
  );
}

/** Calendar date shifted by whole days, in plain `YYYY-MM-DD` arithmetic. */
export function addDays(day: string, days: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Heading for a `YYYY-MM-DD` day ("Pzt 26 Ekim"). */
export function formatDay(day: string) {
  return formatDateTime(
    appLocale(),
    { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' },
    `${day}T12:00:00Z`,
  );
}

/** A `YYYY-MM-DD` calendar date (sold on, entry date) as "27 Ekim 2026", never shifted by a zone. */
export function formatCalendarDate(day: string | null | undefined) {
  if (!day) return '';
  return formatDateTime(
    appLocale(),
    { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' },
    `${day.slice(0, 10)}T12:00:00Z`,
  );
}

/** Compact date and time for history rows ("26 Eki 14:30"). */
export function formatShort(iso: string | null | undefined, timeZone?: string | null) {
  return format({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }, iso, timeZone);
}

/** "5 dk önce", "yarın", "in 2 hours": the nearest whole unit, `now` for under a minute. */
export function formatRelative(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return '';
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return '';
  const seconds = (at - now) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  try {
    const rtf = new Intl.RelativeTimeFormat(appLocale(), { numeric: 'auto' });
    for (const [unit, size] of units)
      if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
    return rtf.format(0, 'second');
  } catch {
    return formatShort(iso);
  }
}

/** "1 sa 30 dk" / "1 h 30 min" for a duration in minutes. */
export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  const parts = [
    h ? i18n.t('common:duration_hours', { count: h }) : '',
    m || !h ? i18n.t('common:duration_minutes', { count: m }) : '',
  ];
  return parts.filter(Boolean).join(' ');
}

/** API free text (history notes) with raw instants shown as local dates. */
export function localizeText(text: string | null | undefined, timeZone?: string | null) {
  return text ? localizeInstants(text, (iso) => formatShort(iso, timeZone)) : '';
}
