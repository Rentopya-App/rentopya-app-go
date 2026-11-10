import { type Href, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { useSession } from '@/core/auth/session';
import { WEB_URL } from '@/core/config';

import { linkAction } from './links';

/**
 * Opens a panel link: the app's own screen when there is one (switching the
 * organization first when the record belongs to another membership), else
 * the panel page in the in-app browser ("panelde aç"). Returns false when
 * the link leads nowhere.
 */
export function openPanelLink(href: string | null | undefined): boolean {
  const s = useSession.getState();
  const action = linkAction(href, s.organization?.slug, s.me?.organizations, WEB_URL);
  switch (action.kind) {
    case 'open':
      router.push(action.route as Href);
      return true;
    case 'switch':
      s.selectOrganization(action.slug);
      // The picked organization's screens remount; open the record on top of its home tab.
      setTimeout(() => router.push(action.route as Href), 0);
      return true;
    case 'web':
      void WebBrowser.openBrowserAsync(action.url);
      return true;
    default:
      return false;
  }
}
