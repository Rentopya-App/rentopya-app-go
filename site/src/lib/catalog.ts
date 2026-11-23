import "server-only";

import { cache } from "react";

import { ApiError, apiFetch } from "./api";
import { getForwardedFor, getSite } from "./server";
import { mintSession, usableSession, type StoredSession } from "./session";
import { createTtlCache } from "./ttl-cache";
import type { Location, Site, Subgroup } from "./types";

/**
 * The catalog (branches, points, vehicle subgroups) is the same for every
 * visitor of a site, so it is read once a minute per site with a session of
 * the site server itself and cached in this process (TEC-1280). Content pages
 * therefore never need a visitor booking session; visitors get one only in
 * the booking flow (proxy.ts, needsBookingSession) or when they submit a form.
 */
const CATALOG_TTL_MS = 60_000;
const catalog = createTtlCache<unknown>(CATALOG_TTL_MS, 2000);
const serverSessions = new Map<string, StoredSession>();

const siteKey = (site: Site) => `${site.origin}|${site.publishable_key}`;

async function serverToken(site: Site, renew = false): Promise<string> {
  const key = siteKey(site);
  const held = serverSessions.get(key) ?? null;
  if (!renew && usableSession(held, site)) return held.t;
  // Minted with the visitor that triggered the refresh: the API's per-IP
  // mint window then never counts one site container for every site.
  const fresh = await mintSession(site, await getForwardedFor());
  if (serverSessions.size >= 2000) serverSessions.clear();
  serverSessions.set(key, fresh);
  return fresh.t;
}

async function catalogFetch<T>(site: Site, path: string): Promise<T> {
  const req = { origin: site.origin, forwardedFor: await getForwardedFor() };
  try {
    return await apiFetch<T>(path, { ...req, token: await serverToken(site) });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return apiFetch<T>(path, {
        ...req,
        token: await serverToken(site, true),
      });
    }
    throw err;
  }
}

async function loadCatalog<T>(path: string): Promise<T | null> {
  try {
    const site = await getSite();
    if (!site.booking_enabled || !site.publishable_key) return null;
    return (await catalog.get(`${siteKey(site)}|${path}`, () =>
      catalogFetch<T>(site, path),
    )) as T;
  } catch {
    return null;
  }
}

/**
 * Online-selectable branches and points, or null when booking is
 * unavailable. Cached per site for a minute (header, footer and page share it).
 */
export const loadLocations = cache((): Promise<Location[] | null> =>
  loadCatalog<Location[]>("/v1/public/locations"),
);

/**
 * The storefront's live vehicle subgroups (the fleet), or null when the
 * catalog cannot be read (booking off, API error). Never demo vehicles.
 */
export const loadSubgroups = cache((): Promise<Subgroup[] | null> =>
  loadCatalog<Subgroup[]>("/v1/public/vehicle-subgroups"),
);

/** "branch" / "branch:point" → the API's uuid pair. */
export function splitPlace(
  v: string | undefined,
): { branch: string; point?: string } | null {
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!v) return null;
  const [branch, point] = v.split(":");
  if (
    !branch ||
    !uuid.test(branch) ||
    (point !== undefined && !uuid.test(point))
  )
    return null;
  return { branch, point };
}
