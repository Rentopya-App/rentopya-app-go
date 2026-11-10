/**
 * Notification center sections by the Istanbul calendar day: today,
 * yesterday, earlier this week, older. Free of app imports so it runs under
 * `node --test`.
 */

export type DayGroup = 'today' | 'yesterday' | 'week' | 'older';

export const DAY_GROUPS: readonly DayGroup[] = ['today', 'yesterday', 'week', 'older'];

/** `YYYY-MM-DD` of an instant in a time zone. */
export function dayKey(at: Date | number | string, timeZone: string) {
  const d = at instanceof Date ? at : new Date(at);
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

export function dayGroup(createdAt: string, now: Date | number, timeZone: string): DayGroup {
  const diff = daysBetween(dayKey(now, timeZone), dayKey(createdAt, timeZone));
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7) return 'week';
  return 'older';
}

export type Section<T> = { group: DayGroup; data: T[] };

/** Keeps the API order (newest first) inside each section; empty sections are left out. */
export function groupNotifications<T extends { created_at: string }>(
  items: readonly T[],
  now: Date | number,
  timeZone: string,
): Section<T>[] {
  const by = new Map<DayGroup, T[]>();
  for (const it of items) {
    const g = dayGroup(it.created_at, now, timeZone);
    const list = by.get(g);
    if (list) list.push(it);
    else by.set(g, [it]);
  }
  return DAY_GROUPS.filter((g) => by.has(g)).map((g) => ({ group: g, data: by.get(g)! }));
}

/** Badge text: hidden at zero, capped at 99+. */
export function badgeLabel(count: number | null | undefined) {
  if (!count || count < 0) return null;
  return count > 99 ? '99+' : String(count);
}
