import fs from 'node:fs';

/** Prefixes that apply inside an organization (the panel's tenant shell scopes the same way). */
export const MOBILE_PREFIXES = ['tenant.', 'auth.', 'notifications.'];

/**
 * `[key, slug]` pairs of the panel's `export const Permission = { ... }`
 * object whose slug starts with one of `MOBILE_PREFIXES`, in file order.
 */
export function readPanelPermissions(file) {
  const src = fs.readFileSync(file, 'utf8');
  const start = src.indexOf('export const Permission = {');
  if (start < 0) throw new Error(`${file}: Permission object not found`);
  const end = src.indexOf('} as const', start);
  const block = src.slice(start, end < 0 ? undefined : end);
  const out = [];
  for (const m of block.matchAll(/^\s*([A-Za-z0-9_]+):\s*["']([^"']+)["'],?[ \t]*$/gm)) {
    if (MOBILE_PREFIXES.some((p) => m[2].startsWith(p))) out.push([m[1], m[2]]);
  }
  return out;
}
