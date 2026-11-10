import { useQuery } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { api, orgHeader, unwrap } from '@/core/api/client';
import { Permission, useCan } from '@/core/auth/permissions';
import { useSession } from '@/core/auth/session';
import { queryClient } from '@/core/query';

import { pushAction, pushTarget } from './links';
import { refreshPermission, registerPush, setBadge, usePushPermission, watchTokenChanges } from './push';

const unreadKey = (slug: string | undefined) => ['notifications', 'unread-count', slug] as const;

/** Opens what a tapped push is about (see `links.ts`). */
function open(url: unknown) {
  const session = useSession.getState();
  const action = pushAction(pushTarget(url), session.organization?.slug, session.me?.organizations);
  switch (action.kind) {
    case 'open':
      if (action.route === '/') router.navigate('/');
      else router.push(action.route as Href);
      return;
    case 'switch':
      session.selectOrganization(action.slug);
      // The company screens mount for the new organization first.
      setTimeout(() => {
        if (action.route === '/') router.navigate('/');
        else router.push(action.route as Href);
      }, 0);
      return;
    case 'home':
      router.navigate('/');
  }
}

/**
 * Root listener (rendered once inside the root stack): opens tapped
 * pushes, from a cold start too, once the member is signed in; a push that
 * arrives while the app is open refreshes the unread count.
 */
export function PushNotifications() {
  const status = useSession((s) => s.status);
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
      // The Today board refetches (if mounted) and rewrites the iOS widget / Siri summary.
      void queryClient.invalidateQueries({
        queryKey: ['tenant', useSession.getState().organization?.slug ?? '', 'overview'],
      });
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // Signed out: the tap waits for the sign-in (the response stays the last one).
    if (status !== 'signedIn' || !response) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    Notifications.clearLastNotificationResponse();
    open(response.notification.request.content.data?.url);
  }, [response, status]);

  return null;
}

/**
 * Company shell part (rendered inside `(org)`): asks for the permission
 * and registers the phone once a company is picked (not at launch on a
 * first sign-in), follows token changes and the system setting, and keeps
 * the app badge at the unread count of the organization.
 */
export function PushRegistration() {
  const slug = useSession((s) => s.organization?.slug);
  const granted = usePushPermission((s) => s.status === 'granted');
  const can = useCan();
  const canRead = can(Permission.NotificationsRead);
  const [ready, setReady] = useState(false);

  // A short pause so the prompt does not cover the first frame of the company.
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (ready && slug) void registerPush();
  }, [ready, slug, granted]);

  useEffect(() => watchTokenChanges(), []);

  // The permission may change in the system settings while the app is away.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refreshPermission(false);
    });
    return () => sub.remove();
  }, []);

  const unread = useQuery({
    queryKey: unreadKey(slug),
    enabled: !!slug && canRead,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: () => unwrap(api.GET('/v1/tenant/notifications/unread-count', { params: { header: orgHeader() } })),
  });
  const count = unread.data?.count;
  useEffect(() => {
    if (granted && typeof count === 'number') setBadge(count);
  }, [granted, count]);

  return null;
}
