/**
 * The branch filter. It is a client-side choice only: list screens pass the
 * branch as a query filter, while the API enforces the member's branch scope
 * (`branch_scope = selected` answers 404 for other branches) whatever the
 * filter says. Free of app imports so it runs under `node --test`.
 */

/** Device key of the filter, one per organization (by uuid, slugs can be renamed). */
export function branchKey(organizationUuid: string) {
  return `tenant.branch.${organizationUuid}`;
}

/**
 * The saved branch while it is still in the list the API returns for this
 * member; `null` means all of the member's branches. While the list loads the
 * saved choice stands.
 */
export function resolveBranch(saved: string | null | undefined, branches: readonly { uuid: string }[] | undefined) {
  if (!saved) return null;
  if (!branches) return saved;
  return branches.some((b) => b.uuid === saved) ? saved : null;
}
