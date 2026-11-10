/**
 * Where a Siri / Shortcuts action opens (`app-intents/Intents/OpenIntents.swift`
 * dispatches these names and parameter keys). Kept free of app imports so it
 * runs under `node --test`.
 */
import { looksLikePlate, normalizePlate } from '../vehicles/scan.ts';

export type IntentTarget =
  /** A screen to open as is. */
  | { kind: 'route'; href: string }
  /** A plate to look up: one hit opens the vehicle, else the list searched by it. */
  | { kind: 'plate'; plate: string };

export type IntentAccess = { signedIn: boolean; vehicles: boolean };

const TODAY = { kind: 'route', href: '/' } as const;

/** Null: nothing to open (signed out, or an unknown action). */
export function intentTarget(name: string, params: Record<string, unknown>, access: IntentAccess): IntentTarget | null {
  if (!access.signedIn) return null;
  switch (name) {
    case 'openToday':
      return TODAY;
    case 'findVehicle': {
      if (!access.vehicles) return TODAY;
      const raw = typeof params.plate === 'string' ? params.plate : '';
      if (!raw.trim()) return { kind: 'route', href: '/vehicles' };
      // Siri may hear "34 abc 123" or spell it with dashes; the API ignores spaces and dashes.
      if (looksLikePlate(raw)) return { kind: 'plate', plate: normalizePlate(raw) };
      return { kind: 'route', href: `/vehicles?q=${encodeURIComponent(raw.trim().slice(0, 40))}` };
    }
    default:
      return null;
  }
}

/** The list searched by a plate (several or no hits). */
export function plateListHref(plate: string) {
  return `/vehicles?q=${encodeURIComponent(plate)}`;
}
