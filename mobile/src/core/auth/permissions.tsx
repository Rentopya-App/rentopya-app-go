import type { ReactNode } from 'react';

import { useTenantContext } from '@/core/tenant';

import { can, canAll, scopedPermissions } from './can';
import { Permission, type PermissionSlug } from './permission-slugs';
import { useSession } from './session';

export { Permission, type PermissionSlug };

/**
 * The member's permissions in the picked organization: `/v1/tenant/context`
 * once it answers (authoritative, the union over every role of the member),
 * the membership from `/v1/auth/me` until then, plus the account-level
 * `auth.*` / `notifications.*`. Same rule as the panel's tenant shell.
 */
export function usePermissions(): string[] {
  const organization = useSession((s) => s.organization);
  const user = useSession((s) => s.me?.permissions);
  const context = useTenantContext().data;
  const org =
    context && context.organization.uuid === organization?.uuid ? context.permissions : organization?.permissions;
  return scopedPermissions(organization ? org : [], user);
}

/** `useCan()(Permission.X, Permission.Y)`: true when any of them is granted. */
export function useCan() {
  const granted = usePermissions();
  return (...anyOf: PermissionSlug[]) => can(granted, ...anyOf);
}

/** `useCanAll()(Permission.X, Permission.Y)`: true when all of them are granted. */
export function useCanAll() {
  const granted = usePermissions();
  return (...allOf: PermissionSlug[]) => canAll(granted, ...allOf);
}

/**
 * Renders `children` only with the permission (any of `perm` when a list),
 * else `fallback`. Hides what the API would refuse; the API still checks.
 */
export function Can({
  perm,
  all,
  children,
  fallback = null,
}: {
  perm: PermissionSlug | PermissionSlug[];
  /** With a list: require every slug instead of any. */
  all?: boolean;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const granted = usePermissions();
  const list = Array.isArray(perm) ? perm : [perm];
  const ok = all ? canAll(granted, ...list) : can(granted, ...list);
  return <>{ok ? children : fallback}</>;
}
