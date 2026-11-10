/**
 * Permission checks, free of app imports so they run under `node --test`.
 * The API enforces every permission; the app only hides what would fail.
 */

/** User-level prefixes that stay valid inside an organization (same as the panel's tenant shell). */
export const ACCOUNT_PERMISSION_PREFIXES = ['auth.', 'notifications.'];

/**
 * What the member may do in the picked organization: its `tenant.*` slugs
 * (from `/v1/tenant/context`, or the membership in `/v1/auth/me` until the
 * context answers) plus the user's own account-level slugs. Platform slugs
 * never apply inside an organization.
 */
export function scopedPermissions(
  organization: readonly string[] | undefined,
  user: readonly string[] | undefined,
): string[] {
  const account = (user ?? []).filter((p) => ACCOUNT_PERMISSION_PREFIXES.some((x) => p.startsWith(x)));
  return [...new Set([...(organization ?? []), ...account])];
}

/** True when any of `anyOf` is granted (no slugs asked = true). */
export function can(granted: readonly string[] | undefined, ...anyOf: string[]) {
  if (anyOf.length === 0) return true;
  if (!granted?.length) return false;
  return anyOf.some((p) => granted.includes(p));
}

/** True when every one of `allOf` is granted. */
export function canAll(granted: readonly string[] | undefined, ...allOf: string[]) {
  return allOf.every((p) => !!granted?.includes(p));
}
