import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api, orgHeader, unwrap } from '@/core/api/client';
import { Permission, useCan, useCanAll } from '@/core/auth/permissions';
import { useSession } from '@/core/auth/session';

import { badgesKey, overviewKey, type TenantOverview } from './today-model';

/** The board refreshes on focus and pull; this poll is only a safety net (the panel's 5 min). */
const POLL_MS = 5 * 60_000;

/**
 * `GET /v1/tenant/overview[?branch=]`: KPIs and today's sections. Any member
 * may call it; each part is `null` without the permission behind it.
 */
export function useOverview(branch: string | null) {
  const org = useSession((s) => s.organization);
  return useQuery<TenantOverview>({
    queryKey: overviewKey(org?.slug, branch),
    enabled: !!org,
    // The previous branch's board stays while another branch loads; never another organization's.
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === org?.slug ? previous : undefined),
    refetchInterval: POLL_MS,
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/v1/tenant/overview', {
          params: {
            header: orgHeader(),
            query: branch ? { branch } : undefined,
          },
          signal,
        }),
      ),
  });
}

/** `GET /v1/tenant/overview/badges`: approval queue and open resolution tasks (panel sidebar counts). */
export function useOverviewBadges() {
  const org = useSession((s) => s.organization);
  const can = useCan();
  const canAll = useCanAll();
  // Same gate as the panel: the approval queue needs read + approve, tasks their read.
  const enabled =
    !!org &&
    (canAll(Permission.TenantReservationsRead, Permission.TenantReservationsApprove) ||
      can(Permission.TenantResolutionTasksRead));
  return useQuery({
    queryKey: badgesKey(org?.slug),
    enabled,
    refetchInterval: POLL_MS,
    queryFn: ({ signal }) => unwrap(api.GET('/v1/tenant/overview/badges', { params: { header: orgHeader() }, signal })),
  });
}

/** Read-only rental summary (`tenant.rentals.read`). */
export function useRentalSummary(uuid: string | undefined) {
  const org = useSession((s) => s.organization);
  return useQuery({
    queryKey: ['tenant', org?.slug ?? '', 'rentals', 'detail', uuid],
    enabled: !!org && !!uuid,
    queryFn: ({ signal }) =>
      unwrap(api.GET('/v1/tenant/rentals/{uuid}', { params: { header: orgHeader(), path: { uuid: uuid! } }, signal })),
  });
}

/**
 * Refetches when the screen comes back into focus (back from a detail, tab
 * switch), not on the first focus: the mount already loads.
 */
export function useRefetchOnFocus(...queries: Pick<UseQueryResult, 'refetch'>[]) {
  const first = useRef(true);
  const latest = useRef(queries);
  useEffect(() => {
    latest.current = queries;
  });
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      for (const q of latest.current) void q.refetch();
    }, []),
  );
}

/** Minute clock for the countdowns (the panel ticks every 30 s). */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
