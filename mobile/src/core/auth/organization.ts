/**
 * Which organization the app works in. The member picks one of the
 * memberships `/v1/auth/me` lists; the choice is remembered on the device and
 * restored on launch while it is still a usable membership. Free of app
 * imports so it runs under `node --test` (`organization.test.ts`).
 */
import type { components } from '../api/schema';

export type MeOrganization = components['schemas']['MeOrganization'];

/** Active and inside its access window (`access_ends_at` null = no end). */
export function isUsable(org: Pick<MeOrganization, 'status' | 'access_ends_at'>, now = Date.now()) {
  if (org.status !== 'active') return false;
  return !org.access_ends_at || Date.parse(org.access_ends_at) > now;
}

/**
 * The remembered organization if it is still a usable membership, else the
 * only usable one, else none (the picker asks).
 */
export function pickOrganization(
  orgs: readonly MeOrganization[] | undefined,
  preferred: string | null | undefined,
  now = Date.now(),
): MeOrganization | null {
  const usable = (orgs ?? []).filter((o) => isUsable(o, now));
  return usable.find((o) => o.slug === preferred) ?? (usable.length === 1 ? usable[0] : null);
}

/** Synchronous key-value store (`core/storage` on device, a Map in tests). */
export type KV = {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
};

export const ORG_KEY = 'session.org';

/** The remembered organization slug (what `X-Organization` carries, as on the web). */
export function organizationPreference(kv: KV) {
  return {
    get: () => kv.getString(ORG_KEY) ?? null,
    set: (slug: string) => kv.set(ORG_KEY, slug),
    clear: () => kv.remove(ORG_KEY),
  };
}
