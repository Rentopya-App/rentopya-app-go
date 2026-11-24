import { ApiError, apiFetch } from "./api.ts";
import type { Site } from "./types";

/**
 * Host → site, cached per host in this process. The cache key is the host
 * only: two hosts never share an entry, and an entry always names the
 * organization the API resolved for that host.
 *
 * Random Host headers (the wildcard *.{base} reaches this app directly)
 * must not wear the API or push real sites out of the cache (TEC-1288):
 * - hosts that cannot be a site never reach the API (`hostAllowed`);
 * - known sites and unknown hosts live in separate LRU caches, so a flood
 *   of unknown hosts only evicts other unknown hosts;
 * - unknown custom domains are remembered for longer than unknown
 *   subdomains (a new subdomain site shows within seconds, a newly verified
 *   custom domain within minutes);
 * - concurrent lookups of one host share a single API call.
 */
const TTL_MS = 30_000;
const SUBDOMAIN_MISS_TTL_MS = 15_000;
const CUSTOM_MISS_TTL_MS = 5 * 60_000;
const MAX_SITES = 2000;
const MAX_MISSES = 5000;

/** A small LRU with per-entry expiry (Map order is recency). Pure. */
export class Lru<T> {
  private map = new Map<string, { value: T; expires: number }>();
  private max: number;
  constructor(max: number) {
    this.max = max;
  }
  get(key: string, now = Date.now()): T | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    this.map.delete(key);
    if (hit.expires <= now) return undefined;
    this.map.set(key, hit);
    return hit.value;
  }
  set(key: string, value: T, ttlMs: number, now = Date.now()): void {
    this.map.delete(key);
    this.map.set(key, { value, expires: now + ttlMs });
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
  delete(key: string): void {
    this.map.delete(key);
  }
  get size(): number {
    return this.map.size;
  }
}

const sites = new Lru<Site>(MAX_SITES);
const misses = new Lru<true>(MAX_MISSES);
const inflight = new Map<string, Promise<Site | null>>();

/** Lower-case host[:port] of a Host header, or "" when malformed. */
export function hostKey(raw: string | null | undefined): string {
  const h = (raw ?? "").trim().toLowerCase();
  return /^[a-z0-9.-]+(:\d{1,5})?$/.test(h) && h.length <= 260 ? h : "";
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** host[:port] of SITE_BASE_URL ("" when unset: no filtering). */
export function baseHost(raw = process.env.SITE_BASE_URL): string {
  try {
    return raw ? new URL(raw).host.toLowerCase() : "";
  } catch {
    return "";
  }
}

/**
 * Whether a host (hostKey form) can name a site: one label directly under
 * the platform base, or a public-looking custom domain (two or more DNS
 * labels, alphabetic top-level label, no port, not the base itself). Pure.
 */
export function hostAllowed(host: string, base: string): boolean {
  if (!host) return false;
  if (!base) return true;
  if (host === base) return false;
  if (host.endsWith("." + base)) {
    return LABEL.test(host.slice(0, -(base.length + 1)));
  }
  if (host.includes(":")) return false;
  const labels = host.split(".");
  return (
    labels.length >= 2 &&
    host.length <= 253 &&
    labels.every((l) => LABEL.test(l)) &&
    /^[a-z]{2,63}$/.test(labels[labels.length - 1]!)
  );
}

function isSubdomain(host: string, base: string): boolean {
  return !!base && host.endsWith("." + base);
}

/**
 * Resolves a host. Returns null for hosts without a site; throws ApiError
 * when the API cannot answer (the caller shows a temporary error page and
 * never falls back to another site).
 */
export async function resolveSite(
  rawHost: string | null | undefined,
  forwardedFor?: string,
  preview?: string,
): Promise<Site | null> {
  const host = hostKey(rawHost);
  const base = baseHost();
  if (!hostAllowed(host, base)) return null;
  if (preview) return resolvePreview(host, preview, forwardedFor);
  const hit = sites.get(host);
  if (hit) return hit;
  if (misses.get(host)) return null;
  const pending = inflight.get(host);
  if (pending) return pending;

  const load = (async () => {
    let site: Site | null;
    try {
      site = await apiFetch<Site>(
        `/v1/public/site/resolve?host=${encodeURIComponent(host)}`,
        { forwardedFor },
      );
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.status === 404 ||
          err.status === 400 ||
          err.code === "FEATURE_NOT_ENABLED")
      ) {
        site = null;
      } else {
        throw err;
      }
    }
    if (site) {
      sites.set(host, site, TTL_MS);
      misses.delete(host);
    } else {
      misses.set(
        host,
        true,
        isSubdomain(host, base) ? SUBDOMAIN_MISS_TTL_MS : CUSTOM_MISS_TTL_MS,
      );
    }
    return site;
  })();
  inflight.set(host, load);
  try {
    return await load;
  } finally {
    inflight.delete(host);
  }
}

/**
 * The draft of a host's site for a preview token (never cached: a draft
 * changes with every save). Throws ApiError 401 PREVIEW_INVALID for an
 * invalid, expired or foreign token; null for unknown hosts.
 */
async function resolvePreview(
  host: string,
  token: string,
  forwardedFor?: string,
): Promise<Site | null> {
  try {
    return await apiFetch<Site>(
      `/v1/public/site/resolve?host=${encodeURIComponent(host)}&preview=${encodeURIComponent(token)}`,
      { forwardedFor },
    );
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) {
      return null;
    }
    throw err;
  }
}
