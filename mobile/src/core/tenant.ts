import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { create } from 'zustand';

import { api, orgHeader, unwrap } from '@/core/api/client';
import type { components } from '@/core/api/schema';
import { can } from '@/core/auth/can';
import { Permission } from '@/core/auth/permission-slugs';
import { useSession } from '@/core/auth/session';
import { branchKey, resolveBranch } from '@/core/branch';
import { storage } from '@/core/storage';

export type TenantContext = components['schemas']['TenantContext'];
export type Branch = components['schemas']['Branch'];

/**
 * The picked organization's context: the member's roles, `tenant.*`
 * permissions (union over every role), branch scope and plan features.
 * A removed membership answers 403 here; the API client then sends the
 * member back to the picker.
 */
export function useTenantContext() {
  const org = useSession((s) => s.organization);
  return useQuery({
    queryKey: ['tenant-context', org?.slug],
    enabled: !!org,
    staleTime: 5 * 60_000,
    queryFn: () => unwrap(api.GET('/v1/tenant/context', { params: { header: orgHeader() } })),
  });
}

/** Whether the plan has a feature; true while the context is still loading (the API refuses anyway). */
export function useHasFeature() {
  const ctx = useTenantContext();
  const membership = useSession((s) => s.organization?.features);
  return (feature: components['schemas']['FeatureKey']) => {
    const features = ctx.data?.features ?? membership;
    return !features || features.includes(feature);
  };
}

/**
 * Branches the member may work in: `branch_scope = selected` members get
 * only their own (the API applies the scope). Needs `tenant.branches.read`;
 * without it there is no branch filter.
 */
export function useBranches() {
  const org = useSession((s) => s.organization);
  const ctx = useTenantContext();
  const permissions = ctx.data?.permissions ?? org?.permissions;
  return useQuery({
    queryKey: ['branches', 'filter', org?.slug],
    enabled: !!org && can(permissions, Permission.TenantBranchesRead),
    staleTime: 5 * 60_000,
    queryFn: () =>
      unwrap(
        api.GET('/v1/tenant/branches', {
          params: { header: orgHeader(), query: { limit: 100, sort: 'name', is_active: true } },
        }),
      ),
  });
}

type BranchFilter = {
  /** Selected branch uuid per organization uuid; missing = all branches. */
  byOrg: Record<string, string | null>;
  set: (organizationUuid: string, branchUuid: string | null) => void;
};

const useBranchFilter = create<BranchFilter>((set) => ({
  byOrg: {},
  set: (org, branch) => {
    if (branch) storage.set(branchKey(org), branch);
    else storage.remove(branchKey(org));
    set((s) => ({ byOrg: { ...s.byOrg, [org]: branch } }));
  },
}));

function savedBranch(orgUuid: string, state: BranchFilter) {
  return orgUuid in state.byOrg ? state.byOrg[orgUuid] : (storage.getString(branchKey(orgUuid)) ?? null);
}

/**
 * The branch filter of the picked organization, kept on the device. List
 * screens pass `branchUuid` as their branch query filter (`null` = every
 * branch the member may see). It is never a header: the API enforces the
 * branch scope on its own.
 */
export function useSelectedBranch() {
  const org = useSession((s) => s.organization);
  const saved = useBranchFilter((s) => (org ? savedBranch(org.uuid, s) : null));
  const setFilter = useBranchFilter((s) => s.set);
  const branches = useBranches();
  const items = branches.data?.items;
  const branchUuid = resolveBranch(saved, branches.isError ? [] : items);

  // A branch that left the member's scope (or was archived) clears the filter.
  useEffect(() => {
    if (org && saved && !branchUuid) setFilter(org.uuid, null);
  }, [org, saved, branchUuid, setFilter]);

  return {
    branchUuid,
    branch: items?.find((b) => b.uuid === branchUuid) ?? null,
    branches: items ?? [],
    isLoading: branches.isLoading,
    /** No branch read permission (or none to choose): hide the filter. */
    available: branches.isSuccess && (items?.length ?? 0) > 1,
    setBranch: (uuid: string | null) => org && setFilter(org.uuid, uuid),
  };
}
