/**
 * Where a panel link opens in the app. Notifications (`action_url`) and
 * search hits (`href`) carry the panel path of their record
 * (`/t/{slug}/...`); the app maps the ones it has screens for and opens the
 * rest in the panel ("panelde aç").
 *
 * Minimal mapper until the push deep-link mapper (`features/push/links.ts`,
 * TEC-1140) lands; then both should share one table. Free of app imports so
 * it runs under `node --test`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Panel path after `/t/{slug}` → app route. Only screens the app has today. */
const ROUTES: { pattern: readonly string[]; route: (id: string) => string }[] = [
  { pattern: ['field', 'my', ':id'], route: (id) => `/field/my/${id}` },
  { pattern: ['fleet', 'vehicles', ':id'], route: (id) => `/vehicle/${id}` },
  { pattern: ['rentals', ':id'], route: (id) => `/rentals/${id}` },
  { pattern: ['reservations', ':id'], route: (id) => `/reservations/${id}` },
];

function routeFor(rest: string[]): string | null {
  for (const r of ROUTES) {
    if (r.pattern.length !== rest.length) continue;
    let id = '';
    const ok = r.pattern.every((p, i) => {
      if (p === ':id') {
        id = rest[i];
        return UUID.test(id);
      }
      return p === rest[i];
    });
    if (ok) return r.route(id.toLowerCase());
  }
  return null;
}

export type PanelTarget = {
  /** Organization of the link. */
  slug: string;
  /** App route, or null when the app has no screen for it. */
  route: string | null;
  /** Panel path (`/t/{slug}/...` with its query), for the web fallback. */
  path: string;
};

/** A company panel link (`/t/{slug}/...`, absolute or not) → organization + app route. */
export function panelTarget(href: unknown): PanelTarget | null {
  if (typeof href !== 'string' || !href.trim()) return null;
  const local = href.trim().replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, '');
  const path = local.split('#')[0];
  const parts = path.split(/[?]/)[0].split('/').filter(Boolean);
  if (parts[0] !== 't' || !parts[1]) return null;
  try {
    const slug = decodeURIComponent(parts[1]);
    const rest = parts.slice(2).map(decodeURIComponent);
    return { slug, route: routeFor(rest), path: path.startsWith('/') ? path : `/${path}` };
  } catch {
    return null;
  }
}

/** What tapping a linked record does. */
export type LinkAction =
  /** An app screen in the organization in use. */
  | { kind: 'open'; route: string }
  /** An app screen of another organization the member can use: switch first. */
  | { kind: 'switch'; slug: string; route: string }
  /** No app screen (or not a member there): the panel page in the browser. */
  | { kind: 'web'; url: string }
  | { kind: 'none' };

type Membership = { slug: string; status: string; access_ends_at?: string | null };

function webUrl(href: string, webOrigin: string) {
  if (/^https?:\/\//i.test(href)) return href;
  // API paths (`/v1/...`) are not pages; everything else is a panel path.
  if (!href.startsWith('/') || href.startsWith('/v1/')) return null;
  return `${webOrigin.replace(/\/$/, '')}${href}`;
}

/** Decides how a notification's `action_url` / a search hit's `href` opens. */
export function linkAction(
  href: string | null | undefined,
  current: string | null | undefined,
  memberships: readonly Membership[] | undefined,
  webOrigin: string,
  now = Date.now(),
): LinkAction {
  if (!href?.trim()) return { kind: 'none' };
  const target = panelTarget(href);
  if (target?.route) {
    if (target.slug === current) return { kind: 'open', route: target.route };
    const m = memberships?.find((o) => o.slug === target.slug);
    const usable = !!m && m.status === 'active' && (!m.access_ends_at || Date.parse(m.access_ends_at) > now);
    if (usable) return { kind: 'switch', slug: target.slug, route: target.route };
  }
  const url = webUrl(target?.path ?? href.trim(), webOrigin);
  return url ? { kind: 'web', url } : { kind: 'none' };
}
