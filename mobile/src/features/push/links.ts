/**
 * Where a tapped push opens. Pushes carry the panel path of what they are
 * about in `data.url` (`/t/{slug}/...`, the same link as the in-app
 * notification); the app maps it to its own screens. Paths of screens the
 * app does not have yet open the home tab of that organization. Kept free
 * of app imports so it runs under `node --test`.
 */
export type PushTarget = {
  /** Organization the record belongs to (switched to first when it differs). */
  slug: string;
  /** App route to push after the organization is active; `/` = home tab. */
  route: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Panel path after `/t/{slug}` → app route; null = no own screen (home). */
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

/**
 * `data.url` → organization + app route, or null when the link is not a
 * company panel link (platform shell, customer portal, nothing).
 */
export function pushTarget(url: unknown): PushTarget | null {
  if (typeof url !== 'string' || !url.trim()) return null;
  const path = url.trim().replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, '').split(/[?#]/)[0];
  const parts = path.split('/').filter(Boolean);
  if (parts[0] !== 't' || !parts[1]) return null;
  let slug: string;
  let rest: string[];
  try {
    slug = decodeURIComponent(parts[1]);
    rest = parts.slice(2).map(decodeURIComponent);
  } catch {
    return null;
  }
  return { slug, route: routeFor(rest) ?? '/' };
}

/** What a tap does for the signed-in member. */
export type PushAction =
  | { kind: 'open'; route: string }
  | { kind: 'switch'; slug: string; route: string }
  /** Not a member (any more) of that organization, or not a panel link: home of the current one. */
  | { kind: 'home' };

type Membership = { slug: string; status: string; access_ends_at?: string | null };

/**
 * Decides how to open a target: in the current organization, after
 * switching to a usable membership, or the home tab.
 */
export function pushAction(
  target: PushTarget | null,
  current: string | null | undefined,
  memberships: readonly Membership[] | undefined,
  now = Date.now(),
): PushAction {
  if (!target) return { kind: 'home' };
  if (target.slug === current) return { kind: 'open', route: target.route };
  const m = memberships?.find((o) => o.slug === target.slug);
  const usable = !!m && m.status === 'active' && (!m.access_ends_at || Date.parse(m.access_ends_at) > now);
  return usable ? { kind: 'switch', slug: target.slug, route: target.route } : { kind: 'home' };
}
