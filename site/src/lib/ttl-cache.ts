/**
 * A small in-process TTL cache with least-recently-used eviction. Values are
 * promises, so concurrent misses for one key share a single load; a failed
 * load is dropped at once (the next caller retries). Pure: node --test runs it.
 */
export type TtlCache<T> = {
  get(key: string, load: () => Promise<T>): Promise<T>;
  size(): number;
  clear(): void;
};

export function createTtlCache<T>(
  ttlMs: number,
  maxEntries = 500,
  now: () => number = Date.now,
): TtlCache<T> {
  type Entry = { value: Promise<T>; expires: number };
  const map = new Map<string, Entry>();
  return {
    get(key, load) {
      const t = now();
      const hit = map.get(key);
      if (hit && hit.expires > t) {
        // Re-insert: the Map's order is the recency order.
        map.delete(key);
        map.set(key, hit);
        return hit.value;
      }
      const entry: Entry = { value: load(), expires: t + ttlMs };
      map.delete(key);
      map.set(key, entry);
      entry.value.catch(() => {
        if (map.get(key) === entry) map.delete(key);
      });
      while (map.size > maxEntries) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
      return entry.value;
    },
    size: () => map.size,
    clear: () => map.clear(),
  };
}
