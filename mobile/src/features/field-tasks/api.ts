import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, orgHeader, unwrap } from '@/core/api/client';
import { isApiError } from '@/core/api/errors';
import { useSession } from '@/core/auth/session';
import { apiErrorMessage, i18n } from '@/core/i18n';
import { nextOffset, PAGE_SIZE } from '@/ui/paged-list';

import { problemKey, type FieldTask } from './lib';

type MineFilters = { sort: string; status?: string; due_from?: string; due_to?: string };

/** The signed-in member's own tasks (`tenant.field_tasks.execute`), paged. */
export function useMyFieldTasks(filters: MineFilters) {
  const org = useSession((s) => s.organization);
  return useInfiniteQuery({
    queryKey: ['field-tasks', 'mine', org?.slug, filters],
    enabled: !!org,
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/v1/tenant/field-tasks/mine', {
          params: { header: orgHeader(), query: { ...filters, limit: PAGE_SIZE, offset: pageParam } },
        }),
      ),
  });
}

export function useFieldTask(uuid: string) {
  const org = useSession((s) => s.organization);
  return useQuery({
    queryKey: ['field-task', org?.slug, uuid],
    enabled: !!org && !!uuid,
    queryFn: () =>
      unwrap(api.GET('/v1/tenant/field-tasks/{uuid}', { params: { header: orgHeader(), path: { uuid } } })),
  });
}

export function useFieldTaskEvents(uuid: string) {
  const org = useSession((s) => s.organization);
  return useQuery({
    queryKey: ['field-task-events', org?.slug, uuid],
    enabled: !!org && !!uuid,
    queryFn: () =>
      unwrap(api.GET('/v1/tenant/field-tasks/{uuid}/events', { params: { header: orgHeader(), path: { uuid } } })),
  });
}

export type FieldTaskStep = 'start' | 'report-issue' | 'complete' | 'cancel';

function postStep(uuid: string, step: FieldTaskStep, note?: string) {
  const params = { header: orgHeader(), path: { uuid } };
  switch (step) {
    case 'start':
      return unwrap(api.POST('/v1/tenant/field-tasks/{uuid}/start', { params }));
    case 'report-issue':
      return unwrap(api.POST('/v1/tenant/field-tasks/{uuid}/report-issue', { params, body: { note: note ?? '' } }));
    case 'complete':
      return unwrap(api.POST('/v1/tenant/field-tasks/{uuid}/complete', { params, body: note ? { note } : {} }));
    case 'cancel':
      return unwrap(api.POST('/v1/tenant/field-tasks/{uuid}/cancel', { params, body: { note: note ?? '' } }));
  }
}

/**
 * One step on a task (start, report an issue, complete, cancel). The answer
 * is the updated task: it replaces the cached detail, and the lists and the
 * timeline refresh.
 */
export function useFieldTaskStep(uuid: string) {
  const org = useSession((s) => s.organization);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ step, note }: { step: FieldTaskStep; note?: string }) => postStep(uuid, step, note),
    onSuccess: (task: FieldTask) => {
      qc.setQueryData(['field-task', org?.slug, uuid], task);
      void qc.invalidateQueries({ queryKey: ['field-task-events', org?.slug, uuid] });
      void qc.invalidateQueries({ queryKey: ['field-tasks'] });
    },
    onError: () => {
      // A 409 means the task moved on elsewhere: show its current state.
      void qc.invalidateQueries({ queryKey: ['field-task', org?.slug, uuid] });
    },
  });
}

/** Text of a failed step: the field task problem codes first, then the shared error catalog. */
export function stepErrorText(e: unknown) {
  const key = isApiError(e) ? problemKey(e.details) : null;
  return key ? i18n.t(`field_tasks:${key}`) : apiErrorMessage(e);
}
