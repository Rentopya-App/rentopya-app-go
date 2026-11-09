import { DEFAULT_TIME_ZONE } from './date-format.ts';

/**
 * The instant of a wall-clock day and time in a time zone
 * (`2026-10-26`, `09:30`, `Europe/Istanbul` → `2026-10-26T06:30:00.000Z`).
 */
export function zonedIso(day: string, time: string, timeZone: string | null | undefined) {
  const guess = new Date(`${day}T${time}:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || DEFAULT_TIME_ZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(guess)
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return new Date(guess.getTime() - (wall - guess.getTime())).toISOString();
}

/** Wall-clock times of a day in steps (`07:00`, `07:30`, …). */
export function dayTimes(from = 7, to = 23, stepMinutes = 30) {
  const out: string[] = [];
  for (let m = from * 60; m <= to * 60; m += stepMinutes)
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  return out;
}
