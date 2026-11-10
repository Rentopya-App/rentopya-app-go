import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, orgHeader, unwrap } from '@/core/api/client';
import { isApiError } from '@/core/api/errors';
import { useSession } from '@/core/auth/session';
import { apiErrorMessage, i18n } from '@/core/i18n';
import { stepErrorText } from '@/features/field-tasks/api';
import { nextOffset, PAGE_SIZE } from '@/ui/paged-list';

import { assignProblemKey, BULK_ASSIGN, bulkOutcome, type boardQuery, type unassignedQuery } from './lib';

const useOrg = () => useSession((s) => s.organization?.slug ?? '');

/** The board (`tenant.field_tasks.read`): every task in the member's branch scope, paged. */
export function useBoardTasks(query: ReturnType<typeof boardQuery>) {
  const org = useOrg();
  return useInfiniteQuery({
    queryKey: ['field-tasks', 'board', org, query],
    enabled: !!org,
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/v1/tenant/field-tasks', {
          params: { header: orgHeader(), query: { ...query, limit: PAGE_SIZE, offset: pageParam } },
        }),
      ),
  });
}

/** How many open tasks nobody has (the call-out above the list). */
export function useUnassignedCount(query: ReturnType<typeof unassignedQuery>) {
  const org = useOrg();
  return useQuery({
    queryKey: ['field-tasks', 'board-unassigned', org, query],
    enabled: !!org,
    queryFn: () => unwrap(api.GET('/v1/tenant/field-tasks', { params: { header: orgHeader(), query } })),
    select: (page) => page.total,
  });
}

/** Status / type / assignee counts in scope (the assignee filter's options). */
export function useBoardFacets() {
  const org = useOrg();
  return useQuery({
    queryKey: ['field-tasks', 'facets', org],
    enabled: !!org,
    staleTime: 60_000,
    queryFn: () => unwrap(api.GET('/v1/tenant/field-tasks/facets', { params: { header: orgHeader() } })),
  });
}

/** Members who work field tasks, with their branch scope. */
export function useFieldTaskAssignees() {
  const org = useOrg();
  return useQuery({
    queryKey: ['field-tasks', 'assignees', org],
    enabled: !!org,
    staleTime: 5 * 60_000,
    queryFn: () =>
      unwrap(api.GET('/v1/tenant/field-tasks/assignees', { params: { header: orgHeader(), query: { q: '' } } })),
  });
}

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['field-tasks'] });
    void qc.invalidateQueries({ queryKey: ['field-task'] });
    void qc.invalidateQueries({ queryKey: ['field-task-events'] });
  };
}

/** `POST …/{uuid}/assign` (`tenant.field_tasks.assign`); null unassigns. */
export function useAssignTask() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ uuid, user }: { uuid: string; user: string | null }) =>
      unwrap(
        api.POST('/v1/tenant/field-tasks/{uuid}/assign', {
          params: { header: orgHeader(), path: { uuid } },
          body: { user_uuid: user },
        }),
      ),
    onSettled: refresh,
  });
}

/** `POST /v1/tenant/field-tasks/bulk` `assign` on picked tasks (reversible from the panel's bulk jobs). */
export function useBulkAssign() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ uuids, user }: { uuids: string[]; user: string | null }) =>
      bulkOutcome(
        await unwrap(
          api.POST('/v1/tenant/field-tasks/bulk', {
            params: { header: orgHeader() },
            body: {
              action: BULK_ASSIGN,
              target: { scope: 'ids', ids: uuids, params: { user_uuid: user ?? '' } },
              locale: i18n.language === 'en' ? 'en' : 'tr',
            },
          }),
        ),
      ),
    onSettled: refresh,
  });
}

/** Text of a refused assignment: assignment codes, then the field task codes, then the shared catalog. */
export function assignErrorText(e: unknown) {
  const key = isApiError(e) ? assignProblemKey(e.details) : null;
  if (key) return i18n.t(`transfers_app:${key}`);
  return isApiError(e) ? stepErrorText(e) : apiErrorMessage(e);
}
