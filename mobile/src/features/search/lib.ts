/**
 * Company panel search (`/v1/tenant/search`): hits grouped by type in the
 * order of `/v1/tenant/search/specs`. Free of app imports so it runs under
 * `node --test`.
 */
import type { components } from '../../core/api/schema';

export type SearchHit = components['schemas']['SearchHit'];
export type SearchSpec = components['schemas']['SearchSpec'];

/** The panel's minimum before it queries (Cmd+K waits for two characters). */
export const MIN_QUERY = 2;

export function searchable(q: string) {
  return q.trim().length >= MIN_QUERY;
}

export type HitGroup = { spec: string; labelKey: string | null; icon: string | null; hits: SearchHit[] };

/**
 * One group per type, ordered like the specs (unknown types last, in the
 * order they came); inside a group the API's ranking is kept.
 */
export function groupHits(hits: readonly SearchHit[], specs: readonly SearchSpec[] | undefined): HitGroup[] {
  const order = new Map((specs ?? []).map((s, i) => [s.id, i]));
  const groups = new Map<string, HitGroup>();
  for (const h of hits) {
    let g = groups.get(h.spec);
    if (!g) {
      const spec = specs?.find((s) => s.id === h.spec);
      g = { spec: h.spec, labelKey: spec?.label_key ?? null, icon: spec?.icon ?? h.icon ?? null, hits: [] };
      groups.set(h.spec, g);
    }
    g.hits.push(h);
  }
  const arrival = [...groups.keys()];
  return [...groups.values()].sort((a, b) => {
    const ia = order.get(a.spec) ?? Number.MAX_SAFE_INTEGER;
    const ib = order.get(b.spec) ?? Number.MAX_SAFE_INTEGER;
    return ia !== ib ? ia - ib : arrival.indexOf(a.spec) - arrival.indexOf(b.spec);
  });
}

/** `search.specs_vehicles` → `specs_vehicles` (the app's own key in the `search` namespace). */
export function specKey(labelKey: string | null | undefined, spec: string) {
  const k = labelKey?.trim();
  if (!k) return `specs_${spec}`;
  return k.startsWith('search.') ? k.slice('search.'.length) : k;
}
