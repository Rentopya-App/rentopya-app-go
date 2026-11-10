import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, orgHeader, unwrap } from '@/core/api/client';
import { useCan, Permission } from '@/core/auth/permissions';
import { useSession } from '@/core/auth/session';
import { nextOffset, PAGE_SIZE } from '@/ui/paged-list';

export type InboxFilter = 'all' | 'unread';

/**
 * The member's inbox in the company panel: `/v1/tenant/notifications` lists
 * this organization's notifications plus personal ones (the panel's tenant
 * shell does the same); one notification is read through `/v1/notifications/{uuid}/read`.
 */
export function useInbox(filter: InboxFilter) {
  const org = useSession((s) => s.organization);
  const can = useCan();
  return useInfiniteQuery({
    queryKey: ['notifications', org?.slug, 'list', filter],
    enabled: !!org && can(Permission.NotificationsRead),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/v1/tenant/notifications', {
          params: {
            header: orgHeader(),
            query: {
              limit: PAGE_SIZE,
              offset: pageParam,
              sort: '-created_at',
              channel: 'inapp',
              unread: filter === 'unread' ? true : undefined,
            },
          },
        }),
      ),
  });
}

export function useUnreadCount() {
  const org = useSession((s) => s.organization);
  const can = useCan();
  return useQuery({
    queryKey: ['notifications', org?.slug, 'unread'],
    enabled: !!org && can(Permission.NotificationsRead),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () =>
      (await unwrap(api.GET('/v1/tenant/notifications/unread-count', { params: { header: orgHeader() } }))).count,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (uuid: string) => unwrap(api.POST('/v1/notifications/{uuid}/read', { params: { path: { uuid } } })),
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST('/v1/tenant/notifications/read-all', { params: { header: orgHeader() } })),
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
