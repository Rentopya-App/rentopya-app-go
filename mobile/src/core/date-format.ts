/** Organization default (docs/design/tenant-core.md); the API sends each record's own zone. */
export const DEFAULT_TIME_ZONE = 'Europe/Istanbul';

/**
 * `Intl.DateTimeFormat#format` that never throws. A missing timestamp or an
 * unknown / `null` zone throws a RangeError in Hermes, and a throw during render
 * kills a release build, so a bad value renders as an empty string and a bad
 * zone falls back to the organization default.
 */
export function formatDateTime(
  locale: string,
  options: Intl.DateTimeFormatOptions,
  value: Date | string | null | undefined,
) {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const timeZone = options.timeZone || DEFAULT_TIME_ZONE;
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: DEFAULT_TIME_ZONE }).format(date);
  }
}

/** An RFC 3339 instant inside free text (`2026-10-27T08:45:00Z`, `…+03:00`). */
const INSTANT = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})/g;

/**
 * Free text from the API (a history note, a log line) with every instant in it
 * rewritten by `format`, so a raw `2026-10-27T08:45:00Z` reads as a local date.
 */
export function localizeInstants(text: string, format: (iso: string) => string) {
  return text.replace(INSTANT, (iso) => format(iso) || iso);
}
