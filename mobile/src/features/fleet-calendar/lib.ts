/**
 * Fleet calendar on a phone: a day or a week window in the organization
 * zone, each vehicle with an occupancy strip and its entries as a list (the
 * panel's `/fleet/calendar` phone fallback). Free of app imports so it runs
 * under `node --test`.
 */
import type { components } from '../../core/api/schema';
import { zonedIso } from '../../core/zoned.ts';

type S = components['schemas'];
export type FleetCalendar = S['FleetCalendar'];
export type FleetCalendarRow = S['FleetCalendarRow'];
export type FleetCalendarInterval = S['FleetCalendarInterval'];
export type FleetCalendarMaintenance = S['FleetCalendarMaintenance'];

export const ZOOMS = ['day', 'week'] as const;
export type Zoom = (typeof ZOOMS)[number];

function shiftDay(day: string, days: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week of a `YYYY-MM-DD` day. */
export function weekStart(day: string) {
  const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  return shiftDay(day, -weekday);
}

export type CalendarWindow = { first: string; days: number; from: string; to: string };

/** The half-open window `[from, to)` a zoom shows around a day, midnights in the organization zone. */
export function calendarWindow(zoom: Zoom, anchor: string, timeZone: string | null | undefined): CalendarWindow {
  const first = zoom === 'day' ? anchor : weekStart(anchor);
  const days = zoom === 'day' ? 1 : 7;
  return {
    first,
    days,
    from: zonedIso(first, '00:00', timeZone),
    to: zonedIso(shiftDay(first, days), '00:00', timeZone),
  };
}

/** The anchor one window back (-1) or forward (+1). */
export function shiftAnchor(zoom: Zoom, anchor: string, direction: -1 | 1) {
  return shiftDay(anchor, direction * (zoom === 'day' ? 1 : 7));
}

/** The `YYYY-MM-DD` days of a window. */
export function windowDays(w: Pick<CalendarWindow, 'first' | 'days'>) {
  return Array.from({ length: w.days }, (_, i) => shiftDay(w.first, i));
}

export type Segment = { key: string; kind: FleetCalendarInterval['kind']; start: number; end: number };

/** Bars of the occupancy strip: each interval as a share (0..1) of the window. */
export function segments(intervals: readonly FleetCalendarInterval[], w: Pick<CalendarWindow, 'from' | 'to'>) {
  const from = new Date(w.from).getTime();
  const span = new Date(w.to).getTime() - from;
  if (span <= 0) return [];
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return intervals
    .map<Segment>((i) => ({
      key: `${i.kind}-${i.uuid}`,
      kind: i.kind,
      start: clamp((new Date(i.clip_start).getTime() - from) / span),
      end: clamp((new Date(i.clip_end).getTime() - from) / span),
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);
}

/** Share of the window the vehicle is busy (overlapping bars counted once). */
export function busyShare(intervals: readonly FleetCalendarInterval[], w: Pick<CalendarWindow, 'from' | 'to'>) {
  let total = 0;
  let reach = 0;
  for (const s of segments(intervals, w)) {
    const start = Math.max(s.start, reach);
    if (s.end > start) total += s.end - start;
    reach = Math.max(reach, s.end);
  }
  return Math.min(1, total);
}

export type Entry =
  | { key: string; type: 'interval'; at: number; interval: FleetCalendarInterval }
  | { key: string; type: 'maintenance'; at: number; item: FleetCalendarMaintenance };

/** Intervals and maintenance days of a row in time order (maintenance on its calendar day). */
export function rowEntries(row: Pick<FleetCalendarRow, 'intervals' | 'maintenance'>): Entry[] {
  const out: Entry[] = [
    ...row.intervals.map<Entry>((interval) => ({
      key: `${interval.kind}-${interval.uuid}`,
      type: 'interval',
      at: new Date(interval.starts_at).getTime(),
      interval,
    })),
    ...row.maintenance.map<Entry>((item) => ({
      key: `m-${item.uuid}`,
      type: 'maintenance',
      at: new Date(`${item.date}T00:00:00Z`).getTime(),
      item,
    })),
  ];
  return out.sort((a, b) => a.at - b.at);
}

/** i18n key of an interval's title (panel catalogs). */
export function intervalKey(i: Pick<FleetCalendarInterval, 'kind' | 'block'>) {
  if (i.kind === 'block' && i.block) return `vehicle_blocks:kind.${i.block.kind}`;
  return `fleet_calendar:bar.${i.kind}`;
}

/** Where tapping an interval leads: the transfer (if in scope), the reservation, else nowhere. */
export function intervalPath(i: Pick<FleetCalendarInterval, 'kind' | 'uuid' | 'transfer' | 'allocation'>) {
  if (i.kind === 'transfer' && i.transfer?.in_scope) return `/transfers/${i.uuid}`;
  if (i.kind === 'reservation' && i.allocation?.reservation) return `/reservations/${i.allocation.reservation.uuid}`;
  return null;
}
